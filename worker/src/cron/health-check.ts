// Health Check Cron — Tests D1, KV, and external endpoints
// Runs every 15 min via scheduled(), stores results in D1 health_checks table
import { type Env } from '../db/queries';

// ── Endpoint Registry ──────────────────────────────────────
interface HealthTarget {
    endpoint: string;
    group: 'core' | 'paid_api' | 'proxy' | 'external' | 'internal';
    method: 'GET' | 'POST' | 'INTERNAL';
    expectedStatus: number;
    headers?: Record<string, string>;
    body?: string;
    description: string;
    // Internal check function (for D1, KV, etc.)
    internalCheck?: (env: Env) => Promise<{ ok: boolean; latencyMs: number; error?: string }>;
}

function getTargets(): HealthTarget[] {
    return [
        // ── Internal checks (no HTTP self-fetch, test services directly) ──
        {
            endpoint: 'D1 Database', group: 'internal', method: 'INTERNAL', expectedStatus: 200,
            description: 'D1 read health',
            internalCheck: async (env) => {
                const start = Date.now();
                try {
                    const result = await env.DB.prepare('SELECT COUNT(*) as count FROM articles WHERE fetched_at > datetime("now", "-1 hour")').first();
                    return { ok: true, latencyMs: Date.now() - start };
                } catch (e: any) {
                    return { ok: false, latencyMs: Date.now() - start, error: e.message };
                }
            },
        },
        {
            endpoint: 'KV Cache', group: 'internal', method: 'INTERNAL', expectedStatus: 200,
            description: 'KV read/write health',
            internalCheck: async (env) => {
                const start = Date.now();
                try {
                    const key = `health_check_${Date.now()}`;
                    await env.CACHE.put(key, 'ok', { expirationTtl: 60 });
                    const val = await env.CACHE.get(key);
                    await env.CACHE.delete(key);
                    if (val !== 'ok') throw new Error('KV read mismatch');
                    return { ok: true, latencyMs: Date.now() - start };
                } catch (e: any) {
                    return { ok: false, latencyMs: Date.now() - start, error: e.message };
                }
            },
        },
        {
            endpoint: 'D1 Sources', group: 'internal', method: 'INTERNAL', expectedStatus: 200,
            description: 'Source count check',
            internalCheck: async (env) => {
                const start = Date.now();
                try {
                    const result = await env.DB.prepare('SELECT COUNT(*) as count FROM sources').first<{ count: number }>();
                    if (!result || result.count === 0) throw new Error('No sources found');
                    return { ok: true, latencyMs: Date.now() - start };
                } catch (e: any) {
                    return { ok: false, latencyMs: Date.now() - start, error: e.message };
                }
            },
        },
        {
            endpoint: 'D1 Articles (24h)', group: 'internal', method: 'INTERNAL', expectedStatus: 200,
            description: 'Recent articles exist',
            internalCheck: async (env) => {
                const start = Date.now();
                try {
                    const result = await env.DB.prepare('SELECT COUNT(*) as count FROM articles WHERE fetched_at > datetime("now", "-24 hours")').first<{ count: number }>();
                    if (!result || result.count === 0) throw new Error('No articles in last 24h');
                    return { ok: true, latencyMs: Date.now() - start };
                } catch (e: any) {
                    return { ok: false, latencyMs: Date.now() - start, error: e.message };
                }
            },
        },
        {
            endpoint: 'D1 Breaking Alerts', group: 'internal', method: 'INTERNAL', expectedStatus: 200,
            description: 'Breaking alert system health',
            internalCheck: async (env) => {
                const start = Date.now();
                try {
                    await env.DB.prepare('SELECT COUNT(*) FROM breaking_alerts').first();
                    return { ok: true, latencyMs: Date.now() - start };
                } catch (e: any) {
                    return { ok: false, latencyMs: Date.now() - start, error: e.message };
                }
            },
        },
        {
            endpoint: 'D1 Usage Logs', group: 'internal', method: 'INTERNAL', expectedStatus: 200,
            description: 'Usage logging system',
            internalCheck: async (env) => {
                const start = Date.now();
                try {
                    await env.DB.prepare('SELECT COUNT(*) FROM usage_logs WHERE timestamp > datetime("now", "-1 hour")').first();
                    return { ok: true, latencyMs: Date.now() - start };
                } catch (e: any) {
                    return { ok: false, latencyMs: Date.now() - start, error: e.message };
                }
            },
        },

        // ── External endpoint checks (actually reachable from the worker) ──
        {
            endpoint: 'https://x402.org', group: 'external', method: 'GET', expectedStatus: 200,
            description: 'x402 Protocol (payment gateway)',
        },
        {
            endpoint: 'https://agent.yieldcircle.app', group: 'external', method: 'GET', expectedStatus: 200,
            description: 'Frontend (Cloudflare Pages)',
        },
    ];
}

