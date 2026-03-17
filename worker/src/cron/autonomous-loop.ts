// ═══════════════════════════════════════════════════════════════════
// Autonomous Intelligence Loop — Self-Funding Agent with On-Chain Execution
// Runs hourly: checks wallet, finds trending topics, creates on-chain jobs via Privy
// ═══════════════════════════════════════════════════════════════════

import { type Env } from '../db/queries';
import { createPrivyService, SUPPORTED_CHAINS } from '../services/privy-wallet';
import { rpcCall } from '../services/rpc';

// Base Mainnet USDC contract
const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

// AgenticCommerce contract on Base
const CONTRACT_ADDRESS = '0xf24225e6bcd8805c3664b3ffe84da8ba610dfca2';

// Which agent ID to use for autonomous operations (NewsRiver Sentinel)
const AUTONOMOUS_AGENT_ID = 2;

// Thresholds
const MIN_BALANCE_USDC = 0.50;  // Minimum balance to trigger autonomous spending
const MIN_QUERY_COUNT = 1;       // Minimum queries on a topic to consider it trending (lowered for automated activity)
const LOOKBACK_HOURS = 6;        // Hours to look back for trending topics

// ── Get agent wallet from Privy DB ──────────────────────────────
async function getAgentWallet(db: D1Database): Promise<{ address: string; wallet_id: string } | null> {
    const wallet = await db.prepare(
        'SELECT address, wallet_id FROM privy_wallets WHERE agent_id = ?'
    ).bind(AUTONOMOUS_AGENT_ID).first<{ address: string; wallet_id: string }>();
    return wallet || null;
}

// ── Check USDC balance via eth_call (Alchemy primary, public fallback) ──
async function getUSDCBalance(walletAddress: string, alchemyKey?: string): Promise<number> {
    // balanceOf(address) selector = 0x70a08231
    const paddedAddress = walletAddress.slice(2).toLowerCase().padStart(64, '0');
    const calldata = '0x70a08231' + paddedAddress;

    try {
        const result = await rpcCall(
            'eth_call',
            [{ to: USDC_ADDRESS, data: calldata }, 'latest'],
            alchemyKey,
            'base'
        );
        if (!result || result === '0x') return 0;
        return parseInt(result, 16) / 1e6;
    } catch {
        return 0;
    }
}

// ── Find trending topic from recent AskRiver queries ────────────
async function findTrendingTopic(db: D1Database): Promise<{ topic: string; count: number } | null> {
    try {
        const result = await db.prepare(`
            SELECT query, COUNT(*) as cnt
            FROM job_intents
            WHERE created_at >= datetime('now', '-${LOOKBACK_HOURS} hours')
            GROUP BY LOWER(TRIM(query))
            ORDER BY cnt DESC
            LIMIT 1
        `).first<{ query: string; cnt: number }>();

        if (result && result.cnt >= MIN_QUERY_COUNT) {
            return { topic: result.query, count: result.cnt };
        }
        return null;
    } catch {
        // job_intents table may not exist yet
        return null;
    }
}

// ── Get recent x402 revenue from analytics ──────────────────────
async function getRecentRevenue(db: D1Database): Promise<number> {
    try {
        const result = await db.prepare(`
            SELECT COUNT(*) as paid_requests
            FROM api_usage_log
            WHERE created_at >= datetime('now', '-24 hours')
              AND payment_method = 'x402'
        `).first<{ paid_requests: number }>();
        // Estimate revenue: avg $0.005 per x402 request
        return (result?.paid_requests || 0) * 0.005;
    } catch {
        return 0;
    }
}

