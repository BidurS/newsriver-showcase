// ═══════════════════════════════════════════════════════════════════
// Agent Factory — TA-First Regime-Aware Multi-Agent Trading System
// Signals driven by RSI, MACD, EMA, Supertrend, ADX, Bollinger Bands
// Regime gate: suppress counter-trend trades, scale confidence
// ═══════════════════════════════════════════════════════════════════

import { type Env } from '../db/queries';
import { type MarketRegime, type RegimeClassification } from './regime-detector';
import { type TAIndicators } from './ta-engine';

// ── Types ──────────────────────────────────────────────────────────

export type AgentType = 'QUANT_MOMENTUM' | 'SENTIMENT_ALPHA' | 'ARBITRAGEUR' | 'MARKET_MAKER' | 'ACCUMULATOR' | 'PORTFOLIO_MANAGER' | 'MEAN_REVERSION' | 'BREAKOUT' | 'NEWS_SNIPER' | 'MACRO_HEDGE' | 'WHALE_SHADOW';
export type AgentStatus = 'ACTIVE' | 'PAUSED' | 'STOPPED';

export interface AgentConfig {
    // General config properties
    momentum_threshold?: number; // For QUANT_MOMENTUM
    min_arb_spread_pct?: number; // For ARBITRAGEUR
    max_arb_spread_pct?: number; // For ARBITRAGEUR
    // ... other agent-specific configs
    [key: string]: any; // Allow arbitrary properties for flexibility
}

export interface Agent {
    id: number;
    type: AgentType;
    config: string; // JSON string of AgentConfig
    risk_config: string; // JSON string of RiskConfig
    assets: string; // JSON string of string[]
    status: AgentStatus;
    // ... other agent properties like performance, user_id, etc.
}

export interface AgentSignal {
    agent_id: number;
    asset: string;
    signal: 'BUY' | 'SELL' | 'HOLD' | 'ARBITRAGE_OPPORTUNITY' | 'ADJUST_QUOTES'; // Added specific signals
    confidence: number; // 0-1
    reasoning: string;
    metadata?: Record<string, any>; // Flexible metadata for signal details
}

export interface PriceData {
    price: number;
    change_1h?: number; // 1-hour percentage change (from marketContext)
    // Real-time fields expected from PriceTicker DO and now pre-enriched into marketContext
    bid?: number;
    ask?: number;
    volume_24h?: number;
    timestamp?: number; // Unix timestamp
    sources?: Record<string, { price: number; bid?: number; ask?: number }>; // For arbitrage, multiple sources
}

export type PriceMap = Record<string, PriceData>;

export interface MarketContext {
    prices: PriceMap;
    sentiment?: {
        avg_1h: number;
    };
    breakingNews?: any[];
    // ── TA & Regime (injected by queue consumer from KV) ──
    regime?: {
        dominant: MarketRegime;
        confidence: number;
        per_asset: Record<string, {
            regime: MarketRegime;
            confidence: number;
            description: string;
            strategy_adjustments?: Record<string, string>;
            indicators?: RegimeClassification['indicators'];
        }>;
    };
    ta?: Record<string, TAIndicators>; // Per-asset TA indicators
}

export interface RiskConfig {
    max_positions: number;
    stop_loss_pct: number;
    max_drawdown_pct: number;
    position_size_usd: number;
    cooldown_minutes: number;
    // ... other risk parameters
}

// ── Sector Mapping ───────────────────────────────────────────────
const SECTORS: Record<string, string> = {
    'BTC/USD': 'BTC_LEGACY',
    'ETH/USD': 'ETH_ECOSYSTEM',
    'SOL/USD': 'SOLANA_ECOSYSTEM',
    'JUP/USD': 'SOLANA_ECOSYSTEM',
    'PYTH/USD': 'SOLANA_ECOSYSTEM',
    'LINK/USD': 'ORACLES',
    'AVAX/USD': 'LAYER_1',
    'NEAR/USD': 'LAYER_1',
    'SUI/USD': 'LAYER_1',
    'APT/USD': 'LAYER_1',
    'FET/USD': 'AI_AGENTS',
    'RNDR/USD': 'AI_AGENTS',
    'TAO/USD': 'AI_AGENTS',
    'DOGE/USD': 'MEME',
    'WIF/USD': 'MEME',
    'PEPE/USD': 'MEME',
    'ARB/USD': 'LAYER_2',
    'OP/USD': 'LAYER_2',
    'INJ/USD': 'DEFI',
    'TIA/USD': 'MODULAR',
};

// ── Regime Gate — decides which directions are allowed ────────────
const REGIME_DIRECTION_RULES: Record<MarketRegime, { allowBuy: boolean; allowSell: boolean; confidenceMultiplier: number }> = {
    'TRENDING_UP': { allowBuy: true, allowSell: false, confidenceMultiplier: 1.2 },
    'TRENDING_DOWN': { allowBuy: false, allowSell: true, confidenceMultiplier: 1.2 },
    'RANGING': { allowBuy: false, allowSell: false, confidenceMultiplier: 0.3 }, // Market makers only
    'HIGH_VOLATILITY': { allowBuy: true, allowSell: true, confidenceMultiplier: 0.5 }, // Both OK but reduced size
    'RISK_OFF': { allowBuy: false, allowSell: true, confidenceMultiplier: 0.7 },
    'ACCUMULATION': { allowBuy: true, allowSell: false, confidenceMultiplier: 0.9 },
    'DISTRIBUTION': { allowBuy: false, allowSell: true, confidenceMultiplier: 0.8 },
    'UNKNOWN': { allowBuy: true, allowSell: true, confidenceMultiplier: 0.6 },
};

