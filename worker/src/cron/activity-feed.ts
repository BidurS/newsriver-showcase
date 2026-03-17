// ═══════════════════════════════════════════════════════════════════
// Activity Feed Cron — Collects platform events into a unified feed
// Runs every 15 min, collects from multiple tables, writes to platform_activity
// Also creates market snapshots every 6 hours
// ═══════════════════════════════════════════════════════════════════

import { type Env } from '../db/queries';

// ── Collect recent events from across the platform ──────────────
async function collectArticleEvents(db: D1Database): Promise<void> {
    try {
        // Count articles ingested in last 15 min
        const result = await db.prepare(`
            SELECT COUNT(*) as cnt, 
                   GROUP_CONCAT(DISTINCT category) as categories
            FROM articles
            WHERE pub_date >= datetime('now', '-15 minutes')
        `).first<{ cnt: number; categories: string }>();

        if (result && result.cnt > 0) {
            await db.prepare(`
                INSERT INTO platform_activity (event_type, summary, metadata)
                VALUES ('article_ingest', ?, ?)
            `).bind(
                `Ingested ${result.cnt} articles across ${result.categories?.split(',').length || 1} categories`,
                JSON.stringify({ count: result.cnt, categories: result.categories })
            ).run();
        }
    } catch { /* table may not exist */ }
}

async function collectBreakingEvents(db: D1Database): Promise<void> {
    try {
        const result = await db.prepare(`
            SELECT COUNT(*) as cnt,
                   MAX(score) as max_score
            FROM breaking_alerts
            WHERE detected_at >= datetime('now', '-15 minutes')
        `).first<{ cnt: number; max_score: number }>();

        if (result && result.cnt > 0) {
            await db.prepare(`
                INSERT INTO platform_activity (event_type, summary, metadata)
                VALUES ('breaking_news', ?, ?)
            `).bind(
                `Detected ${result.cnt} breaking news alert${result.cnt > 1 ? 's' : ''} (max score: ${result.max_score})`,
                JSON.stringify({ count: result.cnt, max_score: result.max_score })
            ).run();
        }
    } catch { /* table may not exist */ }
}

async function collectSignalEvents(db: D1Database): Promise<void> {
    try {
        const result = await db.prepare(`
            SELECT COUNT(*) as cnt,
                   SUM(CASE WHEN direction = 'LONG' THEN 1 ELSE 0 END) as longs,
                   SUM(CASE WHEN direction = 'SHORT' THEN 1 ELSE 0 END) as shorts
            FROM signals
            WHERE created_at >= datetime('now', '-15 minutes')
        `).first<{ cnt: number; longs: number; shorts: number }>();

        if (result && result.cnt > 0) {
            await db.prepare(`
                INSERT INTO platform_activity (event_type, summary, metadata)
                VALUES ('signal_generated', ?, ?)
            `).bind(
                `Generated ${result.cnt} signal${result.cnt > 1 ? 's' : ''}: ${result.longs} long, ${result.shorts} short`,
                JSON.stringify({ count: result.cnt, longs: result.longs, shorts: result.shorts })
            ).run();
        }
    } catch { /* table may not exist */ }
}

async function collectHealthEvents(db: D1Database): Promise<void> {
    try {
        const result = await db.prepare(`
            SELECT overall_status, total_checks, checks_passed
            FROM health_checks
            ORDER BY checked_at DESC LIMIT 1
        `).first<{ overall_status: string; total_checks: number; checks_passed: number }>();

        if (result) {
            await db.prepare(`
                INSERT INTO platform_activity (event_type, summary, metadata)
                VALUES ('health_check', ?, ?)
            `).bind(
                `System health: ${result.overall_status} (${result.checks_passed}/${result.total_checks} passed)`,
                JSON.stringify(result)
            ).run();
        }
    } catch { /* table may not exist */ }
}

