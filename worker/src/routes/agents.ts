// ═══════════════════════════════════════════════════════════════════
// Agent API Routes — Agent fleet management and performance
// ═══════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import { type Env } from '../db/queries';
import { getConsensusSnapshot } from '../services/consensus-engine';

const agents = new Hono<{ Bindings: Env }>();

// GET /api/agents — List user's agents with status and cached performance
agents.get('/', async (c) => {
    const user = c.get('firebaseUser') as any;
    const userId = user?.uid;

    if (!userId) {
        return c.json({ error: 'Unauthorized' }, 401);
    }

    const result = await c.env.DB.prepare(`
        SELECT id, name, type, status, assets, config, risk_config, performance, description,
               created_at, updated_at
        FROM agents 
        WHERE user_id = ? OR (user_id IS NULL AND status = 'ACTIVE')
        ORDER BY id ASC
    `).bind(userId).all();

    const agentList = (result.results || []).map((a: any) => ({
        ...a,
        config: safeParseJSON(a.config),
        risk_config: safeParseJSON(a.risk_config),
        performance: safeParseJSON(a.performance),
    }));

    // Fleet summary from cache
    const fleetSummary = await c.env.CACHE.get(`fleet:summary:${userId}`);

    return c.json({
        count: agentList.length,
        fleet_summary: fleetSummary ? JSON.parse(fleetSummary) : null,
        agents: agentList,
    });
});

// POST /api/agents — Create a personal custom agent
agents.post('/', async (c) => {
    const user = c.get('firebaseUser') as any;
    const userId = user?.uid;

    if (!userId) {
        return c.json({ error: 'Unauthorized' }, 401);
    }

    const body = await c.req.json<{
        name: string;
        type: string;
        assets: string;
        config?: object;
        risk_config?: object;
        description?: string;
    }>();

    if (!body.name || !body.type || !body.assets) {
        return c.json({ error: 'name, type, and assets are required' }, 400);
    }

    const validTypes = ['QUANT_MOMENTUM', 'SENTIMENT_ALPHA', 'ARBITRAGEUR', 'MARKET_MAKER', 'ACCUMULATOR', 'PORTFOLIO_MANAGER'];
    if (!validTypes.includes(body.type)) {
        return c.json({ error: `Invalid type. Valid: ${validTypes.join(', ')}` }, 400);
    }

    try {
        const result = await c.env.DB.prepare(`
            INSERT INTO agents (name, type, assets, config, risk_config, description, user_id)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `).bind(
            body.name, body.type, body.assets,
            JSON.stringify(body.config || {}),
            JSON.stringify(body.risk_config || { max_positions: 3, stop_loss_pct: 5.0, max_drawdown_pct: 15.0, position_size_usd: 1000, cooldown_minutes: 30 }),
            body.description || '',
            userId
        ).run();

        return c.json({ success: true, id: result.meta?.last_row_id });
    } catch (e: any) {
        return c.json({ error: 'Failed to create agent', detail: e.message }, 500);
    }
});

// ── Named routes MUST come before /:id wildcard ──────────────────

// GET /api/agents/scientist — Autonomous research findings
agents.get('/scientist', async (c) => {
    const limit = Math.min(parseInt(c.req.query('limit') || '20'), 100);
    const latestRaw = await c.env.CACHE.get('scientist:latest');
    const latest = latestRaw ? JSON.parse(latestRaw) : null;

    let findings: any[] = [];
    try {
        const result = await c.env.DB.prepare(`
            SELECT id, hypothesis, parameter, old_value, new_value, expected_impact, confidence, applied, created_at
            FROM research_log ORDER BY created_at DESC LIMIT ?
        `).bind(limit).all();
        findings = result.results || [];
    } catch { /* table may not exist yet */ }

    return c.json({
        latest_cycle: latest,
        findings: findings.map((f: any) => ({ ...f, applied: f.applied === 1 })),
    });
});