// ── TA-Primary Signal Generation ────────────────────────────────
// Uses RSI, MACD, EMA alignment, Supertrend, ADX for signal generation
// Regime gate suppresses counter-trend trades

function generateTAMomentumSignal(
    agentId: number,
    asset: string,
    priceData: PriceData,
    config: AgentConfig,
    ta?: TAIndicators,
    assetRegime?: MarketRegime,
): AgentSignal {
    // Fallback: if no TA data, use legacy momentum
    if (!ta) {
        const momentum = priceData.change_1h || 0;
        const threshold = config.momentum_threshold || 1.0;
        let signal: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';
        let confidence = 0.3; // Lower confidence without TA
        if (momentum > threshold) { signal = 'BUY'; confidence = Math.min(0.6, momentum / (threshold * 5)); }
        else if (momentum < -threshold) { signal = 'SELL'; confidence = Math.min(0.6, Math.abs(momentum) / (threshold * 5)); }
        return { agent_id: agentId, asset, signal, confidence, reasoning: `[LEGACY] Momentum: ${momentum.toFixed(2)}% (no TA data)`, metadata: { momentum_1h: momentum, price: priceData.price, source: 'legacy' } };
    }

    const regime = assetRegime || 'UNKNOWN';
    const rules = REGIME_DIRECTION_RULES[regime] || REGIME_DIRECTION_RULES['UNKNOWN'];

    // ── Count bullish vs bearish TA signals ──
    let bullScore = 0;
    let bearScore = 0;
    const reasons: string[] = [];

    // 1. EMA Alignment (trend direction)
    if (ta.current_price > ta.ema_20 && ta.ema_20 > ta.ema_50) { bullScore += 2; reasons.push('EMA↑ aligned'); }
    else if (ta.current_price < ta.ema_20 && ta.ema_20 < ta.ema_50) { bearScore += 2; reasons.push('EMA↓ aligned'); }

    // 2. MACD (momentum)
    if (ta.macd_histogram > 0 && ta.macd_line > ta.macd_signal) { bullScore += 1.5; reasons.push('MACD↑'); }
    else if (ta.macd_histogram < 0 && ta.macd_line < ta.macd_signal) { bearScore += 1.5; reasons.push('MACD↓'); }

    // 3. RSI (overbought/oversold with trend confirmation)
    if (ta.rsi_14 < 35) { bullScore += 1; reasons.push(`RSI oversold(${ta.rsi_14.toFixed(0)})`); }
    else if (ta.rsi_14 > 65) { bearScore += 1; reasons.push(`RSI overbought(${ta.rsi_14.toFixed(0)})`); }

    // 4. Supertrend (trend follower)
    if (ta.supertrend_dir === 'BULL') { bullScore += 1.5; reasons.push('Supertrend↑'); }
    else { bearScore += 1.5; reasons.push('Supertrend↓'); }

    // 5. Price vs VWAP (institutional bias)
    if (ta.current_price > ta.vwap) { bullScore += 0.5; reasons.push('Above VWAP'); }
    else { bearScore += 0.5; reasons.push('Below VWAP'); }

    // 6. ADX (trend strength — only trade when ADX > 20)
    if (ta.adx < 15) {
        // Very weak trend — don't trade, HOLD
        return {
            agent_id: agentId, asset, signal: 'HOLD',
            confidence: 0.2,
            reasoning: `[TA] No trade: ADX=${ta.adx.toFixed(0)} (too weak). Regime: ${regime}`,
            metadata: { adx: ta.adx, regime, price: priceData.price, source: 'ta_engine' }
        };
    }

    // 7. Bollinger Band position (mean reversion signal)
    if (ta.current_price < ta.bollinger_lower) { bullScore += 1; reasons.push('BB lower touch'); }
    else if (ta.current_price > ta.bollinger_upper) { bearScore += 1; reasons.push('BB upper touch'); }

    // 8. Price Action
    if (ta.price_action === 'HIGHER_HIGHS') { bullScore += 1; reasons.push('Higher highs'); }
    else if (ta.price_action === 'LOWER_LOWS') { bearScore += 1; reasons.push('Lower lows'); }

    // ── Determine signal ──
    const totalScore = bullScore + bearScore;
    const netScore = bullScore - bearScore;
    const threshold = config.momentum_threshold || 2.0; // Minimum net score to trigger

    let signal: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';
    let rawConfidence = 0.3;

    if (netScore >= threshold) {
        signal = 'BUY';
        rawConfidence = Math.min(0.95, 0.4 + (netScore / totalScore) * 0.5);
    } else if (netScore <= -threshold) {
        signal = 'SELL';
        rawConfidence = Math.min(0.95, 0.4 + (Math.abs(netScore) / totalScore) * 0.5);
    }

    // ── Apply Regime Gate ──
    if (signal === 'BUY' && !rules.allowBuy) {
        return {
            agent_id: agentId, asset, signal: 'HOLD',
            confidence: 0.15,
            reasoning: `[TA] BUY suppressed by regime gate (${regime}). ${reasons.join(', ')}`,
            metadata: { bull: bullScore, bear: bearScore, regime, gated: true, price: priceData.price, source: 'ta_regime_gate' }
        };
    }
    if (signal === 'SELL' && !rules.allowSell) {
        return {
            agent_id: agentId, asset, signal: 'HOLD',
            confidence: 0.15,
            reasoning: `[TA] SELL suppressed by regime gate (${regime}). ${reasons.join(', ')}`,
            metadata: { bull: bullScore, bear: bearScore, regime, gated: true, price: priceData.price, source: 'ta_regime_gate' }
        };
    }

    // Scale confidence by regime alignment
    const confidence = Math.round(Math.min(1, rawConfidence * rules.confidenceMultiplier) * 100) / 100;

    return {
        agent_id: agentId,
        asset,
        signal,
        confidence,
        reasoning: `[TA|${regime}] ${signal} conf=${confidence} (bull=${bullScore.toFixed(1)} bear=${bearScore.toFixed(1)} ADX=${ta.adx.toFixed(0)} RSI=${ta.rsi_14.toFixed(0)}). ${reasons.join(', ')}`,
        metadata: {
            bull_score: bullScore, bear_score: bearScore, net_score: netScore,
            regime, regime_multiplier: rules.confidenceMultiplier,
            adx: ta.adx, rsi: ta.rsi_14, macd_hist: ta.macd_histogram,
            supertrend: ta.supertrend_dir, ema_20: ta.ema_20, ema_50: ta.ema_50,
            atr: ta.atr, price: priceData.price, source: 'ta_engine'
        }
    };
}

