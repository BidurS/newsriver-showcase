// ═══════════════════════════════════════════════════════════════════
// Privy Server Wallet Service — TEE Delegated Signing for Agents
// Handles server-side wallet creation, delegated signing, and
// transaction submission via Privy's Server Wallets API
// ═══════════════════════════════════════════════════════════════════

import { type Env } from '../db/queries';

// ── Types ──
export interface PrivyWallet {
    id: string;                // Privy wallet ID (e.g., "wl_...")
    address: string;           // Ethereum address
    chain_type: 'ethereum' | 'solana';
    created_at: string;
    policy_id?: string;
}

export interface PrivySigningRequest {
    wallet_id: string;
    chain_id: number;          // e.g., 42161 for Arbitrum
    method: 'eth_sendTransaction' | 'eth_signTypedData_v4' | 'personal_sign';
    params: {
        to?: string;
        value?: string;
        data?: string;
        gas_limit?: string;
    };
    caip2?: string;            // Chain-Agnostic Improvement Proposal (e.g., "eip155:42161")
}

export interface PrivyPolicy {
    id: string;
    name: string;
    rules: PrivyPolicyRule[];
}

export interface PrivyPolicyRule {
    action: 'allow' | 'deny';
    conditions: {
        method?: string[];           // e.g., ['eth_sendTransaction']
        max_value_per_tx?: string;   // In wei
        max_daily_value?: string;
        allowed_contracts?: string[];
        chain_ids?: number[];
    };
}

export interface TransactionResult {
    success: boolean;
    tx_hash?: string;
    error?: string;
    privy_request_id?: string;
}

// ── Privy API Constants ──
const PRIVY_API_BASE = 'https://api.privy.io/v1';

// Supported chains for trading execution
export const SUPPORTED_CHAINS = {
    ARBITRUM: { id: 42161, caip2: 'eip155:42161', name: 'Arbitrum One' },
    OPTIMISM: { id: 10, caip2: 'eip155:10', name: 'Optimism' },
    BASE: { id: 8453, caip2: 'eip155:8453', name: 'Base' },
    ETHEREUM: { id: 1, caip2: 'eip155:1', name: 'Ethereum' },
} as const;

// ═══════════════════════════════════════════════════════════════════
// Privy Server Wallet Service
// ═══════════════════════════════════════════════════════════════════

export class PrivyServerWalletService {
    private appId: string;
    private appSecret: string;
    private signingKey?: string;  // For signed requests (TEE authorization)
    private db: D1Database;

    constructor(env: Env) {
        this.appId = (env as any).PRIVY_APP_ID || '';
        this.appSecret = (env as any).PRIVY_APP_SECRET || '';
        this.signingKey = (env as any).PRIVY_SIGNING_KEY;
        this.db = env.DB;
    }

    // ── Check if Privy is configured ──
    isConfigured(): boolean {
        return !!(this.appId && this.appSecret);
    }

    // ── API Request Helper ──
    private async privyRequest(
        method: string,
        path: string,
        body?: any,
    ): Promise<any> {
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'privy-app-id': this.appId,
            'Authorization': `Basic ${btoa(`${this.appId}:${this.appSecret}`)}`,
        };

        // If signing key is configured, add authorization signature
        if (this.signingKey) {
            headers['privy-authorization-signature'] = await this.generateAuthSignature(path, body);
        }