// GET /api/agents/fleet/stats — Fleet-wide performance snapshot
agents.get('/fleet/stats', async (c) => {
    const signalStats: any = await c.env.DB.prepare(`
        SELECT COUNT(*) as total,
               SUM(CASE WHEN signal = 'BUY' THEN 1 ELSE 0 END) as buys,
               SUM(CASE WHEN signal = 'SELL' THEN 1 ELSE 0 END) as sells
        FROM agent_signals WHERE created_at >= datetime('now', '-24 hours')
    `).first();

    const tradeStats: any = await c.env.DB.prepare(`
        SELECT COUNT(*) as total_trades, COALESCE(SUM(pnl), 0) as total_pnl,
               SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) as wins
        FROM trade_log WHERE closed_at >= datetime('now', '-24 hours')
    `).first();

    const openPositions: any = await c.env.DB.prepare(`
        SELECT COUNT(*) as count, COALESCE(SUM(unrealized_pnl), 0) as unrealized_pnl
        FROM paper_positions WHERE status = 'OPEN'
    `).first();

    const fleetSummary = await c.env.CACHE.get('fleet:summary');

    return c.json({
        signals_24h: { total: signalStats?.total || 0, buys: signalStats?.buys || 0, sells: signalStats?.sells || 0 },
        trades_24h: { total: tradeStats?.total_trades || 0, pnl: Math.round((tradeStats?.total_pnl || 0) * 100) / 100, wins: tradeStats?.wins || 0 },
        open_positions: { count: openPositions?.count || 0, unrealized_pnl: Math.round((openPositions?.unrealized_pnl || 0) * 100) / 100 },
        last_orchestrator_run: fleetSummary ? JSON.parse(fleetSummary) : null,
    });
});

// GET /api/agents/regime — Current market regime per asset
agents.get('/regime', async (c) => {
    try {
        const regimeRaw = await c.env.CACHE.get('market:regime');
        if (!regimeRaw) return c.json({ dominant_regime: 'UNKNOWN', assets: [] });
        return c.json(JSON.parse(regimeRaw));
    } catch {
        return c.json({ dominant_regime: 'UNKNOWN', assets: [] });
    }
});

// GET /api/agents/signals/latest — Recent signals across agents
agents.get('/signals/latest', async (c) => {
    const limit = Math.min(parseInt(c.req.query('limit') || '25'), 100);
    const signals = await c.env.DB.prepare(`
        SELECT s.id, s.agent_id, a.name as agent_name, a.type as agent_type,
               s.asset, s.signal, s.confidence, s.reasoning, s.created_at
        FROM agent_signals s JOIN agents a ON s.agent_id = a.id
        ORDER BY s.created_at DESC LIMIT ?
    `).bind(limit).all();
    return c.json({ count: signals.results?.length || 0, signals: signals.results || [] });
});

// GET /api/agents/consensus — Fleet consensus snapshot (per-asset vote breakdown)
agents.get('/consensus', async (c) => {
    try {
        const snapshot = await getConsensusSnapshot(c.env.DB, c.env.CACHE);
        return c.json(snapshot);
    } catch (e: any) {
        return c.json({ assets: {}, updated_at: new Date().toISOString(), error: e.message });
    }
});

// GET /api/agents/:id — Agent detail with signals + positions
agents.get('/:id', async (c) => {
    const id = parseInt(c.req.param('id'));
    const agent = await c.env.DB.prepare(`SELECT * FROM agents WHERE id = ?`).bind(id).first();
    if (!agent) return c.json({ error: 'Agent not found' }, 404);

    const [signals, positions, trades] = await Promise.all([
        c.env.DB.prepare(`SELECT asset, signal, confidence, reasoning, created_at FROM agent_signals WHERE agent_id = ? ORDER BY created_at DESC LIMIT 50`).bind(id).all(),
        c.env.DB.prepare(`SELECT id, asset, direction, entry_price, entry_amount, current_price, unrealized_pnl, opened_at FROM paper_positions WHERE agent_id = ? AND status = 'OPEN'`).bind(id).all(),
        c.env.DB.prepare(`SELECT asset, direction, entry_price, exit_price, position_size, pnl, pnl_percent, duration_minutes, closed_at FROM trade_log WHERE agent_id = ? ORDER BY closed_at DESC LIMIT 20`).bind(id).all(),
    ]);

    return c.json({
        agent: { ...(agent as any), config: safeParseJSON((agent as any).config), risk_config: safeParseJSON((agent as any).risk_config), performance: safeParseJSON((agent as any).performance) },
        signals: signals.results || [], positions: positions.results || [], trades: trades.results || [],
    });
});