/**
 * Detects an arbitrage opportunity for a given asset across its available sources.
 * This function is used by individual ARBITRAGEUR agents and can also be used
 * for global, system-wide arbitrage scanning (where agentId can be 0 or a designated system ID).
 * @param agentId The ID of the agent or 0 for global system signals.
 * @param asset The asset symbol (e.g., "BTC/USD").
 * @param priceData The price data for the asset, including multiple source prices if available.
 * @param config AgentConfig for custom thresholds (min_arb_spread_pct, max_arb_spread_pct).
 * @returns An AgentSignal indicating an arbitrage opportunity or 'HOLD'.
 */
export function detectArbitrageOpportunityForAsset(agentId: number, asset: string, priceData: PriceData, config: AgentConfig): AgentSignal {
    if (priceData.sources) {
        const sourceEntries = Object.entries(priceData.sources)
            .filter(([, data]) => typeof data.price === 'number')
            .map(([sourceName, data]) => ({ sourceName, price: data.price }));

        if (sourceEntries.length >= 2) {
            sourceEntries.sort((a, b) => a.price - b.price); // Sort by price

            const minSource = sourceEntries[0];
            const maxSource = sourceEntries[sourceEntries.length - 1];

            const minPrice = minSource.price;
            const maxPrice = maxSource.price;

            const spread = (maxPrice - minPrice) / minPrice * 100; // Percentage spread

            const minSpreadThreshold = config.min_arb_spread_pct || 0.1; // Default 0.1%
            const maxSpreadThreshold = config.max_arb_spread_pct || 5.0; // Avoid extreme, erroneous spreads

            if (spread > minSpreadThreshold && spread < maxSpreadThreshold) {
                // For a signal, we indicate an opportunity. Actual execution involves more details.
                return {
                    agent_id: agentId,
                    asset: asset,
                    signal: 'ARBITRAGE_OPPORTUNITY',
                    confidence: Math.min(1, spread / maxSpreadThreshold), // Confidence scales with spread
                    reasoning: `Arbitrage opportunity detected. Buy from ${minSource.sourceName} at ${minPrice.toFixed(4)}, sell to ${maxSource.sourceName} at ${maxPrice.toFixed(4)}. Spread: ${spread.toFixed(3)}%`,
                    metadata: {
                        spread: spread,
                        buy_source: minSource.sourceName,
                        buy_price: minPrice,
                        sell_source: maxSource.sourceName,
                        sell_price: maxPrice,
                        current_sources: priceData.sources
                    }
                };
            }
        }
    }
    return {
        agent_id: agentId,
        asset: asset,
        signal: 'HOLD',
        confidence: 0.05,
        reasoning: 'No significant arbitrage opportunity detected.',
    };
}

function generateMarketMakerSignal(agent: Agent, asset: string, priceData: PriceData, context: MarketContext): AgentSignal[] {
    const signals: AgentSignal[] = [];
    const config = safeParseJSON<AgentConfig>(agent.config || '{}', {});
    // A simplified market maker: place bids slightly below current price and asks slightly above.
    // This example focuses on 'adjusting quotes' as a signal, not actual order placement.
    if (priceData.bid && priceData.ask) {
        const currentMidPrice = (priceData.bid + priceData.ask) / 2;
        const targetSpreadPct = 0.05; // 0.05% target spread for MM (configurable)
        const currentSpreadPct = ((priceData.ask - priceData.bid) / currentMidPrice) * 100;

        if (Math.abs(currentSpreadPct - targetSpreadPct) > 0.01) { // If current spread deviates more than 0.01% from target
            signals.push({
                agent_id: agent.id,
                asset: asset,
                signal: 'ADJUST_QUOTES',
                confidence: 0.7,
                reasoning: `Market Maker: Adjusting quotes for ${asset}. Current spread ${currentSpreadPct.toFixed(3)}% vs target ${targetSpreadPct.toFixed(2)}%.`,
                metadata: {
                    current_bid: priceData.bid,
                    current_ask: priceData.ask,
                    target_spread_pct: targetSpreadPct,
                    mid_price: currentMidPrice
                }
            });
        }
    } else {
        // If real-time bid/ask from DO is not available in the enriched context, try to infer or signal to establish initial quotes
        signals.push({
            agent_id: agent.id,
            asset: asset,
            signal: 'ADJUST_QUOTES',
            confidence: 0.5,
            reasoning: `Market Maker: Establishing or re-evaluating quotes for ${asset}. Real-time bid/ask from sources might be missing or stale.`,
            metadata: { price: priceData.price }
        });
    }
    return signals;
}

