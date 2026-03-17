// Gemini Budget Guard — Hard Kill Switch
// Checks daily/monthly spend from cost_logs and blocks Gemini calls if over budget.
// Monthly budget: $10 (configurable). Daily budget: $0.50 (safety).

import { type Env } from '../db/queries';

const MONTHLY_BUDGET_USD = 5.0;  // Cost-optimized: was $10
const DAILY_BUDGET_USD = 0.25;   // Cost-optimized: was $0.50 (~$7.50/month ceiling)
const CACHE_KEY = 'gemini:budget_ok';
const CACHE_TTL = 300; // Re-check every 5 minutes

export interface BudgetStatus {
    allowed: boolean;
    daily_spend: number;
    monthly_spend: number;
    reason?: string;
}

/**
 * Check if we're within budget. Returns { allowed: true } if Gemini calls are OK.
 * Caches the result for 5 minutes to avoid hammering D1 on every call.
 */
export async function checkGeminiBudget(env: Env): Promise<BudgetStatus> {
    // ── Fast path: check cache ──
    try {
        const cached = await env.CACHE.get(CACHE_KEY);
        if (cached === 'yes') return { allowed: true, daily_spend: 0, monthly_spend: 0 };
        if (cached === 'no') return { allowed: false, daily_spend: 0, monthly_spend: 0, reason: 'budget_exceeded (cached)' };
    } catch { }

    // ── Query cost_logs ──
    try {
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

        const [dailyResult, monthlyResult] = await Promise.all([
            env.DB.prepare(
                `SELECT COALESCE(SUM(cost_usd), 0) as total FROM cost_logs WHERE timestamp >= ?`
            ).bind(todayStart).first<{ total: number }>(),
            env.DB.prepare(
                `SELECT COALESCE(SUM(cost_usd), 0) as total FROM cost_logs WHERE timestamp >= ?`
            ).bind(monthStart).first<{ total: number }>(),
        ]);

        const dailySpend = dailyResult?.total ?? 0;
        const monthlySpend = monthlyResult?.total ?? 0;

        if (monthlySpend >= MONTHLY_BUDGET_USD) {
            console.warn(`[BUDGET] 🛑 MONTHLY LIMIT HIT: $${monthlySpend.toFixed(2)} >= $${MONTHLY_BUDGET_USD}. Blocking Gemini.`);
            await env.CACHE.put(CACHE_KEY, 'no', { expirationTtl: CACHE_TTL });
            return { allowed: false, daily_spend: dailySpend, monthly_spend: monthlySpend, reason: `monthly_limit ($${monthlySpend.toFixed(2)}/$${MONTHLY_BUDGET_USD})` };
        }

        if (dailySpend >= DAILY_BUDGET_USD) {
            console.warn(`[BUDGET] 🛑 DAILY LIMIT HIT: $${dailySpend.toFixed(2)} >= $${DAILY_BUDGET_USD}. Blocking Gemini.`);
            await env.CACHE.put(CACHE_KEY, 'no', { expirationTtl: CACHE_TTL });
            return { allowed: false, daily_spend: dailySpend, monthly_spend: monthlySpend, reason: `daily_limit ($${dailySpend.toFixed(2)}/$${DAILY_BUDGET_USD})` };
        }

        await env.CACHE.put(CACHE_KEY, 'yes', { expirationTtl: CACHE_TTL });
        return { allowed: true, daily_spend: dailySpend, monthly_spend: monthlySpend };
    } catch (e) {
        // If cost_logs table doesn't exist yet, allow (fail open)
        console.warn('[BUDGET] Could not check budget:', e);
        return { allowed: true, daily_spend: 0, monthly_spend: 0, reason: 'check_failed' };
    }
}