// ── Encode createJob calldata ───────────────────────────────────
// createJob(address provider, address evaluator, uint256 expiredAt, string description, address hook)
// Selector: keccak256("createJob(address,address,uint256,string,address)")[0:4]
function encodeCreateJob(evaluator: string, expiredAt: number, description: string): string {
    // Function selector for createJob(address,address,uint256,string,address)
    const selector = '0x41528812';

    // provider = address(0) — open job, anyone can claim
    const provider = '0000000000000000000000000000000000000000'.padStart(64, '0');

    // evaluator = the agent's own address (self-evaluate)
    const evalAddr = evaluator.slice(2).toLowerCase().padStart(64, '0');

    // expiredAt as uint256
    const expiry = expiredAt.toString(16).padStart(64, '0');

    // hook = address(0)
    const hook = '0000000000000000000000000000000000000000'.padStart(64, '0');

    // string encoding: offset to data, then length + padded content
    // String is the 4th param (index 3), offset = 5 * 32 = 160 = 0xa0
    const stringOffset = (5 * 32).toString(16).padStart(64, '0');

    // Encode the string: length + padded bytes
    const descBytes = new TextEncoder().encode(description);
    const descLen = descBytes.length.toString(16).padStart(64, '0');

    // Pad description to 32-byte boundary
    let descHex = '';
    for (const b of descBytes) {
        descHex += b.toString(16).padStart(2, '0');
    }
    const paddedDescLen = Math.ceil(descBytes.length / 32) * 64;
    descHex = descHex.padEnd(paddedDescLen, '0');

    return selector + provider + evalAddr + expiry + stringOffset + hook + descLen + descHex;
}