function generateSmartAccumulatorSignal(
    agentId: number,
    asset: string,
    priceData: PriceData,
    config: AgentConfig,
    ta?: TAIndicators,
    assetRegime?: MarketRegime,
): AgentSignal {
    const regime = assetRegime || 'UNKNOWN';

    // ── Regime filter: only accumulate in favorable regimes ──
    if (regime === 'DISTRIBUTION' || regime === 'RISK_OFF') {
        return {
            agent_id: agentId, asset, signal: 'HOLD', confidence: 0.1,
            reasoning: `[DCA] Paused: ${regime} regime — smart money selling, wait for accumulation phase.`,
            metadata: { regime, price: priceData.price, source: 'smart_dca' }
        };
    }

    // ── TA-driven DCA: buy on RSI oversold + Bollinger lower touch ──
    if (ta) {
        const isOversold = ta.rsi_14 < 30;
        const isBBLower = ta.current_price <= ta.bollinger_lower * 1.005; // Within 0.5% of lower band
        const isBelowVWAP = ta.current_price < ta.vwap;
        const isAccumulationRegime = regime === 'ACCUMULATION' || regime === 'TRENDING_UP';

        let buyScore = 0;
        const reasons: string[] = [];

        if (isOversold) { buyScore += 2; reasons.push(`RSI oversold(${ta.rsi_14.toFixed(0)})`); }
        if (isBBLower) { buyScore += 2; reasons.push('BB lower touch'); }
        if (isBelowVWAP) { buyScore += 1; reasons.push('Below VWAP'); }
        if (isAccumulationRegime) { buyScore += 1.5; reasons.push(`${regime} regime`); }
        if (ta.macd_histogram > 0) { buyScore += 1; reasons.push('MACD turning up'); }

        if (buyScore >= 3) {
            const confidence = Math.round(Math.min(0.85, 0.4 + buyScore * 0.08) * 100) / 100;
            return {
                agent_id: agentId, asset, signal: 'BUY', confidence,
                reasoning: `[DCA|${regime}] Smart accumulation: ${reasons.join(', ')}. Score=${buyScore.toFixed(1)}`,
                metadata: { buy_score: buyScore, regime, rsi: ta.rsi_14, bb_lower: ta.bollinger_lower, price: priceData.price, source: 'smart_dca' }
            };
        }

        return {
            agent_id: agentId, asset, signal: 'HOLD', confidence: 0.2,
            reasoning: `[DCA|${regime}] Waiting for better entry. Score=${buyScore.toFixed(1)}/3. RSI=${ta.rsi_14.toFixed(0)}`,
            metadata: { buy_score: buyScore, regime, rsi: ta.rsi_14, price: priceData.price, source: 'smart_dca' }
        };
    }

    // Legacy fallback: simple dip-buying
    const dipThresholdPct = -0.5;
    if (priceData.change_1h !== undefined && priceData.change_1h <= dipThresholdPct) {
        return {
            agent_id: agentId, asset, signal: 'BUY', confidence: 0.5,
            reasoning: `[DCA] Legacy dip buy: ${priceData.change_1h.toFixed(2)}% in 1h.`,
            metadata: { price: priceData.price, change_1h: priceData.change_1h, source: 'legacy_dca' }
        };
    }
    return {
        agent_id: agentId, asset, signal: 'HOLD', confidence: 0.2,
        reasoning: `[DCA] No entry signal. 1h change=${(priceData.change_1h || 0).toFixed(2)}%`,
        metadata: { price: priceData.price, change_1h: priceData.change_1h, source: 'legacy_dca' }
    };
}


// ── Mean Reversion — buy oversold / sell overbought extremes ─────

