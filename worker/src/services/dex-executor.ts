// ═══════════════════════════════════════════════════════════════════
// DEX Executor — Multi-Chain Aggregated Swap Routing
//
// Supports: Base, Ethereum, Arbitrum, Optimism
// Primary: Barter Router (60+ DEXes — UniV2/V3/V4, Aerodrome, Curve...)
// Fallback: Direct Uniswap V3 exactInputSingle encoding
//
// Agents use this to convert trading signals into on-chain swaps
// ═══════════════════════════════════════════════════════════════════

import { BarterRouter, BARTER_ENDPOINTS, type BarterSwapResponse } from './barterswap';

// ── Per-Chain DEX Configuration ──
export interface ChainDEXConfig {
    chainId: number;
    caip2: string;
    name: string;
    swapRouter: string;    // Uniswap V3 SwapRouter
    weth: string;          // Wrapped native token
    usdc: string;          // USDC address
    barterChain: string | null; // Barter endpoint key (null = no Barter support)
}

export const CHAIN_CONFIG: Record<string, ChainDEXConfig> = {
    base: {
        chainId: 8453,
        caip2: 'eip155:8453',
        name: 'Base',
        swapRouter: '0x2626664c2603336E57B271c5C0b26F421741e481',
        weth: '0x4200000000000000000000000000000000000006',
        usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
        barterChain: 'base',
    },
    ethereum: {
        chainId: 1,
        caip2: 'eip155:1',
        name: 'Ethereum',
        swapRouter: '0xE592427A0AEce92De3Edee1F18E0157C05861564',
        weth: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
        usdc: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        barterChain: 'ethereum',
    },
    arbitrum: {
        chainId: 42161,
        caip2: 'eip155:42161',
        name: 'Arbitrum',
        swapRouter: '0xE592427A0AEce92De3Edee1F18E0157C05861564',
        weth: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
        usdc: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
        barterChain: 'arbitrum',
    },
    optimism: {
        chainId: 10,
        caip2: 'eip155:10',
        name: 'Optimism',
        swapRouter: '0xE592427A0AEce92De3Edee1F18E0157C05861564',
        weth: '0x4200000000000000000000000000000000000006',
        usdc: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
        barterChain: null, // Barter doesn't support Optimism yet
    },
};

// ── Backward compat: BASE_CONTRACTS alias ──
export const BASE_CONTRACTS = {
    SWAP_ROUTER: CHAIN_CONFIG.base.swapRouter,
    WETH: CHAIN_CONFIG.base.weth,
    USDC: CHAIN_CONFIG.base.usdc,
    USDBC: '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA',
    QUOTER_V2: '0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a',
} as const;

// ── Token Registry (assets our agents trade) ──
export const TOKEN_MAP: Record<string, { address: string; decimals: number; symbol: string }> = {
    'ETH': { address: CHAIN_CONFIG.base.weth, decimals: 18, symbol: 'WETH' },
    'WETH': { address: CHAIN_CONFIG.base.weth, decimals: 18, symbol: 'WETH' },
    'USDC': { address: CHAIN_CONFIG.base.usdc, decimals: 6, symbol: 'USDC' },
};

// ── Fee Tiers ──
const FEE_TIERS = {
    LOW: 500,    // 0.05% — stable pairs
    MEDIUM: 3000, // 0.30% — most pairs
    HIGH: 10000,  // 1.00% — exotic pairs
} as const;

// ── ABI Function Selectors (Uniswap V3 SwapRouter02) ──
const EXACT_INPUT_SINGLE_SELECTOR = '0x414bf389';

// ── Safety Limits ──
export const SAFETY_LIMITS = {
    MAX_TRADE_USD: 5.00,         // $5 max per trade (start small!)
    MAX_DAILY_USD: 20.00,        // $20 max daily
    MAX_SLIPPAGE_BPS: 100,       // 1% max slippage
    MIN_CONFIDENCE: 0.70,        // Higher threshold for live trades
    DEADLINE_SECONDS: 300,       // 5 minute deadline
} as const;

// ── Helper: resolve chain config ──
export function getChainConfig(chain: string = 'base'): ChainDEXConfig {
    return CHAIN_CONFIG[chain.toLowerCase()] || CHAIN_CONFIG.base;
}

// ── Types ──
export interface DEXSwapParams {
    tokenIn: string;        // Token address
    tokenOut: string;       // Token address
    amountIn: bigint;       // In token decimals
    amountOutMinimum: bigint; // After slippage
    fee: number;            // Pool fee tier
    recipient: string;      // Agent wallet address
    deadline: number;       // Unix timestamp
    sqrtPriceLimitX96: bigint; // 0 for no limit
}

export interface SwapQuote {
    amountIn: string;
    amountOut: string;
    priceImpact: number;
    path: string;
    encodedCalldata: string;
    estimatedGas: string;
}

// ── Helper: Encode uint256 as 32-byte hex ──
function encodeUint256(value: bigint): string {
    return value.toString(16).padStart(64, '0');
}