// ── Single endpoint check ──────────────────────────────────
async function checkEndpoint(
    target: HealthTarget,
    env: Env,
): Promise<{
    endpoint: string;
    group: string;
    method: string;
    expectedStatus: number;
    actualStatus: number;
    latencyMs: number;
    success: boolean;
    errorMessage: string | null;
}> {
    // Internal checks (D1, KV, etc.)
    if (target.method === 'INTERNAL' && target.internalCheck) {
        const result = await target.internalCheck(env);
        return {
            endpoint: target.endpoint,
            group: target.group,
            method: 'INTERNAL',
            expectedStatus: 200,
            actualStatus: result.ok ? 200 : 500,
            latencyMs: result.latencyMs,
            success: result.ok,
            errorMessage: result.ok ? null : (result.error || 'Internal check failed'),
        };
    }

    // External HTTP checks
    const start = Date.now();
    try {
        const res = await fetch(target.endpoint, {
            method: target.method,
            headers: {
                'User-Agent': 'NewsRiver-HealthCheck/1.0',
                ...target.headers,
            },
            body: target.method === 'POST' ? target.body : undefined,
        });

        const latencyMs = Date.now() - start;
        const actualStatus = res.status;
        // For external checks, consider any 2xx as success
        const success = actualStatus >= 200 && actualStatus < 400;

        return {
            endpoint: target.endpoint,
            group: target.group,
            method: target.method,
            expectedStatus: target.expectedStatus,
            actualStatus,
            latencyMs,
            success,
            errorMessage: success ? null : `Expected 2xx, got ${actualStatus}`,
        };
    } catch (err: any) {
        return {
            endpoint: target.endpoint,
            group: target.group,
            method: target.method,
            expectedStatus: target.expectedStatus,
            actualStatus: 0,
            latencyMs: Date.now() - start,
            success: false,
            errorMessage: err.message || 'Network error',
        };
    }
}

// ── Main cron handler ──────────────────────────────────────
export async function handleHealthChecks(env: Env): Promise<{
    total: number;
    passed: number;
    failed: number;
    results: any[];
}> {
    console.log('[HEALTH] Starting health checks...');
    const targets = getTargets();
    const results = [];

    // Run checks sequentially to avoid subrequest burst
    for (const target of targets) {
        const result = await checkEndpoint(target, env);
        results.push(result);

        // Store in D1
        try {
            await env.DB.prepare(`
                INSERT INTO health_checks (endpoint, endpoint_group, method, expected_status, actual_status, latency_ms, success, error_message)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `).bind(
                result.endpoint,
                result.group,
                result.method,
                result.expectedStatus,
                result.actualStatus,
                result.latencyMs,
                result.success ? 1 : 0,
                result.errorMessage,
            ).run();
        } catch (dbErr: any) {
            console.error(`[HEALTH] DB write failed for ${target.endpoint}:`, dbErr.message);
        }
    }

    // Prune old records (keep 7 days)
    try {
        await env.DB.prepare(`DELETE FROM health_checks WHERE checked_at < datetime('now', '-7 days')`).run();
    } catch (e) {
        console.error('[HEALTH] Prune failed:', e);
    }

    const passed = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    console.log(`[HEALTH] Complete: ${passed}/${results.length} passed, ${failed} failed`);

    return { total: results.length, passed, failed, results };
}