function generateMeanReversionSignal(
    agentId: number,
    asset: string,
    priceData: PriceData,
    config: AgentConfig,
    ta?: TAIndicators,
    assetRegime?: MarketRegime,
): AgentSignal {
    if (!ta) {
        return { agent_id: agentId, asset, signal: 'HOLD', confidence: 0.1, reasoning: '[MR] No TA data' };
    }

    const regime = assetRegime || 'UNKNOWN';

    // Mean reversion works best in RANGING markets
    if (regime === 'TRENDING_UP' || regime === 'TRENDING_DOWN') {
        return {
            agent_id: agentId, asset, signal: 'HOLD', confidence: 0.1,
            reasoning: `[MR] Skipping: ${regime} regime — mean reversion underperforms in trends.`,
            metadata: { regime, price: priceData.price, source: 'mean_reversion' }
        };
    }

    // ── Deep oversold → BUY ──
    if (ta.rsi_14 < 25 && ta.current_price <= ta.bollinger_lower * 1.002) {
        const confidence = Math.min(0.9, 0.5 + (25 - ta.rsi_14) * 0.02);
        return {
            agent_id: agentId, asset, signal: 'BUY', confidence,
            reasoning: `[MR|${regime}] Deep oversold reversal: RSI=${ta.rsi_14.toFixed(0)}, price at BB lower. Target: BB mid (${ta.ema_20.toFixed(2)})`,
            metadata: { rsi: ta.rsi_14, bb_lower: ta.bollinger_lower, target: ta.ema_20, regime, price: priceData.price, source: 'mean_reversion' }
        };
    }

    // ── Deep overbought → SELL ──
    if (ta.rsi_14 > 75 && ta.current_price >= ta.bollinger_upper * 0.998) {
        const confidence = Math.min(0.9, 0.5 + (ta.rsi_14 - 75) * 0.02);
        return {
            agent_id: agentId, asset, signal: 'SELL', confidence,
            reasoning: `[MR|${regime}] Overbought reversal: RSI=${ta.rsi_14.toFixed(0)}, price at BB upper. Target: BB mid (${ta.ema_20.toFixed(2)})`,
            metadata: { rsi: ta.rsi_14, bb_upper: ta.bollinger_upper, target: ta.ema_20, regime, price: priceData.price, source: 'mean_reversion' }
        };
    }

    return {
        agent_id: agentId, asset, signal: 'HOLD', confidence: 0.15,
        reasoning: `[MR|${regime}] No extreme — RSI=${ta.rsi_14.toFixed(0)}, waiting for BB touch.`,
        metadata: { rsi: ta.rsi_14, regime, price: priceData.price, source: 'mean_reversion' }
    };
}

// ── Breakout — trade range expansions with volume confirmation ───

function generateBreakoutSignal(
    agentId: number,
    asset: string,
    priceData: PriceData,
    config: AgentConfig,
    ta?: TAIndicators,
    assetRegime?: MarketRegime,
): AgentSignal {
    if (!ta) {
        return { agent_id: agentId, asset, signal: 'HOLD', confidence: 0.1, reasoning: '[BRK] No TA data' };
    }

    const regime = assetRegime || 'UNKNOWN';
    const bbWidth = (ta.bollinger_upper - ta.bollinger_lower) / ta.ema_20;
    const isSqueeze = bbWidth < 0.04; // BB squeeze — volatility compression
    const isStrongTrend = ta.adx > 25;

    // ── Breakout UP: price breaks above BB upper + ADX confirming ──
    if (ta.current_price > ta.bollinger_upper && isStrongTrend && ta.macd_histogram > 0) {
        const confidence = Math.min(0.92, 0.55 + (ta.adx - 25) * 0.01 + (isSqueeze ? 0.15 : 0));
        return {
            agent_id: agentId, asset, signal: 'BUY', confidence,
            reasoning: `[BRK|${regime}] Upside breakout: price > BB upper, ADX=${ta.adx.toFixed(0)}, MACD↑${isSqueeze ? ', post-squeeze' : ''}`,
            metadata: { adx: ta.adx, bb_upper: ta.bollinger_upper, bb_width: bbWidth, squeeze: isSqueeze, regime, price: priceData.price, source: 'breakout' }
        };
    }

    // ── Breakout DOWN: price breaks below BB lower + ADX confirming ──
    if (ta.current_price < ta.bollinger_lower && isStrongTrend && ta.macd_histogram < 0) {
        const confidence = Math.min(0.92, 0.55 + (ta.adx - 25) * 0.01 + (isSqueeze ? 0.15 : 0));
        return {
            agent_id: agentId, asset, signal: 'SELL', confidence,
            reasoning: `[BRK|${regime}] Downside breakout: price < BB lower, ADX=${ta.adx.toFixed(0)}, MACD↓${isSqueeze ? ', post-squeeze' : ''}`,
            metadata: { adx: ta.adx, bb_lower: ta.bollinger_lower, bb_width: bbWidth, squeeze: isSqueeze, regime, price: priceData.price, source: 'breakout' }
        };
    }

    return {
        agent_id: agentId, asset, signal: 'HOLD', confidence: 0.1,
        reasoning: `[BRK|${regime}] No breakout. BB width=${(bbWidth * 100).toFixed(1)}%${isSqueeze ? ' (squeeze forming)' : ''}, ADX=${ta.adx.toFixed(0)}`,
        metadata: { bb_width: bbWidth, squeeze: isSqueeze, adx: ta.adx, regime, price: priceData.price, source: 'breakout' }
    };
}

// ── News Sniper — trade breaking news within 60s of detection ────