// ── Main autonomous loop handler ────────────────────────────────
export async function handleAutonomousLoop(env: Env): Promise<void> {
    const startTime = Date.now();
    console.log('[AUTONOMOUS] 🧠 Starting autonomous intelligence loop...');

    try {
        // Step 0: Get agent's Privy wallet
        const agentWallet = await getAgentWallet(env.DB);
        const walletAddress = agentWallet?.address || '0x0000000000000000000000000000000000000000';
        const walletId = agentWallet?.wallet_id;

        if (!agentWallet) {
            console.log('[AUTONOMOUS] ⚠️ No Privy wallet found for autonomous agent');
        }

        // Step 1: Check wallet balance
        const balance = await getUSDCBalance(walletAddress, env.ALCHEMY_API_KEY);
        console.log(`[AUTONOMOUS] 💰 Wallet balance: $${balance.toFixed(4)} USDC (${walletAddress.slice(0, 10)}...)`);

        // Step 2: Find trending topic
        const trending = await findTrendingTopic(env.DB);
        const revenue = await getRecentRevenue(env.DB);

        // Step 3: Decision logic
        const hasBudget = balance >= MIN_BALANCE_USDC;
        const hasTopic = trending !== null;

        if (hasBudget && hasTopic && walletId) {
            // Agent decides to create an on-chain job
            const allocation = Math.min(0.50, balance * 0.3);
            const expiredAt = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60; // 7 days
            const description = `[AUTO] Intelligence research: ${trending!.topic} — ${trending!.count} queries in ${LOOKBACK_HOURS}h`;

            const reasoning = `Detected trending topic "${trending!.topic}" with ${trending!.count} queries in ${LOOKBACK_HOURS}h. ` +
                `Wallet balance $${balance.toFixed(2)} USDC exceeds threshold. ` +
                `Creating on-chain job via Privy signing. ` +
                `24h revenue: $${revenue.toFixed(4)}.`;

            // Log decision as "executing"
            const insertResult = await env.DB.prepare(`
                INSERT INTO agent_decisions (decision_type, topic, reasoning, wallet_balance_usdc, amount_allocated, status, query_count)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `).bind(
                'job_creation',
                trending!.topic,
                reasoning,
                balance,
                allocation,
                'executing',
                trending!.count
            ).run();

            const decisionId = insertResult.meta?.last_row_id;

            // Encode and send the createJob transaction via Privy
            try {
                const service = createPrivyService(env);
                if (!service) {
                    throw new Error('Privy service not configured');
                }

                const calldata = encodeCreateJob(walletAddress, expiredAt, description);

                console.log(`[AUTONOMOUS] 📡 Sending createJob tx via Privy...`);
                const result = await service.signAndSendTransaction(
                    walletId,
                    SUPPORTED_CHAINS.BASE.id,
                    {
                        to: CONTRACT_ADDRESS,
                        data: calldata,
                        value: '0x0',
                    }
                );

                if (result.success) {
                    console.log(`[AUTONOMOUS] ✅ Job created on-chain! TX: ${result.tx_hash}`);
                    // Update decision with tx hash
                    await env.DB.prepare(`
                        UPDATE agent_decisions SET status = 'executed', job_id = ? WHERE id = ?
                    `).bind(result.tx_hash, decisionId).run();
                } else {
                    console.log(`[AUTONOMOUS] ❌ TX failed: ${result.error}`);
                    await env.DB.prepare(`
                        UPDATE agent_decisions SET status = 'failed', job_id = ? WHERE id = ?
                    `).bind(result.error || 'unknown error', decisionId).run();
                }
            } catch (txError: any) {
                console.error(`[AUTONOMOUS] ❌ Privy signing error:`, txError.message);
                await env.DB.prepare(`
                    UPDATE agent_decisions SET status = 'failed', job_id = ? WHERE id = ?
                `).bind(`signing_error: ${txError.message}`, decisionId).run();
            }

        } else if (hasBudget && hasTopic && !walletId) {
            // Has budget and topic but no Privy wallet — log only
            const reasoning = `Trending topic "${trending!.topic}" (${trending!.count} queries) and sufficient balance $${balance.toFixed(2)}, ` +
                `but no Privy wallet configured for signing. Decision logged without on-chain execution.`;

            await env.DB.prepare(`
                INSERT INTO agent_decisions (decision_type, topic, reasoning, wallet_balance_usdc, amount_allocated, status, query_count)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `).bind('job_creation', trending!.topic, reasoning, balance, 0, 'logged', trending!.count).run();

            console.log(`[AUTONOMOUS] ⚠️ No Privy wallet — decision logged only`);

        } else if (hasTopic && !hasBudget) {
            // Topic found but insufficient funds
            const reasoning = `Trending topic "${trending!.topic}" detected (${trending!.count} queries) ` +
                `but wallet balance $${balance.toFixed(2)} below threshold $${MIN_BALANCE_USDC}. ` +
                `Waiting for more x402 revenue. 24h revenue: $${revenue.toFixed(4)}.`;

            await env.DB.prepare(`
                INSERT INTO agent_decisions (decision_type, topic, reasoning, wallet_balance_usdc, amount_allocated, status, query_count)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `).bind('budget_allocation', trending!.topic, reasoning, balance, 0, 'skipped', trending!.count).run();

            console.log(`[AUTONOMOUS] ⏳ Skipped: insufficient balance ($${balance.toFixed(2)})`);

        } else {
            // Heartbeat — log that the agent checked and found nothing actionable
            const reasoning = hasBudget
                ? `Balance healthy ($${balance.toFixed(2)}) but no trending topics detected in ${LOOKBACK_HOURS}h window. Agent idle.`
                : `Low balance ($${balance.toFixed(2)}) and no trending topics. Agent conserving resources. 24h revenue: $${revenue.toFixed(4)}.`;

            await env.DB.prepare(`
                INSERT INTO agent_decisions (decision_type, topic, reasoning, wallet_balance_usdc, amount_allocated, status, query_count)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `).bind('heartbeat', null, reasoning, balance, 0, 'logged', 0).run();

            console.log(`[AUTONOMOUS] 💤 Heartbeat: no action needed`);
        }

        const elapsed = Date.now() - startTime;
        console.log(`[AUTONOMOUS] 🏁 Loop completed in ${elapsed}ms`);

    } catch (error) {
        console.error('[AUTONOMOUS] ❌ Error in autonomous loop:', error);
    }
}