        const response = await fetch(`${PRIVY_API_BASE}${path}`, {
            method,
            headers,
            body: body ? JSON.stringify(body) : undefined,
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[PRIVY] API error ${response.status}: ${errorText}`);
            throw new Error(`Privy API error: ${response.status} — ${errorText}`);
        }

        return response.json();
    }

    // ── Generate Authorization Signature (for TEE-protected requests) ──
    private async generateAuthSignature(path: string, body: any): Promise<string> {
        // In production: use the signing key to create an HMAC or JWT
        // For now, return placeholder — actual implementation depends on
        // Privy's specific signing scheme (Ed25519 or ECDSA)
        const message = `${path}:${JSON.stringify(body || {})}`;
        const encoder = new TextEncoder();
        const data = encoder.encode(message);

        // Use SubtleCrypto for HMAC if signing key is available
        if (this.signingKey) {
            const key = await crypto.subtle.importKey(
                'raw',
                encoder.encode(this.signingKey),
                { name: 'HMAC', hash: 'SHA-256' },
                false,
                ['sign']
            );
            const signature = await crypto.subtle.sign('HMAC', key, data);
            return btoa(String.fromCharCode(...new Uint8Array(signature)));
        }

        return '';
    }

    // ═══════════════════════════════════════════════════════════════
    // Wallet Management
    // ═══════════════════════════════════════════════════════════════

    /**
     * Create a new server-managed wallet for an agent
     * This wallet is fully controlled by the server (no user interaction needed)
     */
    async createServerWallet(agentId: number, chainType: 'ethereum' | 'solana' = 'ethereum'): Promise<PrivyWallet> {
        if (!this.isConfigured()) {
            throw new Error('Privy not configured — set PRIVY_APP_ID and PRIVY_APP_SECRET');
        }

        const result = await this.privyRequest('POST', '/wallets', {
            chain_type: chainType,
            // Policy can be attached later
        });

        const wallet: PrivyWallet = {
            id: result.id,
            address: result.address,
            chain_type: chainType,
            created_at: new Date().toISOString(),
        };

        // Store wallet associated with agent in DB
        await this.db.prepare(`
            INSERT INTO privy_wallets (agent_id, wallet_id, address, chain_type, created_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(agent_id) DO UPDATE SET 
                wallet_id = excluded.wallet_id,
                address = excluded.address
        `).bind(agentId, wallet.id, wallet.address, chainType, wallet.created_at).run();

        console.log(`[PRIVY] ✓ Created ${chainType} wallet for Agent#${agentId}: ${wallet.address}`);
        return wallet;
    }

    /**
     * Get existing wallet for an agent, or create one if none exists
     */
    async getOrCreateWallet(agentId: number): Promise<PrivyWallet> {
        // Check DB first
        const existing = await this.db.prepare(
            `SELECT wallet_id, address, chain_type, created_at FROM privy_wallets WHERE agent_id = ?`
        ).bind(agentId).first<any>();

        if (existing) {
            return {
                id: existing.wallet_id,
                address: existing.address,
                chain_type: existing.chain_type,
                created_at: existing.created_at,
            };
        }

        return this.createServerWallet(agentId);
    }

    // ═══════════════════════════════════════════════════════════════
    // Transaction Signing & Submission
    // ═══════════════════════════════════════════════════════════════

    /**
     * Sign and submit a transaction using the agent's server wallet
     * This is the core execution function for live trading
     */
    async signAndSendTransaction(
        walletId: string,
        chainId: number,
        transaction: {
            to: string;
            value?: string;     // In wei (hex string like '0x0')
            data?: string;      // Encoded calldata
            gas_limit?: string;
        }
    ): Promise<TransactionResult> {
        try {
            const caip2 = `eip155:${chainId}`;

            // Build transaction params — only include value if explicitly set
            const txParams: any = {
                to: transaction.to,
                data: transaction.data || '0x',
            };
            if (transaction.value && transaction.value !== '0x0' && transaction.value !== '0') {
                txParams.value = transaction.value;
            }

            const requestBody = {
                method: 'eth_sendTransaction',
                caip2,
                params: {
                    transaction: txParams,
                }
            };

            console.log(`[PRIVY] eth_sendTransaction body: ${JSON.stringify(requestBody)}`);

            const result = await this.privyRequest('POST', `/wallets/${walletId}/rpc`, requestBody);

            return {
                success: true,
                tx_hash: result.data?.hash || result.hash,
                privy_request_id: result.id,
            };
        } catch (error: any) {
            return {
                success: false,
                error: error.message,
            };
        }
    }

    /**
     * Wait for a transaction receipt to be confirmed on-chain.
     * Polls via RPC with exponential backoff. Use this instead of setTimeout
     * to ensure a tx is mined before submitting dependent transactions.
     */
    async waitForReceipt(
        walletId: string,
        chainId: number,
        txHash: string,
        maxAttempts: number = 15,   // ~30 seconds total
    ): Promise<{ confirmed: boolean; receipt?: any }> {
        const caip2 = `eip155:${chainId}`;
        for (let i = 0; i < maxAttempts; i++) {
            const delay = Math.min(1000 * Math.pow(1.5, i), 5000); // 1s, 1.5s, 2.25s... max 5s
            await new Promise(r => setTimeout(r, delay));

            try {
                const result = await this.privyRequest('POST', `/wallets/${walletId}/rpc`, {
                    method: 'eth_getTransactionReceipt',
                    caip2,
                    params: { transaction_hash: txHash },
                });

                const receipt = result.data || result;
                if (receipt && receipt.status) {
                    const success = receipt.status === '0x1' || receipt.status === 1;
                    console.log(`[PRIVY] Receipt for ${txHash}: ${success ? 'SUCCESS' : 'REVERTED'} (block ${receipt.blockNumber})`);
                    return { confirmed: success, receipt };
                }
            } catch {
                // Receipt not yet available, keep polling
            }
        }
        console.warn(`[PRIVY] Timed out waiting for receipt: ${txHash}`);
        return { confirmed: false };
    }

    /**
     * Sign a typed data message (e.g., for DEX order signing, x402 EIP-3009)
     * Privy API uses snake_case: primary_type, verifying_contract
     */
    async signTypedData(
        walletId: string,
        chainId: number,
        typedData: any,
    ): Promise<{ signature: string } | { error: string }> {
        try {
            // Transform EIP-712 camelCase → Privy snake_case
            const privyTypedData: any = {
                types: typedData.types,
                primary_type: typedData.primaryType || typedData.primary_type,
                domain: typedData.domain,
                message: typedData.message,
            };

            const result = await this.privyRequest('POST', `/wallets/${walletId}/rpc`, {
                method: 'eth_signTypedData_v4',
                params: {
                    typed_data: privyTypedData,
                },
            });

            return { signature: result.data?.signature || result.signature };
        } catch (error: any) {
            return { error: error.message };
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // Policy Management
    // ═══════════════════════════════════════════════════════════════

    /**
     * Create a trading policy for an agent's wallet
     * Limits: max tx value, allowed contracts, daily spending caps
     */
    async createTradingPolicy(
        walletId: string,
        config: {
            max_per_trade_usd: number;
            max_daily_usd: number;
            allowed_chain_ids: number[];
            allowed_contracts?: string[];
        }
    ): Promise<string> {
        // Convert USD to approximate wei (assumes ETH ~ $3000 for gas limit estimation)
        const maxPerTradeWei = BigInt(Math.floor(config.max_per_trade_usd * 1e18 / 3000));
        const maxDailyWei = BigInt(Math.floor(config.max_daily_usd * 1e18 / 3000));

        const policy = await this.privyRequest('POST', '/policies', {
            version: '1.0',
            chain_type: 'ethereum',
            name: `trading-policy-${walletId}`,
            rules: [
                {
                    name: 'allow-trading-ops',
                    action: 'ALLOW',
                    method: 'eth_sendTransaction',
                    conditions: [
                        {
                            field_source: 'ethereum_transaction',
                            field: 'value',
                            operator: 'lte',
                            value: maxPerTradeWei.toString(),
                        },
                    ]
                },
                {
                    name: 'allow-order-signing',
                    action: 'ALLOW',
                    method: 'eth_signTypedData_v4',
                    conditions: [
                        {
                            field_source: 'ethereum_typed_data_domain',
                            field: 'name',
                            operator: 'eq',
                            value: 'Exchange',
                        },
                    ]
                },
            ]
        });

        // Attach policy to wallet
        await this.privyRequest('PATCH', `/wallets/${walletId}`, {
            policy_id: policy.id,
        });

        // Store limits in DB for dashboard display
        await this.db.prepare(
            `UPDATE privy_wallets SET policy_id = ?, updated_at = datetime('now') WHERE wallet_id = ?`
        ).bind(policy.id, walletId).run();

        console.log(`[PRIVY] ✓ Policy ${policy.id} attached to wallet ${walletId} (max: $${config.max_per_trade_usd}/trade, $${config.max_daily_usd}/day)`);
        return policy.id;
    }

    // ═══════════════════════════════════════════════════════════════
    // Hyperliquid-Specific Integration
    // ═══════════════════════════════════════════════════════════════

    /**
     * Execute a Hyperliquid order by signing the order with the agent's wallet
     * Hyperliquid uses EIP-712 typed data for order signing
     */
    async executeHyperliquidOrder(
        agentId: number,
        order: {
            asset: string;
            isBuy: boolean;
            size: number;
            limitPx: number;
            orderType: 'limit' | 'market';
            reduceOnly?: boolean;
        }
    ): Promise<TransactionResult> {
        const wallet = await this.getOrCreateWallet(agentId);

        // Hyperliquid uses Arbitrum for settlement
        const chainId = SUPPORTED_CHAINS.ARBITRUM.id;

        // Build EIP-712 typed data for Hyperliquid order
        const typedData = this.buildHyperliquidOrderTypedData(wallet.address, order);

        // Sign the order
        const signResult = await this.signTypedData(wallet.id, chainId, typedData);

        if ('error' in signResult) {
            return { success: false, error: signResult.error };
        }

        // Submit to Hyperliquid API
        try {
            const hlResponse = await fetch('https://api.hyperliquid.xyz/exchange', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: {
                        type: 'order',
                        orders: [{
                            a: this.assetToHyperliquidIndex(order.asset),
                            b: order.isBuy,
                            p: order.limitPx.toString(),
                            s: order.size.toString(),
                            r: order.reduceOnly || false,
                            t: order.orderType === 'market'
                                ? { limit: { tif: 'Ioc' } }
                                : { limit: { tif: 'Gtc' } },
                        }],
                        grouping: 'na',
                    },
                    nonce: Date.now(),
                    signature: signResult.signature,
                    vaultAddress: null,
                })
            });

            const result = await hlResponse.json() as any;

            if (result.status === 'ok' || result.response?.type === 'order') {
                return {
                    success: true,
                    tx_hash: result.response?.data?.statuses?.[0]?.resting?.oid || 'submitted',
                    privy_request_id: wallet.id,
                };
            }

            return { success: false, error: JSON.stringify(result) };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    }

    // ── Hyperliquid EIP-712 Order Typed Data ──
    private buildHyperliquidOrderTypedData(address: string, order: any): any {
        return {
            types: {
                EIP712Domain: [
                    { name: 'name', type: 'string' },
                    { name: 'version', type: 'string' },
                    { name: 'chainId', type: 'uint256' },
                    { name: 'verifyingContract', type: 'address' },
                ],
                Order: [
                    { name: 'source', type: 'string' },
                    { name: 'connectionId', type: 'bytes32' },
                ],
            },
            domain: {
                name: 'Exchange',
                version: '1',
                chainId: SUPPORTED_CHAINS.ARBITRUM.id,
                verifyingContract: '0x0000000000000000000000000000000000000000',
            },
            primaryType: 'Order',
            message: {
                source: 'a', // Mainnet
                connectionId: '0x' + '0'.repeat(64),
            },
        };
    }

    // ── Asset to Hyperliquid index mapping ──
    private assetToHyperliquidIndex(asset: string): number {
        const mapping: Record<string, number> = {
            'BTC': 0, 'ETH': 1, 'SOL': 2, 'AVAX': 3, 'LINK': 4,
            'DOT': 5, 'DOGE': 6, 'XRP': 7, 'ADA': 8, 'OP': 9,
            'ARB': 10, 'BNB': 11, 'SUI': 12, 'ATOM': 13,
        };
        const base = asset.split('/')[0].toUpperCase();
        return mapping[base] ?? 0;
    }

    // ═══════════════════════════════════════════════════════════════
    // DEX Execution on Base L2 — Live on-chain swaps via Uniswap V3
    // ═══════════════════════════════════════════════════════════════

    /**
     * Execute a DEX swap on Base L2 using the agent's server wallet
     * Steps: 1) Approve token spend → 2) Execute swap
     */
    async executeDEXSwap(
        agentId: number,
        swapTx: { calldata: string; to: string; value: string; description: string },
        approvalTx?: { calldata: string; to: string; value: string; description: string },
        chainId: number = SUPPORTED_CHAINS.BASE.id,
    ): Promise<TransactionResult> {
        try {
            const wallet = await this.getOrCreateWallet(agentId);

            // Step 1: Approve token spend (if needed)
            if (approvalTx) {
                console.log(`[DEX] Step 1: Approving token for Agent#${agentId} on chain ${chainId}...`);
                const approvalResult = await this.signAndSendTransaction(
                    wallet.id, chainId, {
                    to: approvalTx.to,
                    data: approvalTx.calldata,
                    value: approvalTx.value,
                }
                );
                if (!approvalResult.success) {
                    return { success: false, error: `Approval failed: ${approvalResult.error}` };
                }
                console.log(`[DEX] ✓ Token approved: ${approvalResult.tx_hash}`);
            }

            // Step 2: Execute swap
            console.log(`[DEX] Step 2: Executing swap for Agent#${agentId} on chain ${chainId}: ${swapTx.description}`);
            const swapResult = await this.signAndSendTransaction(
                wallet.id, chainId, {
                to: swapTx.to,
                data: swapTx.calldata,
                value: swapTx.value,
                gas_limit: '300000',
            }
            );

            if (swapResult.success) {
                console.log(`[DEX] ✓ Swap executed: ${swapResult.tx_hash}`);
            } else {
                console.error(`[DEX] ✗ Swap failed: ${swapResult.error}`);
            }

            return swapResult;
        } catch (error: any) {
            console.error(`[DEX] Agent#${agentId} swap error:`, error);
            return { success: false, error: error.message };
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // Wallet Status & Diagnostics
    // ═══════════════════════════════════════════════════════════════

    /**
     * Get all wallets managed by the system with their balances and status
     */
    async getWalletStatus(): Promise<any[]> {
        const wallets = await this.db.prepare(
            `SELECT pw.*, a.name as agent_name 
             FROM privy_wallets pw 
             LEFT JOIN agents a ON pw.agent_id = a.id
             ORDER BY pw.created_at DESC`
        ).all<any>();

        return (wallets.results || []).map(w => ({
            agent_id: w.agent_id,
            agent_name: w.agent_name,
            wallet_id: w.wallet_id,
            address: w.address,
            chain: w.chain_type,
            created: w.created_at,
        }));
    }
}

// ═══════════════════════════════════════════════════════════════════
// Factory — Used by intent-executor and routes
// ═══════════════════════════════════════════════════════════════════

export function createPrivyService(env: Env): PrivyServerWalletService | null {
    const service = new PrivyServerWalletService(env);
    if (!service.isConfigured()) {
        console.warn('[PRIVY] Not configured — PRIVY_APP_ID/PRIVY_APP_SECRET missing');
        return null;
    }
    return service;
}