function generateNewsSniperSignal(
    agentId: number,
    asset: string,
    priceData: PriceData,
    config: AgentConfig,
    context: MarketContext,
): AgentSignal {
    if (!context.breakingNews || context.breakingNews.length === 0) {
        return { agent_id: agentId, asset, signal: 'HOLD', confidence: 0.05, reasoning: '[SNIPER] No breaking news' };
    }

    // Find breaking news mentioning this asset (within last 60 seconds)
    const now = Date.now();
    const recentBreaking = context.breakingNews.filter((n: any) => {
        const newsAge = now - (n.timestamp || now);
        const mentionsAsset = (n.entities || []).some((e: string) => asset.includes(e)) ||
            (n.title || '').toUpperCase().includes(asset.split('/')[0]);
        return newsAge < 60_000 && mentionsAsset;
    });

    if (recentBreaking.length === 0) {
        return { agent_id: agentId, asset, signal: 'HOLD', confidence: 0.05, reasoning: `[SNIPER] No relevant breaking news for ${asset}` };
    }

    // Aggregate sentiment from breaking news
    const avgSentiment = recentBreaking.reduce((sum: number, n: any) => sum + (n.sentiment || 0), 0) / recentBreaking.length;

    if (Math.abs(avgSentiment) < 0.4) {
        return {
            agent_id: agentId, asset, signal: 'HOLD', confidence: 0.2,
            reasoning: `[SNIPER] Breaking news detected but sentiment too weak (${avgSentiment.toFixed(2)})`,
            metadata: { sentiment: avgSentiment, headlines: recentBreaking.length, price: priceData.price, source: 'news_sniper' }
        };
    }

    const signal: 'BUY' | 'SELL' = avgSentiment > 0 ? 'BUY' : 'SELL';
    const confidence = Math.min(0.88, 0.5 + Math.abs(avgSentiment) * 0.4);

    return {
        agent_id: agentId, asset, signal, confidence,
        reasoning: `[SNIPER] Breaking news ${signal}: ${recentBreaking.length} headlines, sentiment=${avgSentiment.toFixed(2)}, reacting within 60s`,
        metadata: {
            sentiment: avgSentiment, headline_count: recentBreaking.length,
            headlines: recentBreaking.slice(0, 3).map((n: any) => n.title),
            price: priceData.price, source: 'news_sniper'
        }
    };
}

// ── Macro Hedge — hedge based on macro regime changes ────────────

function generateMacroHedgeSignal(
    agentId: number,
    asset: string,
    priceData: PriceData,
    config: AgentConfig,
    ta?: TAIndicators,
    assetRegime?: MarketRegime,
    context?: MarketContext,
): AgentSignal {
    const regime = assetRegime || 'UNKNOWN';

    // Check for macro data in the market context
    const macroRegime = (context as any)?.macroRegime;
    const vix = macroRegime?.vix;
    const dxyChange = macroRegime?.dxy_change_1d;

    // ── VIX spike → defensive (sell crypto) ──
    if (vix && vix > 25) {
        const severity = vix > 35 ? 'extreme' : 'elevated';
        const confidence = Math.min(0.9, 0.5 + (vix - 25) * 0.02);
        return {
            agent_id: agentId, asset, signal: 'SELL', confidence,
            reasoning: `[HEDGE] VIX ${severity} (${vix.toFixed(1)}) — reducing crypto exposure. Regime: ${regime}`,
            metadata: { vix, regime, price: priceData.price, source: 'macro_hedge' }
        };
    }

    // ── DXY surge → bearish for crypto ──
    if (dxyChange && dxyChange > 0.5) {
        return {
            agent_id: agentId, asset, signal: 'SELL', confidence: 0.65,
            reasoning: `[HEDGE] USD strengthening (DXY +${dxyChange.toFixed(2)}%) — headwind for ${asset}`,
            metadata: { dxy_change: dxyChange, regime, price: priceData.price, source: 'macro_hedge' }
        };
    }

    // ── Risk-off regime → hedge ──
    if (regime === 'RISK_OFF') {
        return {
            agent_id: agentId, asset, signal: 'SELL', confidence: 0.7,
            reasoning: `[HEDGE] Risk-off regime detected — hedging ${asset}`,
            metadata: { regime, price: priceData.price, source: 'macro_hedge' }
        };
    }

    // ── DXY weakness + low VIX → favorable for crypto ──
    if (vix && vix < 15 && dxyChange && dxyChange < -0.3) {
        return {
            agent_id: agentId, asset, signal: 'BUY', confidence: 0.6,
            reasoning: `[HEDGE] Risk-on macro: VIX low (${vix.toFixed(1)}), USD weakening (${dxyChange.toFixed(2)}%)`,
            metadata: { vix, dxy_change: dxyChange, regime, price: priceData.price, source: 'macro_hedge' }
        };
    }

    return {
        agent_id: agentId, asset, signal: 'HOLD', confidence: 0.15,
        reasoning: `[HEDGE] Macro neutral — no hedge action needed. Regime: ${regime}`,
        metadata: { vix, dxy_change: dxyChange, regime, price: priceData.price, source: 'macro_hedge' }
    };
}

// ── Whale Shadow — mirror large-order flow / volume spikes ───────

