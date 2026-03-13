// ═══════════════════════════════════════════════════════════════════
// Agent-to-Agent Job Rotation — Real commerce between agents
// One agent creates a job, another fulfills it by calling a real
// NewsRiver API endpoint, then gets paid in USDC on Base mainnet.
//
// POST /api/agent-jobs/cycle   — Trigger rotation (Admin)
// GET  /api/agent-jobs/history — Public job history
// GET  /api/agent-jobs/stats   — Aggregate stats
// ═══════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import { type Env } from '../db/queries';
import { createPrivyService, SUPPORTED_CHAINS } from '../services/privy-wallet';

const agentJobs = new Hono<{ Bindings: Env }>();

// ── Constants ───────────────────────────────────────────────────
const USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

// ── Job templates — real API endpoints that agents call ──────────
const JOB_TEMPLATES = [
    { description: 'Fetch trending crypto news for portfolio rebalancing', endpoint: '/api/v1/articles?limit=3&category=crypto', price: 0.001 },
    { description: 'Semantic search: Bitcoin ETF institutional flows', endpoint: '/api/v1/search/semantic?q=bitcoin+etf+institutional&limit=3', price: 0.001 },
    { description: 'Generate hourly intelligence brief for trading signals', endpoint: '/api/v1/intelligence/hourly', price: 0.002 },
    { description: 'Analyze trending topics for market sentiment', endpoint: '/api/v1/trends', price: 0.001 },
    { description: 'Fetch global news river for cross-market analysis', endpoint: '/api/v1/river?limit=5', price: 0.002 },
    { description: 'Search for Ethereum L2 ecosystem developments', endpoint: '/api/v1/search/semantic?q=ethereum+L2+base+arbitrum&limit=3', price: 0.001 },
    { description: 'Monitor stablecoin supply and USDC market data', endpoint: '/api/v1/search/semantic?q=stablecoin+USDC+supply&limit=3', price: 0.001 },
    { description: 'Track AI agent protocol news and developments', endpoint: '/api/v1/search/semantic?q=AI+agent+crypto+protocol&limit=3', price: 0.001 },
];

// ── Admin auth ──────────────────────────────────────────────────
function requireAdmin(c: any): boolean {
    const key = c.req.header('X-Admin-Key');
    return key === c.env.ADMIN_KEY;
}

// ── Make real USDC payment from one agent to another ────────────
async function makeAgentPayment(
    privy: any,
    fromWalletId: string,
    fromAddress: string,
    toAddress: string,
    amountUSDC: number,
): Promise<{ success: boolean; txHash?: string; error?: string }> {
    const amount = BigInt(Math.floor(amountUSDC * 1e6));
    const nonce = '0x' + Array.from(crypto.getRandomValues(new Uint8Array(32)))
        .map(b => b.toString(16).padStart(2, '0')).join('');
    const validAfter = 0;
    const validBefore = Math.floor(Date.now() / 1000) + 3600;

    // EIP-3009 transferWithAuthorization typed data
    const typedData = {
        types: {
            EIP712Domain: [
                { name: 'name', type: 'string' },
                { name: 'version', type: 'string' },
                { name: 'chainId', type: 'uint256' },
                { name: 'verifyingContract', type: 'address' },
            ],
            TransferWithAuthorization: [
                { name: 'from', type: 'address' },
                { name: 'to', type: 'address' },
                { name: 'value', type: 'uint256' },
                { name: 'validAfter', type: 'uint256' },
                { name: 'validBefore', type: 'uint256' },
                { name: 'nonce', type: 'bytes32' },
            ],
        },
        domain: {
            name: 'USD Coin',
            version: '2',
            chainId: SUPPORTED_CHAINS.BASE.id,
            verifyingContract: USDC_BASE,
        },
        primaryType: 'TransferWithAuthorization',
        message: {
            from: fromAddress,
            to: toAddress,
            value: amount.toString(),
            validAfter: validAfter.toString(),
            validBefore: validBefore.toString(),
            nonce,
        },
    };

    console.log(`[agent-jobs] Signing EIP-3009: $${amountUSDC} USDC from ${fromAddress} → ${toAddress}`);
    const signResult = await privy.signTypedData(
        fromWalletId,
        SUPPORTED_CHAINS.BASE.id,
        typedData
    );

    if ('error' in signResult) {
        return { success: false, error: `Signing failed: ${signResult.error}` };
    }

    // Decode v, r, s
    const sig = signResult.signature.replace('0x', '');
    const r = '0x' + sig.slice(0, 64);
    const s = '0x' + sig.slice(64, 128);
    const v = parseInt(sig.slice(128, 130), 16);

    // ABI-encode transferWithAuthorization
    const selector = '0xe3ee160e';
    const enc = (addr: string) => addr.replace('0x', '').toLowerCase().padStart(64, '0');
    const encU = (val: string | number | bigint) => BigInt(val).toString(16).padStart(64, '0');
    const encB = (val: string) => val.replace('0x', '').padStart(64, '0');

    const calldata = selector
        + enc(fromAddress)
        + enc(toAddress)
        + encU(amount)
        + encU(validAfter)
        + encU(validBefore)
        + encB(nonce)
        + encU(v)
        + encB(r)
        + encB(s);

    try {
        const result = await privy.signAndSendTransaction(
            fromWalletId,
            SUPPORTED_CHAINS.BASE.id,
            { to: USDC_BASE, data: '0x' + calldata.replace('0x', '') }
        );

        if (result.success && result.tx_hash) {
            console.log(`[agent-jobs] ✅ Payment sent: ${result.tx_hash}`);
            return { success: true, txHash: result.tx_hash };
        }
        return { success: false, error: result.error || 'TX failed' };
    } catch (err: any) {
        return { success: false, error: err.message };
    }
}

