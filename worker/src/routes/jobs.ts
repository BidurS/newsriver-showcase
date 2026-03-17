// ═══════════════════════════════════════════════════════════════════
// ERC-8183 Jobs Routes — Agentic Commerce integration
// Reads on-chain job state and provides worker-side job management
// ═══════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import { type Env } from '../db/queries';

const jobs = new Hono<{ Bindings: Env }>();

// ── Contract ABI (minimal for reads + events) ───────────────────
const AGENTIC_COMMERCE_ABI = [
    'function getJob(uint256 jobId) view returns (tuple(address client, address provider, address evaluator, address hook, string description, uint256 budget, uint256 expiredAt, uint8 status, bytes32 deliverable))',
    'function getJobCount() view returns (uint256)',
    'function nextJobId() view returns (uint256)',
    'event JobCreated(uint256 indexed jobId, address indexed client, address provider, address evaluator, uint256 expiredAt, string description, address hook)',
    'event JobFunded(uint256 indexed jobId, uint256 amount)',
    'event JobSubmitted(uint256 indexed jobId, bytes32 deliverable)',
    'event JobCompleted(uint256 indexed jobId, bytes32 reason)',
    'event JobRejected(uint256 indexed jobId, bytes32 reason, address indexed rejector)',
    'event JobExpired(uint256 indexed jobId)',
];

// Status enum matches Solidity
const STATUS_LABELS = ['Open', 'Funded', 'Submitted', 'Completed', 'Rejected', 'Expired'] as const;

// Base Mainnet RPC (Alchemy primary, public fallback)
import { rpcCall } from '../services/rpc';

// Contract address — update after deployment
const CONTRACT_ADDRESS = '0xf24225e6bcd8805c3664b3ffe84da8ba610dfca2'; // TODO: update after deploy

// ── eth_call helper ─────────────────────────────────────────────
async function ethCall(to: string, data: string, alchemyKey?: string): Promise<string> {
    const result = await rpcCall('eth_call', [{ to, data }, 'latest'], alchemyKey, 'base');
    return result;
}

// ── Minimal ABI encoding/decoding ───────────────────────────────

function encodeGetJob(jobId: number): string {
    // getJob(uint256) selector = keccak256("getJob(uint256)")[0:4]
    const selector = '0x39c444e6'; // pre-computed
    const paddedId = jobId.toString(16).padStart(64, '0');
    return selector + paddedId;
}

function encodeGetJobCount(): string {
    return '0x6efa47f8'; // keccak256("getJobCount()")[0:4]
}

function decodeAddress(hex: string): string {
    return '0x' + hex.slice(-40);
}

function decodeUint(hex: string): bigint {
    return BigInt('0x' + hex);
}

function decodeJobTuple(data: string) {
    // Remove 0x prefix
    const d = data.slice(2);
    // Each field is 32 bytes (64 hex chars)
    // tuple(address client, address provider, address evaluator, address hook,
    //       string description, uint256 budget, uint256 expiredAt, uint8 status, bytes32 deliverable)
    // Note: string is a dynamic type, so layout uses offsets

    // For the tuple struct in our contract, Solidity ABI-encodes it as:
    // offset to tuple (32 bytes) — we skip this
    const base = 64; // skip the outer tuple offset

    const client = decodeAddress(d.slice(base, base + 64));
    const provider = decodeAddress(d.slice(base + 64, base + 128));
    const evaluator = decodeAddress(d.slice(base + 128, base + 192));
    const hook = decodeAddress(d.slice(base + 192, base + 256));
    // slot 4 = offset to description string (relative to tuple start)
    const descOffset = Number(decodeUint(d.slice(base + 256, base + 320))) * 2;
    const budget = decodeUint(d.slice(base + 320, base + 384));
    const expiredAt = Number(decodeUint(d.slice(base + 384, base + 448)));
    const status = Number(decodeUint(d.slice(base + 448, base + 512)));
    const deliverable = '0x' + d.slice(base + 512, base + 576);

    // Decode description string from offset
    const descLenStart = base + descOffset;
    const descLen = Number(decodeUint(d.slice(descLenStart, descLenStart + 64)));
    const descHex = d.slice(descLenStart + 64, descLenStart + 64 + descLen * 2);
    // Decode hex to string (Workers-compatible — no Buffer)
    const descBytes = new Uint8Array(descLen);
    for (let i = 0; i < descLen; i++) {
        descBytes[i] = parseInt(descHex.slice(i * 2, i * 2 + 2), 16);
    }
    const description = new TextDecoder().decode(descBytes);

    return {
        client,
        provider,
        evaluator,
        hook,
        description,
        budget: budget.toString(),
        budget_usdc: Number(budget) / 1e6,
        expiredAt,
        expiredAt_iso: new Date(expiredAt * 1000).toISOString(),
        status: STATUS_LABELS[status] || 'Unknown',
        status_code: status,
        deliverable,
    };
}