function generateWhaleShadowSignal(
    agentId: number,
    asset: string,
    priceData: PriceData,
    config: AgentConfig,
    ta?: TAIndicators,
    assetRegime?: MarketRegime,
): AgentSignal {
    if (!ta || !priceData.volume_24h) {
        return { agent_id: agentId, asset, signal: 'HOLD', confidence: 0.05, reasoning: '[WHALE] No volume data' };
    }

    const regime = assetRegime || 'UNKNOWN';

    // Detect volume spike (proxy for whale activity)
    // A sudden price move + volume spike suggests large-order flow
    const priceMove = Math.abs(priceData.change_1h || 0);
    const isAboveVWAP = ta.current_price > ta.vwap;
    const isBelowVWAP = ta.current_price < ta.vwap;

    // Volume-price divergence: big volume + price going up = accumulation
    if (priceMove > 1.5 && priceData.change_1h && priceData.change_1h > 0 && isAboveVWAP) {
        const confidence = Math.min(0.85, 0.45 + priceMove * 0.08);
        return {
            agent_id: agentId, asset, signal: 'BUY', confidence,
            reasoning: `[WHALE|${regime}] Accumulation detected: +${priceData.change_1h.toFixed(2)}% with high volume, price above VWAP`,
            metadata: { price_move: priceMove, above_vwap: isAboveVWAP, regime, price: priceData.price, source: 'whale_shadow' }
        };
    }

    // Distribution: big volume + price dropping below VWAP
    if (priceMove > 1.5 && priceData.change_1h && priceData.change_1h < 0 && isBelowVWAP) {
        const confidence = Math.min(0.85, 0.45 + priceMove * 0.08);
        return {
            agent_id: agentId, asset, signal: 'SELL', confidence,
            reasoning: `[WHALE|${regime}] Distribution detected: ${priceData.change_1h.toFixed(2)}% with high volume, price below VWAP`,
            metadata: { price_move: priceMove, below_vwap: isBelowVWAP, regime, price: priceData.price, source: 'whale_shadow' }
        };
    }

    return {
        agent_id: agentId, asset, signal: 'HOLD', confidence: 0.1,
        reasoning: `[WHALE|${regime}] No whale activity detected. Move=${priceMove.toFixed(2)}%`,
        metadata: { price_move: priceMove, regime, price: priceData.price, source: 'whale_shadow' }
    };
}

// ── Portfolio Manager (Sector Rotation) ──────────────────────────

function generateRebalanceSignal(
    agentId: number,
    context: MarketContext,
    config: AgentConfig,
): AgentSignal[] {
    const sectorPerformance: Record<string, { totalChange: number, count: number }> = {};

    // 1. Calculate Sector-wide Momentum
    for (const [asset, data] of Object.entries(context.prices)) {
        const sector = SECTORS[asset] || 'OTHER';
        if (!sectorPerformance[sector]) sectorPerformance[sector] = { totalChange: 0, count: 0 };
        sectorPerformance[sector].totalChange += data.change_1h || 0;
        sectorPerformance[sector].count++;
    }

    const sectorAverages = Object.entries(sectorPerformance).map(([sector, data]) => ({
        sector,
        avgChange: data.totalChange / data.count
    })).sort((a, b) => b.avgChange - a.avgChange);

    const bestSector = sectorAverages[0];
    const signals: AgentSignal[] = [];

    // 2. Propose rotation if a sector is outperforming by > 2%
    if (bestSector && bestSector.avgChange > 2.0) {
        // Find top asset in that sector
        const targetAsset = Object.entries(context.prices)
            .filter(([asset]) => SECTORS[asset] === bestSector.sector)
            .sort(([, a], [, b]) => (b.change_1h || 0) - (a.change_1h || 0))[0]?.[0]; // Added optional chaining for safety

        if (targetAsset) {
            signals.push({
                agent_id: agentId,
                asset: targetAsset,
                signal: 'BUY',
                confidence: 0.8,
                reasoning: `SECTOR ROTATION: ${bestSector.sector} is leading the market (+${bestSector.avgChange.toFixed(2)}%). Rotating capital into ${targetAsset}.`,
                metadata: { sector: bestSector.sector, avg_change: bestSector.avgChange }
            });
        }
    }

    return signals;
}

// ── Main Dispatcher ─────────────────────────────────────────────

export function generateAgentSignals(agent: Agent, marketContext: MarketContext): AgentSignal[] {
    const config = safeParseJSON<AgentConfig>(agent.config || '{}', {});
    const assets = safeParseJSON<string[]>(agent.assets || '[]', []);
    const signals: AgentSignal[] = [];

    if (agent.type === 'PORTFOLIO_MANAGER') {
        return generateRebalanceSignal(agent.id, marketContext, config);
    }

    // Extract regime info from market context
    const dominantRegime: MarketRegime = marketContext.regime?.dominant || 'UNKNOWN';

    for (const asset of assets) {
        const priceData: PriceData | undefined = marketContext.prices[asset];
        if (!priceData) {
            console.warn(`[AGENT-FACTORY] No price data for ${asset}, skipping agent ${agent.id}`);
            continue;
        }

        // Per-asset TA and regime
        const assetTA: TAIndicators | undefined = marketContext.ta?.[asset];
        const assetRegime: MarketRegime = marketContext.regime?.per_asset?.[asset]?.regime || dominantRegime;

        let agentSignal: AgentSignal | AgentSignal[] | null = null;

        switch (agent.type) {
            case 'QUANT_MOMENTUM':
                // TA-primary, regime-gated momentum
                agentSignal = generateTAMomentumSignal(agent.id, asset, priceData, config, assetTA, assetRegime);
                break;

            case 'SENTIMENT_ALPHA':
                // TA-primary, sentiment as secondary confirmation only
                agentSignal = generateTAMomentumSignal(agent.id, asset, priceData, config, assetTA, assetRegime);
                if (marketContext.sentiment && agentSignal && !Array.isArray(agentSignal)) {
                    const sentBias = marketContext.sentiment.avg_1h;
                    // Only boost confidence for confirmed breaking news (strong sentiment), don't use old news
                    if (Math.abs(sentBias) > 0.3) {
                        const sentMultiplier = sentBias > 0 ? 1.1 : 0.9; // Small adjustment
                        agentSignal.confidence = Math.round(Math.min(1, agentSignal.confidence * sentMultiplier) * 100) / 100;
                        agentSignal.reasoning = `[Sent:${sentBias > 0 ? '↑' : '↓'}${Math.abs(sentBias).toFixed(1)}] ${agentSignal.reasoning}`;
                    }
                }
                break;

            case 'ARBITRAGEUR':
                agentSignal = detectArbitrageOpportunityForAsset(agent.id, asset, priceData, config);
                break;

            case 'MARKET_MAKER':
                agentSignal = generateMarketMakerSignal(agent, asset, priceData, marketContext);
                break;

            case 'ACCUMULATOR':
                agentSignal = generateSmartAccumulatorSignal(agent.id, asset, priceData, config, assetTA, assetRegime);
                break;

            case 'MEAN_REVERSION':
                agentSignal = generateMeanReversionSignal(agent.id, asset, priceData, config, assetTA, assetRegime);
                break;

            case 'BREAKOUT':
                agentSignal = generateBreakoutSignal(agent.id, asset, priceData, config, assetTA, assetRegime);
                break;

            case 'NEWS_SNIPER':
                agentSignal = generateNewsSniperSignal(agent.id, asset, priceData, config, marketContext);
                break;

            case 'MACRO_HEDGE':
                agentSignal = generateMacroHedgeSignal(agent.id, asset, priceData, config, assetTA, assetRegime, marketContext);
                break;

            case 'WHALE_SHADOW':
                agentSignal = generateWhaleShadowSignal(agent.id, asset, priceData, config, assetTA, assetRegime);
                break;

            default:
                agentSignal = generateTAMomentumSignal(agent.id, asset, priceData, config, assetTA, assetRegime);
        }

        if (agentSignal) {
            if (Array.isArray(agentSignal)) {
                signals.push(...agentSignal);
            } else {
                signals.push(agentSignal);
            }
        }
    }

    return signals;
}

