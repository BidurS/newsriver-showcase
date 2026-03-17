// ═══════════════════════════════════════════════════════════════════
// Agent Orchestrator Cron — Master loop for autonomous agent fleet
// Refactored for Scalable Multi-Tenancy (Queue Fan-Out)
// ═══════════════════════════════════════════════════════════════════

import { type Env } from '../db/queries';
import { getActiveAgents } from '../services/agent-factory';
import { type MarketContext } from '../services/agent-factory';

export async function handleAgentOrchestration(env: Env, ctx: ExecutionContext): Promise<void> {
    console.log('[ORCHESTRATOR] ▶ Starting scalable agent fleet orchestration...');

    try {
        // ── 1. Load active agents ──
        const agents = await getActiveAgents(env.DB);
        if (agents.length === 0) {
            console.log('[ORCHESTRATOR] No active agents — skipping');
            return;
        }
        console.log(`[ORCHESTRATOR] Found ${agents.length} active agents. Preparing to fan-out...`);

        // ── 2. Gather global market context from cache (pre-computed upstream) ──
        const cachedMarketContextRaw = await env.CACHE.get<string>('market:context');
        if (!cachedMarketContextRaw) {
            console.error('[ORCHESTRATOR] 🚨 Market context not found in cache. Ensure the upstream market context builder cron is running.');
            return;
        }

        let marketContext: MarketContext;
        try {
            marketContext = JSON.parse(cachedMarketContextRaw);
        } catch (e) {
            console.error('[ORCHESTRATOR] 🚨 Failed to parse cached market context:', e);
            return;
        }

        if (!marketContext || !marketContext.prices || Object.keys(marketContext.prices).length === 0) {
            console.log('[ORCHESTRATOR] No valid market context data loaded — skipping');
            return;
        }

        // ── 3. Fan-Out Agent Tasks to Queue ──
        if (!env.AGENT_TASK_QUEUE) {
            console.error('[ORCHESTRATOR] 🚨 AGENT_TASK_QUEUE binding missing!');
            return;
        }

        const standardMarketContextKey = 'market:context';

        const messages = agents.map(agent => ({
            body: {
                agent,
                marketContextKey: standardMarketContextKey
            }
        }));

        let dispatchedAgentCount = 0;
        let failedBatchCount = 0;
        const batchSize = 100;

        for (let i = 0; i < messages.length; i += batchSize) {
            const batch = messages.slice(i, i + batchSize);
            try {
                await env.AGENT_TASK_QUEUE.sendBatch(batch);
                dispatchedAgentCount += batch.length;
            } catch (e) {
                console.error(`[ORCHESTRATOR] ⚠️ Failed to dispatch batch of ${batch.length} agents:`, e);
                failedBatchCount++;
            }
        }

        if (dispatchedAgentCount === messages.length) {
            console.log(`[ORCHESTRATOR] ✓ Dispatched ${dispatchedAgentCount} agent tasks to queue.`);
        } else {
            console.warn(`[ORCHESTRATOR] ⚠️ Dispatched ${dispatchedAgentCount}/${messages.length} agent tasks. ${failedBatchCount} batches failed.`);
        }

    } catch (e) {
        console.error('[ORCHESTRATOR] Fleet orchestration failed:', e);
    }
}