// ── On-demand service test ─────────────────────────────────
export async function runServiceTest(
    env: Env,
    service: 'email' | 'scrape' | 'sms' | 'storage',
): Promise<{ service: string; success: boolean; latencyMs: number; details: any }> {
    // Test services by directly checking their dependencies exist
    const serviceChecks: Record<string, HealthTarget> = {
        email: {
            endpoint: 'Email Service', group: 'proxy', method: 'INTERNAL', expectedStatus: 200,
            description: 'Email proxy service test',
            internalCheck: async (env) => {
                const start = Date.now();
                try {
                    // Verify Resend API key is configured
                    if (!(env as any).RESEND_API_KEY) throw new Error('RESEND_API_KEY not configured');
                    return { ok: true, latencyMs: Date.now() - start };
                } catch (e: any) {
                    return { ok: false, latencyMs: Date.now() - start, error: e.message };
                }
            },
        },
        scrape: {
            endpoint: 'Scrape Service', group: 'proxy', method: 'INTERNAL', expectedStatus: 200,
            description: 'Scrape proxy service test',
            internalCheck: async (env) => {
                const start = Date.now();
                try {
                    // Try a lightweight external fetch
                    const res = await fetch('https://example.com', { method: 'HEAD' });
                    return { ok: res.ok, latencyMs: Date.now() - start };
                } catch (e: any) {
                    return { ok: false, latencyMs: Date.now() - start, error: e.message };
                }
            },
        },
        sms: {
            endpoint: 'SMS Service', group: 'proxy', method: 'INTERNAL', expectedStatus: 200,
            description: 'SMS proxy service test',
            internalCheck: async (env) => {
                const start = Date.now();
                try {
                    if (!(env as any).TWILIO_ACCOUNT_SID || !(env as any).TWILIO_AUTH_TOKEN) throw new Error('Twilio credentials not configured');
                    return { ok: true, latencyMs: Date.now() - start };
                } catch (e: any) {
                    return { ok: false, latencyMs: Date.now() - start, error: e.message };
                }
            },
        },
        storage: {
            endpoint: 'Storage Service', group: 'proxy', method: 'INTERNAL', expectedStatus: 200,
            description: 'KV storage proxy test',
            internalCheck: async (env) => {
                const start = Date.now();
                try {
                    const testKey = `service_test_${Date.now()}`;
                    await env.CACHE.put(testKey, JSON.stringify({ test: true }), { expirationTtl: 60 });
                    const val = await env.CACHE.get(testKey);
                    await env.CACHE.delete(testKey);
                    if (!val) throw new Error('KV write/read failed');
                    return { ok: true, latencyMs: Date.now() - start };
                } catch (e: any) {
                    return { ok: false, latencyMs: Date.now() - start, error: e.message };
                }
            },
        },
    };

    const target = serviceChecks[service];
    if (!target) {
        return { service, success: false, latencyMs: 0, details: { error: `Unknown service: ${service}` } };
    }

    const result = await checkEndpoint(target, env);

    // Store the test result
    try {
        await env.DB.prepare(`
            INSERT INTO health_checks (endpoint, endpoint_group, method, expected_status, actual_status, latency_ms, success, error_message)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
            result.endpoint,
            'proxy_test',
            result.method,
            result.expectedStatus,
            result.actualStatus,
            result.latencyMs,
            result.success ? 1 : 0,
            result.errorMessage,
        ).run();
    } catch (e) { /* best-effort */ }

    return {
        service,
        success: result.success,
        latencyMs: result.latencyMs,
        details: result,
    };
}