// ── Helpers ──────────────────────────────────────────────────────

function safeParseJSON<T>(json: string, defaultValue: T): T {
    try {
        const parsed = JSON.parse(json);
        // Basic type validation: if defaultValue is an array, ensure parsed is also an array.
        // If defaultValue is an object, ensure parsed is also an object (and not null).
        if (Array.isArray(defaultValue) && !Array.isArray(parsed)) {
            console.warn("JSON parse result type mismatch with default value (expected array), returning default.");
            return defaultValue;
        }
        if (typeof defaultValue === 'object' && defaultValue !== null && (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))) {
            console.warn("JSON parse result type mismatch with default value (expected object), returning default.");
            return defaultValue;
        }
        return parsed;
    } catch (e) {
        console.error("Failed to parse JSON:", e, "Input:", json);
        return defaultValue; // Return the provided default value on error
    }
}

export function parseRiskConfig(agent: Agent): RiskConfig {
    const defaults: RiskConfig = {
        max_positions: 3,
        stop_loss_pct: 5.0,
        max_drawdown_pct: 15.0,
        position_size_usd: 1000,
        cooldown_minutes: 30,
    };
    try {
        return { ...defaults, ...JSON.parse(agent.risk_config) };
    } catch (e) {
        console.error("Failed to parse agent risk config:", e, "Input:", agent.risk_config);
        return defaults;
    }
}

// ── DB Helpers ───────────────────────────────────────────────────

export async function getActiveAgents(db: D1Database): Promise<Agent[]> {
    const result = await db.prepare(
        `SELECT * FROM agents WHERE status = 'ACTIVE' ORDER BY id ASC`
    ).all<Agent>();
    return result.results || [];
}

export async function logAgentSignal(db: D1Database, signal: AgentSignal): Promise<void> {
    await db.prepare(`
        INSERT INTO agent_signals (agent_id, asset, signal, confidence, reasoning, metadata)
        VALUES (?, ?, ?, ?, ?, ?)
    `).bind(
        signal.agent_id,
        signal.asset,
        signal.signal,
        signal.confidence,
        signal.reasoning,
        JSON.stringify(signal.metadata || {}),
    ).run();
}

export async function updateAgentPerformance(db: D1Database, agentId: number): Promise<void> {
    const stats = await db.prepare(`
        SELECT COUNT(*) as total_trades,
               COALESCE(SUM(pnl), 0) as total_pnl,
               COALESCE(AVG(pnl_percent), 0) as avg_return,
               SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) as wins,
               SUM(CASE WHEN pnl <= 0 THEN 1 ELSE 0 END) as losses
        FROM trade_log WHERE agent_id = ?
    `).bind(agentId).first<{
        total_trades: number; total_pnl: number; avg_return: number; wins: number; losses: number;
    }>();

    const perf = {
        total_trades: stats?.total_trades || 0,
        total_pnl: Math.round((stats?.total_pnl || 0) * 100) / 100,
        avg_return_pct: Math.round((stats?.avg_return || 0) * 100) / 100,
        win_rate: stats?.total_trades ? Math.round(((stats?.wins || 0) / stats.total_trades) * 100) : 0,
        wins: stats?.wins || 0,
        losses: stats?.losses || 0,
        updated_at: new Date().toISOString(),
    };

    await db.prepare(
        `UPDATE agents SET performance = ?, updated_at = datetime('now') WHERE id = ?`
    ).bind(JSON.stringify(perf), agentId).run();
}