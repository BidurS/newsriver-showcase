// ═══════════════════════════════════════════════════════════════════
// Agent Task Consumer — TA-First Regime-Aware Signal Pipeline
// Fetches market context + regime + TA from KV, then executes agents
// ═══════════════════════════════════════════════════════════════════

import { type Env } from '../db/queries';
import { generateAgentSignals, logAgentSignal, updateAgentPerformance, parseRiskConfig, type Agent, type MarketContext } from '../services/agent-factory';
import { checkRisk } from '../services/risk-engine';
import { processSignalsV2 } from '../services/intent-executor';
import { calculateTA, type TAIndicators } from '../services/ta-engine';
import { calculateTAWasm } from '../services/ta-engine-wasm';
import { classifyRegime, type RegimeClassification, type MarketRegime } from '../services/regime-detector';
import { checkConsensus } from '../services/consensus-engine';
import { PrivyService } from '../services/privy';

interface AgentTaskMessage {
    agent: Agent;
    marketContext?: MarketContext;     // Legacy: direct context (if present, use as-is)
    marketContextKey?: string;         // New: KV key to fetch context from
    attempt?: number;
}

export async function handleAgentTasks(messages: MessageBatch<AgentTaskMessage>, env: Env, ctx: ExecutionContext): Promise<void> {
    console.log(`[QUEUE:CONSUMER] Processing batch of ${messages.messages.length} agent tasks`);

    // ── Pre-fetch shared market data once for the whole batch ──
    let sharedMarketContext: MarketContext | null = null;
    let sharedRegimeData: any = null;

    try {
        const [contextRaw, regimeRaw] = await Promise.all([
            env.CACHE.get('market:context'),
            env.CACHE.get('market:regime'),
        ]);

        if (contextRaw) {
            try { sharedMarketContext = JSON.parse(contextRaw); } catch (e) { console.error('[QUEUE:CONSUMER] Failed to parse market:context', e); }
        }
        if (regimeRaw) {
            try { sharedRegimeData = JSON.parse(regimeRaw); } catch (e) { console.error('[QUEUE:CONSUMER] Failed to parse market:regime', e); }
        }
    } catch (e) {
        console.error('[QUEUE:CONSUMER] Failed to fetch shared market data from KV:', e);
    }

    for (const msg of messages.messages) {
        try {
            const { agent, marketContext: directContext } = msg.body;

            // ── 1. Resolve Market Context ──
            let marketContext: MarketContext = directContext || sharedMarketContext || { prices: {} };

            if (!marketContext.prices || Object.keys(marketContext.prices).length === 0) {
                console.warn(`[QUEUE:CONSUMER] No price data for Agent ${agent.id} — skipping`);
                msg.ack();
                continue;
            }

            // ── 2. Inject Regime Data ──
            if (!marketContext.regime && sharedRegimeData) {
                // Build per-asset regime map from fleet regime data
                const perAssetRegime: Record<string, any> = {};
                if (sharedRegimeData.assets && Array.isArray(sharedRegimeData.assets)) {
                    for (const ar of sharedRegimeData.assets) {
                        perAssetRegime[ar.asset] = {
                            regime: ar.regime || 'UNKNOWN',
                            confidence: ar.confidence || 0,
                            description: ar.description || '',
                            indicators: ar.indicators,
                        };
                    }
                }

                marketContext = {
                    ...marketContext,
                    regime: {
                        dominant: sharedRegimeData.dominant_regime || 'UNKNOWN',
                        confidence: sharedRegimeData.regime_confidence || 0,
                        per_asset: perAssetRegime,
                    },
                };
            }

            // ── 3. Get TA Indicators (prefer KV-enriched data from realtime-prices cron) ──
            if (!marketContext.ta) {
                const taMap: Record<string, TAIndicators> = {};

                // First: try to get pre-computed TA from prices:latest (computed from 100 historical ticks)
                try {
                    const pricesRaw = await env.CACHE.get('prices:latest');
                    if (pricesRaw) {
                        const pricesData = JSON.parse(pricesRaw);
                        for (const p of (pricesData.prices || [])) {
                            if (p.ta && p.symbol) {
                                // Map KV TA fields to TAIndicators shape
                                taMap[p.symbol] = {
                                    sma_20: p.ta.ema_20 ?? 0,
                                    ema_20: p.ta.ema_20 ?? 0,
                                    ema_50: p.ta.ema_50 ?? 0,
                                    ema_200: 0,
                                    rsi_14: p.ta.rsi_14 ?? 50,
                                    stoch_k: 50, stoch_d: 50,
                                    atr: 0, adx: 0,
                                    vwap: p.ta.vwap ?? 0,
                                    obv: 0,
                                    supertrend_val: p.ta.supertrend?.val ?? 0,
                                    supertrend_dir: p.ta.supertrend?.dir === 'BEAR' ? 'BEAR' : 'BULL',
                                    bollinger_upper: 0, bollinger_lower: 0,
                                    macd_line: 0, macd_signal: 0,
                                    macd_histogram: typeof p.ta.macd === 'number' ? p.ta.macd : 0,
                                    pivot_point: 0, r1: 0, s1: 0,
                                    current_price: p.price ?? 0,
                                    price_action: 'NEUTRAL',
                                };
                            }
                        }
                    }
                } catch (e) {
                    console.warn('[QUEUE:CONSUMER] Failed to read enriched TA from prices:latest:', e);
                }

                // Fallback: compute from single price for assets missing TA
                for (const [asset, priceData] of Object.entries(marketContext.prices)) {
                    if (!taMap[asset] && priceData && priceData.price > 0) {
                        try {
                            taMap[asset] = await calculateTAWasm([priceData.price]);
                        } catch { /* skip */ }
                    }
                }

                if (Object.keys(taMap).length > 0) {
                    marketContext = { ...marketContext, ta: taMap };
                }
            }

            // ── 4. Idempotency Check ──
            const lockKey = `lock:agent:${agent.id}:${Math.floor(Date.now() / 60000)}`;
            const isLocked = await env.CACHE.get(lockKey);
            if (isLocked && msg.attempts === 1) {
                console.log(`[QUEUE:CONSUMER] Agent ${agent.id} already processed this minute — skipping duplicate.`);
                msg.ack();
                continue;
            }

            // ── 5. Strategy Execution (TA-primary, regime-gated) ──
            const signals = generateAgentSignals(agent, marketContext);
            const batchStmts: D1PreparedStatement[] = [];
            let signalsLogged = 0;
            let consensusBlocked = 0;
            let intentsCreated = 0;

            for (const signal of signals) {
                // Collect Signal Log Statement
                batchStmts.push(env.DB.prepare(`
                    INSERT INTO agent_signals (agent_id, asset, signal, confidence, reasoning, metadata)
                    VALUES (?, ?, ?, ?, ?, ?)
                `).bind(
                    signal.agent_id, signal.asset, signal.signal, signal.confidence,
                    signal.reasoning, JSON.stringify(signal.metadata || {})
                ));

                signalsLogged++;

                if (signal.signal === 'HOLD') continue;
                if (signal.signal !== 'BUY' && signal.signal !== 'SELL') continue;

                const riskResult = await checkRisk(env.DB, agent, signal);
                if (!riskResult.passed) continue;

                // ── Consensus Gate — require fleet agreement ──
                const consensus = await checkConsensus(
                    env.DB, signal.asset, signal.signal as 'BUY' | 'SELL', agent.id, env.CACHE
                );
                if (!consensus.approved) {
                    console.log(`[CONSENSUS] Blocked: Agent ${agent.id} ${signal.signal} ${signal.asset} (strength: ${consensus.strength}, diversity: ${consensus.diversity_score}) — ${consensus.reasoning}`);
                    consensusBlocked++;
                    continue;
                }

                // ── Consensus-Driven Position Sizing (Institutional Grade) ──
                // Scale trade size based on fleet agreement strength and diversity
                let consensusMultiplier = 1.0;
                if (consensus.strength >= 0.85 && consensus.diversity_score >= 3) {
                    consensusMultiplier = 1.5; // High-conviction quorum: size up
                } else if (consensus.strength < 0.7 || consensus.diversity_score < 2) {
                    consensusMultiplier = 0.5; // Marginal quorum: defensive sizing
                }

                // Resolve Executor
                let walletAddress = null;
                if (agent.user_id) {
                    const user: any = await env.DB.prepare('SELECT delegated_wallet_address FROM users WHERE firebase_uid = ?').bind(agent.user_id).first();
                    walletAddress = user?.delegated_wallet_address;
                }
                const riskConfig = parseRiskConfig(agent);
                const executor = walletAddress ? (riskConfig.executor || 'privy') : 'paper';

                // Execute — consensus approved with dynamic multiplier
                await processSignalsV2(env.DB, [{
                    strategy_id: 0,
                    agent_id: agent.id,
                    signal: signal.signal,
                    confidence: signal.confidence,
                    asset: signal.asset,
                    reasoning: signal.reasoning,
                }], marketContext.prices, { ...riskConfig, executor, consensus_multiplier: consensusMultiplier }, env);
                intentsCreated++;
            }

            // ── 6. Execute Atomic Batch ──
            if (batchStmts.length > 0) {
                await env.DB.batch(batchStmts);
            }

            await updateAgentPerformance(env.DB, agent.id);

            // Log pipeline effectiveness
            const regime = marketContext.regime?.dominant || 'UNKNOWN';
            console.log(`[QUEUE:CONSUMER] Agent ${agent.id} (${agent.type}): ${signalsLogged} signals, ${consensusBlocked} consensus-blocked, ${intentsCreated} intents created (regime: ${regime})`);

            await env.CACHE.put(lockKey, 'true', { expirationTtl: 60 });
            msg.ack();

        } catch (e) {
            console.error(`[QUEUE:CONSUMER] Attempt ${msg.attempts} failed for Agent:`, e);

            if (msg.attempts < 3) {
                msg.retry();
            } else {
                console.error(`[QUEUE:CONSUMER] Max retries reached for Agent. Moving to DLQ.`);
            }
        }
    }
}