// ── Market Snapshot (every 6h) ──────────────────────────────────
async function collectMarketSnapshot(db: D1Database): Promise<void> {
    const hour = new Date().getUTCHours();
    if (hour % 6 !== 0) return; // Only every 6 hours

    try {
        // Check we haven't already snapshotted this slot
        const recent = await db.prepare(`
            SELECT COUNT(*) as cnt FROM market_snapshots
            WHERE created_at >= datetime('now', '-5 hours')
        `).first<{ cnt: number }>();
        if (recent && recent.cnt >= 1) return;

        // Get BTC/ETH prices
        let btcPrice = 0, ethPrice = 0, btcChange = 0, ethChange = 0;
        try {
            const prices = await db.prepare(`
                SELECT symbol, price, change_24h
                FROM price_cache
                WHERE symbol IN ('BTC', 'ETH')
                ORDER BY updated_at DESC
            `).all<{ symbol: string; price: number; change_24h: number }>();

            for (const p of (prices.results || [])) {
                if (p.symbol === 'BTC') { btcPrice = p.price; btcChange = p.change_24h; }
                if (p.symbol === 'ETH') { ethPrice = p.price; ethChange = p.change_24h; }
            }
        } catch { }

        // Get trending categories
        let trendingCategories = '[]';
        try {
            const cats = await db.prepare(`
                SELECT category, COUNT(*) as cnt
                FROM articles
                WHERE pub_date >= datetime('now', '-24 hours')
                GROUP BY category
                ORDER BY cnt DESC
                LIMIT 3
            `).all<{ category: string; cnt: number }>();
            trendingCategories = JSON.stringify((cats.results || []).map(c => c.category));
        } catch { }

        // Count stats
        let articles24h = 0, breakingCount = 0, signalsActive = 0, totalSources = 0;
        try {
            const a = await db.prepare(`SELECT COUNT(*) as cnt FROM articles WHERE pub_date >= datetime('now', '-24 hours')`).first<{ cnt: number }>();
            articles24h = a?.cnt || 0;
        } catch { }
        try {
            const b = await db.prepare(`SELECT COUNT(*) as cnt FROM breaking_alerts WHERE detected_at >= datetime('now', '-24 hours')`).first<{ cnt: number }>();
            breakingCount = b?.cnt || 0;
        } catch { }
        try {
            const s = await db.prepare(`SELECT COUNT(*) as cnt FROM signals WHERE created_at >= datetime('now', '-24 hours')`).first<{ cnt: number }>();
            signalsActive = s?.cnt || 0;
        } catch { }
        try {
            const src = await db.prepare(`SELECT COUNT(DISTINCT source_name) as cnt FROM articles`).first<{ cnt: number }>();
            totalSources = src?.cnt || 0;
        } catch { }

        await db.prepare(`
            INSERT INTO market_snapshots (btc_price, eth_price, btc_24h_change, eth_24h_change, trending_categories, articles_24h, breaking_count, signals_active, total_sources)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(btcPrice, ethPrice, btcChange, ethChange, trendingCategories, articles24h, breakingCount, signalsActive, totalSources).run();

        console.log(`[ACTIVITY] 📊 Market snapshot saved: BTC=$${btcPrice}, ETH=$${ethPrice}`);
    } catch (err: any) {
        console.error('[ACTIVITY] Snapshot error:', err.message);
    }
}

// ── Prune old entries (keep last 500) ───────────────────────────
async function pruneOldActivity(db: D1Database): Promise<void> {
    try {
        await db.prepare(`
            DELETE FROM platform_activity
            WHERE id NOT IN (SELECT id FROM platform_activity ORDER BY created_at DESC LIMIT 500)
        `).run();
    } catch { }
}

// ── Main handler ────────────────────────────────────────────────
export async function handleActivityFeed(env: Env): Promise<void> {
    console.log('[ACTIVITY] 📝 Collecting platform events...');

    try {
        await Promise.allSettled([
            collectArticleEvents(env.DB),
            collectBreakingEvents(env.DB),
            collectSignalEvents(env.DB),
            collectHealthEvents(env.DB),
            collectMarketSnapshot(env.DB),
        ]);
        await pruneOldActivity(env.DB);
        console.log('[ACTIVITY] ✅ Feed updated');
    } catch (err: any) {
        console.error('[ACTIVITY] ❌ Error:', err.message);
    }
}