// ── Routes ──────────────────────────────────────────────────────

// GET /api/jobs/contract — Contract info
jobs.get('/contract', (c) => {
    return c.json({
        address: CONTRACT_ADDRESS,
        network: 'base',
        chain_id: 8453,
        payment_token: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
        payment_token_symbol: 'USDC',
        payment_token_decimals: 6,
        treasury: '0xEae03EB54eB26B38057544895E834aF42fc46A69',
        fee_bps: 25,
        standard: 'ERC-8183',
        abi: AGENTIC_COMMERCE_ABI,
    });
});

// GET /api/jobs/count — Total jobs created
jobs.get('/count', async (c) => {
    try {
        const result = await ethCall(CONTRACT_ADDRESS, encodeGetJobCount(), c.env.ALCHEMY_API_KEY);
        const count = Number(decodeUint(result.slice(2)));
        return c.json({ count });
    } catch (err: any) {
        return c.json({ count: 0, note: 'Contract not yet deployed', error: err.message });
    }
});

// GET /api/jobs/intents — List AskRiver queries logged as job intents
jobs.get('/intents', async (c) => {
    const limit = Math.min(parseInt(c.req.query('limit') || '20'), 50);
    const status = c.req.query('status'); // pending, created, funded, completed

    try {
        let query = 'SELECT * FROM job_intents';
        const bindings: any[] = [];

        if (status) {
            query += ' WHERE status = ?';
            bindings.push(status);
        }
        query += ' ORDER BY created_at DESC LIMIT ?';
        bindings.push(limit);

        const results = await c.env.DB.prepare(query).bind(...bindings).all();

        return c.json({
            intents: results.results || [],
            total: results.results?.length || 0,
            note: 'Each intent represents an AskRiver query → potential ERC-8183 job',
        });
    } catch (err: any) {
        return c.json({ intents: [], error: err.message }, 500);
    }
});

// GET /api/jobs/intents/stats — Job intent pipeline stats
jobs.get('/intents/stats', async (c) => {
    try {
        const stats = await c.env.DB.prepare(`
            SELECT 
                status,
                COUNT(*) as count,
                AVG(sources_analyzed) as avg_sources
            FROM job_intents
            GROUP BY status
        `).all();

        const total = await c.env.DB.prepare('SELECT COUNT(*) as total FROM job_intents').first<{ total: number }>();

        return c.json({
            total_intents: total?.total || 0,
            by_status: stats.results || [],
            pipeline: 'AskRiver query → Job Intent → ERC-8183 on-chain job',
            contract: CONTRACT_ADDRESS,
        });
    } catch (err: any) {
        return c.json({ error: err.message }, 500);
    }
});

// ── Agent Treasury — Financial summary ──────────────────────────

const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const AUTONOMOUS_AGENT_ID = 2; // NewsRiver Sentinel

jobs.get('/treasury', async (c) => {
    try {
        // 0. Resolve agent wallet from Privy DB
        let agentWallet = '0x0000000000000000000000000000000000000000';
        try {
            const pw = await c.env.DB.prepare(
                'SELECT address FROM privy_wallets WHERE agent_id = ?'
            ).bind(AUTONOMOUS_AGENT_ID).first<{ address: string }>();
            if (pw) agentWallet = pw.address;
        } catch { }

        // 1. Get USDC balance
        const paddedAddr = agentWallet.slice(2).toLowerCase().padStart(64, '0');
        const balData = '0x70a08231' + paddedAddr;
        let balance = 0;
        try {
            const balResult = await ethCall(USDC_ADDRESS, balData, c.env.ALCHEMY_API_KEY);
            balance = parseInt(balResult, 16) / 1e6;
        } catch { /* fallback to 0 */ }

        // 2. Get recent decisions from D1
        let decisions: any[] = [];
        let totalDecisions = 0;
        let totalAllocated = 0;
        try {
            const recentRes = await c.env.DB.prepare(`
                SELECT * FROM agent_decisions
                ORDER BY created_at DESC
                LIMIT 10
            `).all();
            decisions = recentRes.results || [];

            const statsRes = await c.env.DB.prepare(`
                SELECT
                    COUNT(*) as total_decisions,
                    COALESCE(SUM(CASE WHEN status IN ('logged','executed','executing') AND decision_type = 'job_creation' THEN amount_allocated ELSE 0 END), 0) as total_allocated
                FROM agent_decisions
            `).first<{ total_decisions: number; total_allocated: number }>();
            totalDecisions = statsRes?.total_decisions || 0;
            totalAllocated = statsRes?.total_allocated || 0;
        } catch { /* table may not exist yet */ }

        // 3. Get x402 revenue estimate
        let paidRequests = 0;
        try {
            const revRes = await c.env.DB.prepare(`
                SELECT COUNT(*) as cnt
                FROM api_usage_log
                WHERE created_at >= datetime('now', '-24 hours')
                  AND payment_method = 'x402'
            `).first<{ cnt: number }>();
            paidRequests = revRes?.cnt || 0;
        } catch { /* table may not exist */ }

        // 4. Get intent count
        let totalIntents = 0;
        try {
            const intentRes = await c.env.DB.prepare(`SELECT COUNT(*) as cnt FROM job_intents`).first<{ cnt: number }>();
            totalIntents = intentRes?.cnt || 0;
        } catch { }

        return c.json({
            agent: {
                name: 'NewsRiver Intelligence',
                wallet: agentWallet,
                identity: 'ERC-8004 (Base Mainnet)',
                status: 'autonomous',
            },
            treasury: {
                balance_usdc: parseFloat(balance.toFixed(6)),
                estimated_24h_revenue: parseFloat((paidRequests * 0.005).toFixed(4)),
                total_allocated: parseFloat(totalAllocated.toFixed(4)),
                paid_requests_24h: paidRequests,
            },
            autonomy: {
                total_decisions: totalDecisions,
                total_intents: totalIntents,
                recent_decisions: decisions,
                loop_interval: 'hourly',
                min_balance_threshold: 0.50,
            },
            contract: CONTRACT_ADDRESS,
        });
    } catch (err: any) {
        return c.json({ error: err.message }, 500);
    }
});