// ── Helper: Encode address as 32-byte hex (left-padded) ──
function encodeAddress(addr: string): string {
    return addr.replace('0x', '').toLowerCase().padStart(64, '0');
}

// ── Core: Build Uniswap V3 exactInputSingle calldata ──
export function buildSwapCalldata(params: DEXSwapParams): string {
    // Function: exactInputSingle(ExactInputSingleParams)
    // struct ExactInputSingleParams {
    //     address tokenIn;        // offset 0
    //     address tokenOut;       // offset 32
    //     uint24 fee;             // offset 64
    //     address recipient;      // offset 96
    //     uint256 deadline;       // offset 128
    //     uint256 amountIn;       // offset 160
    //     uint256 amountOutMinimum; // offset 192
    //     uint160 sqrtPriceLimitX96; // offset 224
    // }
    const encoded =
        EXACT_INPUT_SINGLE_SELECTOR +
        encodeAddress(params.tokenIn) +
        encodeAddress(params.tokenOut) +
        encodeUint256(BigInt(params.fee)) +
        encodeAddress(params.recipient) +
        encodeUint256(BigInt(params.deadline)) +
        encodeUint256(params.amountIn) +
        encodeUint256(params.amountOutMinimum) +
        encodeUint256(params.sqrtPriceLimitX96);

    return '0x' + encoded.replace('0x', '');
}

// ── Fallback: Build a direct Uniswap V3 swap (no aggregation) ──
function buildAgentSwapDirect(
    asset: string,
    direction: 'LONG' | 'SHORT',
    amountUSD: number,
    currentPrice: number,
    walletAddress: string,
    slippageBps: number = SAFETY_LIMITS.MAX_SLIPPAGE_BPS,
    chain: string = 'base',
): { calldata: string; to: string; value: string; description: string } | { error: string } {
    const cfg = getChainConfig(chain);
    const deadline = Math.floor(Date.now() / 1000) + SAFETY_LIMITS.DEADLINE_SECONDS;

    if (direction === 'LONG') {
        const usdcAmount = BigInt(Math.floor(amountUSD * 1e6));
        const expectedEth = amountUSD / currentPrice;
        const minEthOut = BigInt(Math.floor(expectedEth * (1 - slippageBps / 10000) * 1e18));

        const params: DEXSwapParams = {
            tokenIn: cfg.usdc,
            tokenOut: cfg.weth,
            amountIn: usdcAmount,
            amountOutMinimum: minEthOut,
            fee: FEE_TIERS.MEDIUM,
            recipient: walletAddress,
            deadline,
            sqrtPriceLimitX96: 0n,
        };

        return {
            calldata: buildSwapCalldata(params),
            to: cfg.swapRouter,
            value: '0x0',
            description: `[DIRECT:${cfg.name}] LONG ${asset}: Swap ${amountUSD} USDC → ~${expectedEth.toFixed(6)} WETH via Uniswap V3`,
        };
    } else {
        const ethAmount = BigInt(Math.floor((amountUSD / currentPrice) * 1e18));
        const minUsdcOut = BigInt(Math.floor(amountUSD * (1 - slippageBps / 10000) * 1e6));

        const params: DEXSwapParams = {
            tokenIn: cfg.weth,
            tokenOut: cfg.usdc,
            amountIn: ethAmount,
            amountOutMinimum: minUsdcOut,
            fee: FEE_TIERS.MEDIUM,
            recipient: walletAddress,
            deadline,
            sqrtPriceLimitX96: 0n,
        };

        return {
            calldata: buildSwapCalldata(params),
            to: cfg.swapRouter,
            value: '0x0',
            description: `[DIRECT:${cfg.name}] SHORT ${asset}: Swap ~${(amountUSD / currentPrice).toFixed(6)} WETH → ${amountUSD} USDC via Uniswap V3`,
        };
    }
}

// ── Primary: Build swap via Barter aggregated routing ──
async function buildAgentSwapViaBarter(
    asset: string,
    direction: 'LONG' | 'SHORT',
    amountUSD: number,
    currentPrice: number,
    walletAddress: string,
    chain: string = 'base',
): Promise<{ calldata: string; to: string; value: string; description: string; via: 'barter'; gas_limit: number; min_return: string } | null> {
    const cfg = getChainConfig(chain);
    if (!cfg.barterChain) return null; // No Barter support for this chain

    const barter = new BarterRouter(cfg.barterChain);
    const deadline = Math.floor(Date.now() / 1000) + SAFETY_LIMITS.DEADLINE_SECONDS;

    let source: string, target: string, sellAmount: string;

    if (direction === 'LONG') {
        source = cfg.usdc;
        target = cfg.weth;
        sellAmount = Math.floor(amountUSD * 1e6).toString();
    } else {
        source = cfg.weth;
        target = cfg.usdc;
        sellAmount = Math.floor((amountUSD / currentPrice) * 1e18).toString();
    }

    const swap = await barter.getSwapCalldata({
        source,
        target,
        sellAmount,
        recipient: walletAddress,
        deadline: deadline.toString(),
        minReturnFraction: 0.99,
    });

    if (!swap || !swap.data || !swap.to) return null;

    const dirLabel = direction === 'LONG'
        ? `Swap ${amountUSD} USDC → WETH`
        : `Swap WETH → ${amountUSD} USDC`;

    return {
        calldata: swap.data,
        to: swap.to,
        value: swap.value || '0',
        description: `[BARTER:${cfg.name}] ${direction} ${asset}: ${dirLabel} via ${swap.route?.route?.length || '?'} legs`,
        via: 'barter',
        gas_limit: swap.gas_limit,
        min_return: swap.min_return,
    };
}

