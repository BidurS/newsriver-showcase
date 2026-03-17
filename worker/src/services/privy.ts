// ═══════════════════════════════════════════════════════════════════
// Privy Service — Wallet Management & Delegated Signing
// ═══════════════════════════════════════════════════════════════════

import { canonicalize } from 'json-canonicalize';
import { type Env } from '../db/queries';

export interface PrivyWallet {
    address: string;
    chain_type: 'ethereum' | 'solana';
}

export interface PrivyUser {
    id: string;
    linked_accounts: any[];
}

export class PrivyService {
    private env: Env;
    private baseUrl = 'https://api.privy.io';

    constructor(env: Env) {
        this.env = env;
    }

    // ── Wallet Management ──────────────────────────────────────────

    /**
     * Creates a custodial (server) wallet for a user
     */
    async createCustodialWallet(userId: string, chainType: 'ethereum' | 'solana' = 'ethereum'): Promise<string> {
        const url = `${this.baseUrl}/v1/wallets/custodial`;
        const body = {
            user_id: userId,
            chain_type: chainType
        };

        const res = await this.authenticatedFetch('POST', url, body);
        const data = await res.json() as any;

        if (!res.ok) {
            throw new Error(`Privy wallet creation failed: ${data.error || res.statusText}`);
        }

        return data.address;
    }

    /**
     * Gets a user's wallet address if it exists
     */
    async getUserWallet(userId: string): Promise<string | null> {
        const url = `${this.baseUrl}/v1/users/${userId}`;
        const res = await this.authenticatedFetch('GET', url);
        
        if (!res.ok) return null;
        
        const data = await res.json() as PrivyUser;
        const wallet = data.linked_accounts.find(a => a.type === 'wallet' && a.delegated);
        return wallet?.address || null;
    }

    // ── Delegated Signing (Intents) ───────────────────────────────

    /**
     * Sends an EVM transaction via Privy Intent
     */
    async sendTransaction(walletAddress: string, chainId: number, to: string, value: string, data?: string) {
        const url = `${this.baseUrl}/v1/intents/rpc`;
        const body = {
            address: walletAddress,
            chain_type: 'ethereum',
            method: 'eth_sendTransaction',
            params: {
                transaction: {
                    chainId,
                    to,
                    value,
                    data: data || '0x'
                }
            }
        };

        const res = await this.authenticatedFetch('POST', url, body);
        const resData = await res.json() as any;

        if (!res.ok) {
            throw new Error(`Privy transaction failed: ${resData.error || res.statusText}`);
        }

        return resData.hash;
    }

    // ── Internal Helpers ──────────────────────────────────────────

    private async authenticatedFetch(method: string, url: string, body: any = null): Promise<Response> {
        const headers: Record<string, string> = {
            'privy-app-id': this.env.PRIVY_APP_ID,
            'Content-Type': 'application/json',
            'Authorization': `Basic ${btoa(`${this.env.PRIVY_APP_ID}:${this.env.PRIVY_APP_SECRET}`)}`
        };

        // If we have a signing key, generate the authorization signature for delegated actions
        if (this.env.PRIVY_SIGNING_KEY && method !== 'GET') {
            const signature = await this.generateAuthorizationSignature(method, url, headers, body);
            headers['privy-authorization-signature'] = signature;
        }

        return fetch(url, {
            method,
            headers,
            body: body ? JSON.stringify(body) : undefined
        });
    }

    private async generateAuthorizationSignature(method: string, url: string, headers: any, body: any): Promise<string> {
        // 1. Construct the payload for signing
        const signaturePayload = {
            version: 1,
            method,
            url: url.replace(/\/$/, ''), // Privy requires no trailing slash
            headers: Object.fromEntries(
                Object.entries(headers).filter(([key]) => key.startsWith('privy-'))
            ),
            body: body || {}
        };

        // 2. Canonicalize
        const canonicalized = canonicalize(signaturePayload);

        // 3. Sign using Web Crypto (ECDSA P-256)
        const privateKey = await this.importPrivateKey(this.env.PRIVY_SIGNING_KEY);
        const encoder = new TextEncoder();
        const data = encoder.encode(canonicalized);

        const signature = await crypto.subtle.sign(
            { name: 'ECDSA', hash: { name: 'SHA-256' } },
            privateKey,
            data
        );

        // 4. Return as Base64
        return btoa(String.fromCharCode(...new Uint8Array(signature)));
    }

    private async importPrivateKey(pem: string): Promise<CryptoKey> {
        // Clean the PEM string to get the base64 part
        const b64 = pem
            .replace(/-----BEGIN PRIVATE KEY-----/g, '')
            .replace(/-----END PRIVATE KEY-----/g, '')
            .replace(/\s/g, '');
        
        const binary = Uint8Array.from(atob(b64), c => c.charCodeAt(0));

        return await crypto.subtle.importKey(
            'pkcs8',
            binary.buffer,
            { name: 'ECDSA', namedCurve: 'P-256' },
            false,
            ['sign']
        );
    }
}