// ── Agent Decisions — Autonomous decision log ───────────────────

jobs.get('/treasury/decisions', async (c) => {
    const limit = Math.min(parseInt(c.req.query('limit') || '20'), 100);
    const type = c.req.query('type');

    try {
        let query = 'SELECT * FROM agent_decisions';
        const params: any[] = [];

        if (type) {
            query += ' WHERE decision_type = ?';
            params.push(type);
        }

        query += ' ORDER BY created_at DESC LIMIT ?';
        params.push(limit);

        const result = await c.env.DB.prepare(query).bind(...params).all();

        return c.json({
            decisions: result.results || [],
            total: result.results?.length || 0,
            filters: { type, limit },
        });
    } catch (err: any) {
        return c.json({
            decisions: [],
            total: 0,
            note: 'Agent decisions table not yet initialized',
        });
    }
});

// GET /api/jobs/:id — Read a specific job's on-chain state
jobs.get('/:id', async (c) => {
    const id = parseInt(c.req.param('id'));
    if (isNaN(id)) return c.json({ error: 'Invalid job ID' }, 400);

    try {
        const result = await ethCall(CONTRACT_ADDRESS, encodeGetJob(id), c.env.ALCHEMY_API_KEY);
        const job = decodeJobTuple(result);

        return c.json({
            job_id: id,
            contract: CONTRACT_ADDRESS,
            chain: 'base',
            ...job,
            basescan_url: `https://basescan.org/address/${CONTRACT_ADDRESS}`,
        });
    } catch (err: any) {
        return c.json({ error: 'Failed to read job', details: err.message }, 500);
    }
});

// GET /api/jobs — List recent jobs (reads on-chain sequentially up to limit)
jobs.get('/', async (c) => {
    const limit = Math.min(parseInt(c.req.query('limit') || '10'), 20);

    try {
        const countResult = await ethCall(CONTRACT_ADDRESS, encodeGetJobCount(), c.env.ALCHEMY_API_KEY);
        const totalJobs = Number(decodeUint(countResult.slice(2)));

        if (totalJobs === 0) {
            return c.json({
                jobs: [],
                total: 0,
                contract: CONTRACT_ADDRESS,
                note: totalJobs === 0 ? 'No jobs created yet' : undefined,
            });
        }

        const start = Math.max(0, totalJobs - limit);
        const jobPromises = [];
        for (let i = totalJobs - 1; i >= start; i--) {
            jobPromises.push(
                ethCall(CONTRACT_ADDRESS, encodeGetJob(i), c.env.ALCHEMY_API_KEY)
                    .then(result => ({ job_id: i, ...decodeJobTuple(result) }))
                    .catch(() => null)
            );
        }

        const results = (await Promise.all(jobPromises)).filter(Boolean);

        return c.json({
            jobs: results,
            total: totalJobs,
            showing: results.length,
            contract: CONTRACT_ADDRESS,
        });
    } catch (err: any) {
        return c.json({
            jobs: [],
            total: 0,
            contract: CONTRACT_ADDRESS,
            note: 'Contract not yet deployed or no jobs exist',
            error: err.message,
        });
    }
});

export default jobs;