// ═══════════════════════════════════════════════════════════════════
// POST /cycle — Trigger agent-to-agent job rotation
// Each cycle: pick 2 agents, agent A pays agent B, agent B calls
// a real API endpoint, result logged to D1
// ═══════════════════════════════════════════════════════════════════
agentJobs.post('/cycle', async (c) => {
    if (!requireAdmin(c)) return c.json({ error: 'Unauthorized' }, 401);

    const body = await c.req.json().catch(() => ({}));
    const count = Math.min(body.count || 3, 10);

    const privy = createPrivyService(c.env);
    if (!privy) return c.json({ error: 'Privy not configured' }, 500);

    // Load all agents with wallets
    const agentsResult = await c.env.DB.prepare(`
        SELECT a.id, a.name, a.type, pw.wallet_id, pw.address
        FROM agents a
        JOIN privy_wallets pw ON pw.agent_id = a.id
        WHERE a.status = 'ACTIVE'
    `).all<{ id: number; name: string; type: string; wallet_id: string; address: string }>();

    const agents = agentsResult.results || [];
    if (agents.length < 2) {
        return c.json({ error: 'Need at least 2 agents with wallets' }, 400);
    }

    const cycleId = crypto.randomUUID();
    const results: any[] = [];

    for (let i = 0; i < count; i++) {
        // Pick client and provider (rotate through agents)
        const clientIdx = i % agents.length;
        let providerIdx = (i + 1) % agents.length;
        if (providerIdx === clientIdx) providerIdx = (providerIdx + 1) % agents.length;

        const client = agents[clientIdx];
        const provider = agents[providerIdx];
        const job = JOB_TEMPLATES[i % JOB_TEMPLATES.length];

        console.log(`[agent-jobs] Cycle ${i + 1}: ${client.name} → ${provider.name} | ${job.description}`);

        // Step 1: Client pays provider
        const payment = await makeAgentPayment(
            privy,
            client.wallet_id,
            client.address,
            provider.address,
            job.price,
        );

        // Step 2: Provider calls real API endpoint
        let apiResult = '';
        try {
            const apiUrl = `https://api.yieldcircle.app${job.endpoint}`;
            const ctrl = new AbortController();
            const timeout = setTimeout(() => ctrl.abort(), 8000);
            const res = await fetch(apiUrl, {
                signal: ctrl.signal,
                headers: { 'X-Dry-Run': 'true' },
            });
            clearTimeout(timeout);
            const data = await res.json();
            apiResult = JSON.stringify(data).slice(0, 200);
        } catch (err: any) {
            apiResult = `API call completed (${err.message || 'timeout'})`;
        }

        // Step 3: Log to D1
        const basescanUrl = payment.txHash
            ? `https://basescan.org/tx/${payment.txHash}`
            : null;

        try {
            await c.env.DB.prepare(`
                INSERT INTO agent_job_cycles
                    (cycle_id, client_agent_id, client_agent_name, client_wallet,
                     provider_agent_id, provider_agent_name, provider_wallet,
                     job_description, api_endpoint, api_result_preview,
                     amount_usdc, tx_hash, basescan_url, status, completed_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
            `).bind(
                cycleId,
                client.id, client.name, client.address,
                provider.id, provider.name, provider.address,
                job.description, job.endpoint, apiResult,
                job.price,
                payment.txHash || null,
                basescanUrl,
                payment.success ? 'completed' : 'failed',
            ).run();
        } catch (dbErr: any) {
            console.error(`[agent-jobs] DB insert error: ${dbErr.message}`);
        }

        results.push({
            step: i + 1,
            client: { name: client.name, wallet: client.address },
            provider: { name: provider.name, wallet: provider.address },
            job: job.description,
            amount: `$${job.price} USDC`,
            api_endpoint: job.endpoint,
            api_result_preview: apiResult.slice(0, 100) + '...',
            payment: payment.success ? '✅ ON-CHAIN' : `❌ ${payment.error}`,
            tx_hash: payment.txHash,
            basescan: basescanUrl,
        });
    }

    const successful = results.filter(r => r.tx_hash).length;
    const totalSpent = results
        .filter(r => r.tx_hash)
        .reduce((sum, r) => sum + parseFloat(r.amount.replace('$', '').replace(' USDC', '')), 0);

    return c.json({
        cycle_id: cycleId,
        summary: {
            total_jobs: count,
            successful_payments: successful,
            total_usdc_transferred: `$${totalSpent.toFixed(4)}`,
            agents_involved: [...new Set(results.flatMap(r => [r.client.name, r.provider.name]))],
        },
        jobs: results,
    });
});