// GET /api/agents/:id/performance — P&L metrics
agents.get('/:id/performance', async (c) => {
    const id = parseInt(c.req.param('id'));
    const stats = await c.env.DB.prepare(`
        SELECT COUNT(*) as total_trades, COALESCE(SUM(pnl), 0) as total_pnl,
               COALESCE(AVG(pnl_percent), 0) as avg_return,
               SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) as wins,
               SUM(CASE WHEN pnl <= 0 THEN 1 ELSE 0 END) as losses
        FROM trade_log WHERE agent_id = ?
    `).bind(id).first<any>();
    return c.json({
        total_trades: stats?.total_trades || 0,
        total_pnl: Math.round((stats?.total_pnl || 0) * 100) / 100,
        win_rate: stats?.total_trades ? Math.round(((stats?.wins || 0) / stats.total_trades) * 100) : 0,
        wins: stats?.wins || 0, losses: stats?.losses || 0,
    });
});

// POST /api/agents/:id/fork — Clone a strategy to the user's fleet
agents.post('/:id/fork', async (c) => {
    const user = c.get('firebaseUser') as any;
    if (!user?.uid) return c.json({ error: 'Unauthorized' }, 401);

    const id = parseInt(c.req.param('id'));
    const sourceAgent = await c.env.DB.prepare(`SELECT * FROM agents WHERE id = ?`).bind(id).first<any>();
    if (!sourceAgent) return c.json({ error: 'Source agent not found' }, 404);

    try {
        const result = await c.env.DB.prepare(`
            INSERT INTO agents (name, type, assets, config, risk_config, description, user_id, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE')
        `).bind(
            `${sourceAgent.name} (Fork)`,
            sourceAgent.type,
            sourceAgent.assets,
            sourceAgent.config,
            sourceAgent.risk_config,
            sourceAgent.description || `Forked from marketplace strategy #${id}`,
            user.uid
        ).run();

        return c.json({ success: true, id: result.meta?.last_row_id });
    } catch (e: any) {
        return c.json({ error: 'Fork failed', detail: e.message }, 500);
    }
});

// PATCH /api/agents/:id — Update agent config/risk/status
agents.patch('/:id', async (c) => {
    const user = c.get('firebaseUser') as any;
    if (!user?.uid) return c.json({ error: 'Unauthorized' }, 401);

    const id = parseInt(c.req.param('id'));
    const body = await c.req.json<{ status?: string; config?: object; risk_config?: object; assets?: string }>();

    const updates: string[] = [];
    const bindings: any[] = [];
    if (body.status) { updates.push('status = ?'); bindings.push(body.status); }
    if (body.config) { updates.push('config = ?'); bindings.push(JSON.stringify(body.config)); }
    if (body.risk_config) { updates.push('risk_config = ?'); bindings.push(JSON.stringify(body.risk_config)); }
    if (body.assets) { updates.push('assets = ?'); bindings.push(body.assets); }
    if (updates.length === 0) return c.json({ error: 'No updates specified' }, 400);

    updates.push("updated_at = datetime('now')");
    bindings.push(id, user.uid);

    await c.env.DB.prepare(
        `UPDATE agents SET ${updates.join(', ')} WHERE id = ? AND (user_id = ? OR user_id IS NULL)`
    ).bind(...bindings).run();

    return c.json({ success: true });
});

// ── Helpers ──────────────────────────────────────────────────────

function safeParseJSON(str: string | null | undefined): any {
    if (!str) return {};
    try { return JSON.parse(str); }
    catch { return {}; }
}

export default agents;