// ── Main entry point: Barter first, Uniswap V3 fallback ──
export async function buildAgentSwap(
    asset: string,
    direction: 'LONG' | 'SHORT',
    amountUSD: number,
    currentPrice: number,
    walletAddress: string,
    slippageBps: number = SAFETY_LIMITS.MAX_SLIPPAGE_BPS,
    chain: string = 'base',
): Promise<{ calldata: string; to: string; value: string; description: string } | { error: string }> {
    const cfg = getChainConfig(chain);

    // ── Safety gate ──
    if (amountUSD > SAFETY_LIMITS.MAX_TRADE_USD) {
        return { error: `Trade $${amountUSD} exceeds safety limit $${SAFETY_LIMITS.MAX_TRADE_USD}` };
    }

    // ── Try Barter aggregated routing first ──
    if (cfg.barterChain) {
        try {
            const barterResult = await buildAgentSwapViaBarter(asset, direction, amountUSD, currentPrice, walletAddress, chain);
            if (barterResult) {
                console.log(`[DEX:${cfg.name}] ✓ Using Barter aggregated routing: ${barterResult.description}`);
                return barterResult;
            }
            console.warn(`[DEX:${cfg.name}] Barter returned no route — falling back to Uniswap V3`);
        } catch (e) {
            console.warn(`[DEX:${cfg.name}] Barter unavailable — falling back to Uniswap V3:`, e);
        }
    }

    // ── Fallback: Direct Uniswap V3 ──
    return buildAgentSwapDirect(asset, direction, amountUSD, currentPrice, walletAddress, slippageBps, chain);
}

// ── ERC-20 Approve Calldata ──
// Agents need to approve the SwapRouter to spend their USDC/WETH
export function buildApproveCalldata(
    spender: string,
    amount: bigint,
): string {
    // approve(address spender, uint256 amount)
    const APPROVE_SELECTOR = '0x095ea7b3';
    return APPROVE_SELECTOR +
        encodeAddress(spender) +
        encodeUint256(amount);
}

// ── Build ERC-20 approval for swap contract ──
// Supports both Barter facade and Uniswap SwapRouter
export function buildSwapApproval(
    tokenAddress: string,
    spender?: string,
    amount: bigint = BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'),
    chain: string = 'base',
): { calldata: string; to: string; value: string; description: string } {
    const cfg = getChainConfig(chain);
    const approveSpender = spender || cfg.swapRouter;
    return {
        calldata: buildApproveCalldata(approveSpender, amount),
        to: tokenAddress,
        value: '0x0',
        description: `[${cfg.name}] Approve ${approveSpender.slice(0, 10)}... to spend token ${tokenAddress.slice(0, 10)}...`,
    };
}

// ── Get Barter facade address (for approvals) ──
export async function getBarterFacadeAddress(): Promise<string | null> {
    try {
        const barter = new BarterRouter('base');
        const env = await barter.getEnv();
        return env?.facade_address || null;
    } catch {
        return null;
    }
}

// ── Daily Spend Tracker (uses KV) ──
export async function checkDailyLimit(
    cache: KVNamespace,
    agentId: number,
    amountUSD: number,
): Promise<{ allowed: boolean; spent_today: number; remaining: number }> {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const key = `live:daily_spend:${agentId}:${today}`;
    const spentRaw = await cache.get(key);
    const spentToday = parseFloat(spentRaw || '0');

    const remaining = SAFETY_LIMITS.MAX_DAILY_USD - spentToday;

    if (spentToday + amountUSD > SAFETY_LIMITS.MAX_DAILY_USD) {
        return { allowed: false, spent_today: spentToday, remaining };
    }

    // Update spend tracker
    await cache.put(key, String(spentToday + amountUSD), {
        expirationTtl: 86400, // Expire after 24h
    });

    return { allowed: true, spent_today: spentToday + amountUSD, remaining: remaining - amountUSD };
}

// ── Kill Switch ──
export async function isLiveExecutionEnabled(cache: KVNamespace): Promise<boolean> {
    const killSwitch = await cache.get('live:kill_switch');
    if (killSwitch === 'DISABLED') return false;

    const enabled = await cache.get('live:execution_enabled');
    return enabled === 'true';
}