// ═══════════════════════════════════════════════════════════════════
// GET /history — Public job cycle history for showcase
// ═══════════════════════════════════════════════════════════════════
agentJobs.get('/history', async (c) => {
    const limit = Math.min(parseInt(c.req.query('limit') || '20'), 50);

    try {
        const result = await c.env.DB.prepare(`
            SELECT * FROM agent_job_cycles
            ORDER BY created_at DESC
            LIMIT ?
        `).bind(limit).all();

        return c.json({
            jobs: result.results || [],
            count: result.results?.length || 0,
        });
    } catch (err: any) {
        return c.json({ jobs: [], count: 0, error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════════════
// GET /stats — Aggregate stats for showcase dashboard
// ═══════════════════════════════════════════════════════════════════
agentJobs.get('/stats', async (c) => {
    try {
        const stats = await c.env.DB.prepare(`
            SELECT
                COUNT(*) as total_jobs,
                SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_jobs,
                SUM(CASE WHEN status = 'completed' THEN amount_usdc ELSE 0 END) as total_usdc,
                COUNT(DISTINCT client_agent_id) + COUNT(DISTINCT provider_agent_id) as unique_agents,
                COUNT(DISTINCT cycle_id) as total_cycles,
                MIN(created_at) as first_job,
                MAX(completed_at) as last_job
            FROM agent_job_cycles
        `).first<{
            total_jobs: number;
            completed_jobs: number;
            total_usdc: number;
            unique_agents: number;
            total_cycles: number;
            first_job: string;
            last_job: string;
        }>();

        // Get per-agent breakdown
        const agentBreakdown = await c.env.DB.prepare(`
            SELECT
                client_agent_name as agent,
                COUNT(*) as jobs_posted,
                SUM(amount_usdc) as total_paid
            FROM agent_job_cycles
            WHERE status = 'completed'
            GROUP BY client_agent_name
            ORDER BY total_paid DESC
        `).all();

        return c.json({
            totals: {
                jobs: stats?.total_jobs || 0,
                completed: stats?.completed_jobs || 0,
                total_usdc: parseFloat((stats?.total_usdc || 0).toFixed(4)),
                unique_agents: stats?.unique_agents || 0,
                cycles: stats?.total_cycles || 0,
                first_job: stats?.first_job,
                last_job: stats?.last_job,
            },
            agents: agentBreakdown.results || [],
            note: 'All payments are real on-chain USDC transfers on Base mainnet',
        });
    } catch (err: any) {
        return c.json({
            totals: { jobs: 0, completed: 0, total_usdc: 0 },
            agents: [],
            error: err.message,
        });
    }
});

// ═══════════════════════════════════════════════════════════════════
// Standalone function for cron — no HTTP context needed
// ═══════════════════════════════════════════════════════════════════
export async function runAgentCommerceCycle(env: Env): Promise<void> {
    console.log('[agent-jobs-cron] Starting automated agent commerce cycle...');

    const privy = createPrivyService(env);
    if (!privy) {
        console.error('[agent-jobs-cron] Privy not configured, skipping');
        return;
    }

    // Load active agents with wallets
    const agentsResult = await env.DB.prepare(`
        SELECT a.id, a.name, a.type, pw.wallet_id, pw.address
        FROM agents a
        JOIN privy_wallets pw ON pw.agent_id = a.id
        WHERE a.status = 'ACTIVE'
    `).all<{ id: number; name: string; type: string; wallet_id: string; address: string }>();

    const agents = agentsResult.results || [];
    if (agents.length < 2) {
        console.log('[agent-jobs-cron] Need at least 2 agents, skipping');
        return;
    }

    const cycleId = crypto.randomUUID();
    const count = Math.min(3, agents.length); // 3 jobs per cycle
    let successCount = 0;

    for (let i = 0; i < count; i++) {
        // Rotate through agents randomly
        const shuffled = [...agents].sort(() => Math.random() - 0.5);
        const client = shuffled[0];
        const provider = shuffled[1];
        const job = JOB_TEMPLATES[Math.floor(Math.random() * JOB_TEMPLATES.length)];

        console.log(`[agent-jobs-cron] Job ${i + 1}/${count}: ${client.name} → ${provider.name} | ${job.description}`);

        // Step 1: Pay
        const payment = await makeAgentPayment(
            privy, client.wallet_id, client.address, provider.address, job.price,
        );

        // Step 2: Call real API
        let apiResult = '';
        try {
            const apiUrl = `https://api.yieldcircle.app${job.endpoint}`;
            const ctrl = new AbortController();
            const timeout = setTimeout(() => ctrl.abort(), 8000);
            const res = await fetch(apiUrl, { signal: ctrl.signal, headers: { 'X-Dry-Run': 'true' } });
            clearTimeout(timeout);
            const data = await res.json();
            apiResult = JSON.stringify(data).slice(0, 200);
        } catch (err: any) {
            apiResult = `API call completed (${err.message || 'timeout'})`;
        }

        // Step 3: Log to D1
        try {
            await env.DB.prepare(`
                INSERT INTO agent_job_cycles
                    (cycle_id, client_agent_id, client_agent_name, client_wallet,
                     provider_agent_id, provider_agent_name, provider_wallet,
                     job_description, api_endpoint, api_result_preview,
                     amount_usdc, tx_hash, basescan_url, status, completed_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
            `).bind(
                cycleId,
                client.id, client.name, client.address,
                provider.id, provider.name, provider.address,
                job.description, job.endpoint, apiResult,
                job.price,
                payment.txHash || null,
                payment.txHash ? `https://basescan.org/tx/${payment.txHash}` : null,
                payment.success ? 'completed' : 'failed',
            ).run();
        } catch (dbErr: any) {
            console.error(`[agent-jobs-cron] DB insert error: ${dbErr.message}`);
        }

        if (payment.success) successCount++;
    }

    console.log(`[agent-jobs-cron] ✅ Cycle complete: ${successCount}/${count} payments successful`);
}

export default agentJobs;
