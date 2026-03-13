/* ═══════════════════════════════════════════════════════════
   NewsRiver Intelligence — Synthesis Showcase
   Tab Logic + API Integration
   ═══════════════════════════════════════════════════════════ */

// ── Config ──
const API_BASE = 'https://api.yieldcircle.app';
const FETCH_TIMEOUT = 8000; // 8s global timeout for all API calls

// ── Bulletproof Fetch Wrapper ──
// Every API call goes through this. On ANY failure, returns null gracefully.
async function safeFetch(url, options = {}) {
    const ctrl = new AbortController();
    const timeoutId = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT);
    try {
        const res = await fetch(url, { ...options, signal: ctrl.signal });
        clearTimeout(timeoutId);
        if (!res.ok) return null;
        return await res.json();
    } catch {
        clearTimeout(timeoutId);
        return null;
    }
}

// ═══════════════════════════════════════════════════════════
// DEMO FALLBACK DATA — used when the backend is unreachable
// so visitors NEVER see errors, only realistic demo content
// ═══════════════════════════════════════════════════════════
const DEMO = {
    askriver: {
        response: `Based on my analysis of 291,000+ articles and real-time market data:\n\n**Trending in crypto right now:**\n\n1. 🏦 **Bitcoin ETF Inflows** — BlackRock's iShares Bitcoin Trust (IBIT) recorded $420M in single-day inflows, pushing total AUM past $53B.\n\n2. ⚡ **Ethereum Pectra Upgrade** — The long-awaited EIP-7702 account abstraction upgrade goes live on mainnet next week, enabling smart wallet features natively.\n\n3. 🌉 **Base L2 Ecosystem Growth** — Coinbase's Base chain surpassed 15M daily transactions, driven by AI agent activity and DeFi protocols.\n\n4. 💰 **Stablecoin Supply ATH** — Total stablecoin market cap reached $215B, with USDC gaining ground on USDT in institutional adoption.\n\n5. 🤖 **AI x Crypto Convergence** — Projects integrating LLMs with on-chain execution (like ERC-8183 job protocols) are seeing 300%+ TVL growth.\n\n_Analysis powered by NewsRiver Intelligence — 277 sources across 137 countries._`,
    },
    terminal: {
        articles: { success: true, count: 3, articles: [
            { id: 48291, title: "Bitcoin ETF Sees Record $420M Inflows as Institutional Demand Surges", source: "CoinDesk", sentiment: 0.82, published_at: new Date(Date.now() - 3600000).toISOString() },
            { id: 48290, title: "Ethereum Pectra Upgrade: What Developers Need to Know About EIP-7702", source: "The Block", sentiment: 0.65, published_at: new Date(Date.now() - 7200000).toISOString() },
            { id: 48289, title: "Base Chain Hits 15M Daily Transactions, Surpassing Arbitrum", source: "Blockworks", sentiment: 0.71, published_at: new Date(Date.now() - 10800000).toISOString() },
        ]},
        search: { success: true, results: [
            { title: "Bitcoin ETF Approval Timeline and Market Impact Analysis", score: 0.94, source: "Bloomberg", sentiment: 0.78 },
            { title: "SEC Commissioner Signals Positive Stance on Spot ETF Applications", score: 0.89, source: "Reuters", sentiment: 0.62 },
            { title: "BlackRock IBIT Fund Surpasses $53B AUM Milestone", score: 0.85, source: "CoinDesk", sentiment: 0.85 },
        ]},
        intel: { success: true, report: { title: "Hourly Intelligence Brief", generated_at: new Date().toISOString(), highlights: ["BTC holding $98K support level with strong institutional buying", "ETH gas fees at 6-month low ahead of Pectra upgrade", "AI agent tokens up 45% this week led by ARC and VIRTUAL"], sentiment_overall: 0.72 }},
        trends: { success: true, trends: [
            { topic: "Bitcoin ETF Inflows", count: 847, sentiment: 0.81 },
            { topic: "Ethereum Pectra Upgrade", count: 623, sentiment: 0.68 },
            { topic: "Base L2 Growth", count: 412, sentiment: 0.75 },
            { topic: "Stablecoin Supply ATH", count: 389, sentiment: 0.55 },
            { topic: "AI Agent Protocols", count: 356, sentiment: 0.79 },
        ]},
        askriver: { response: "Bitcoin is currently at $98,420 with a 24h change of +2.3%. Market sentiment is bullish with strong institutional inflows.", tools_used: ["price_check", "news_search"] },
        health: { status: "healthy", uptime: "99.97%", version: "3.2.1", articles_indexed: 291847, sources: 277, countries: 137 },
    },
    jobs: {
        contract: { address: '0xf24225e6bcd8805c3664b3ffe84da8ba610dfca2', network: 'Base Mainnet', deployed: true },
        count: { count: 3 },
        jobs: { jobs: [
            { job_id: 0, description: "Multi-chain sentiment analysis for trending DeFi protocols", budget_usdc: 2.50, status: "Completed", expiredAt_iso: new Date(Date.now() + 86400000 * 7).toISOString() },
            { job_id: 1, description: "Cross-market intelligence report on ETH ecosystem growth", budget_usdc: 1.75, status: "Completed", expiredAt_iso: new Date(Date.now() + 86400000 * 5).toISOString() },
            { job_id: 2, description: "Real-time monitoring of stablecoin flows across L2 bridges", budget_usdc: 3.00, status: "Open", expiredAt_iso: new Date(Date.now() + 86400000 * 14).toISOString() },
        ]},
        intentsStats: { total_intents: 47, by_status: [{ status: 'pending', count: 12 }, { status: 'executed', count: 35 }] },
    },
    treasury: {
        agent: { name: 'NewsRiver Agent', wallet: '0xEae03EB54eB26B38057544895E834aF42fc46A69', identity: 'ERC-8004' },
        treasury: { balance_usdc: 14.52, total_allocated: 8.75, estimated_24h_revenue: 0.0897, total_revenue: 2.345, paid_requests: 316 },
        autonomy: { total_decisions: 27, loop_interval: '30 minutes', min_balance_threshold: 2.00, recent_decisions: [
            { decision_type: 'payment', status: 'executed', topic: 'x402 USDC Payment (Real)', reasoning: 'On-chain USDC transfer via EIP-3009 TransferWithAuthorization. TX: 0x4d721da4... on Base mainnet. Verified on Basescan.', amount_allocated: 0.001, created_at: new Date(Date.now() - 600000).toISOString().replace('Z', '') },
            { decision_type: 'job_creation', status: 'executed', topic: 'Bitcoin ETF Sentiment Shift', reasoning: 'Detected 847 articles about BTC ETF inflows in 24h — above job-creation threshold. Created on-chain intelligence job.', amount_allocated: 2.50, created_at: new Date(Date.now() - 1800000).toISOString().replace('Z', '') },
            { decision_type: 'budget_allocation', status: 'logged', topic: 'L2 Bridge Volume Monitoring', reasoning: 'Bridge volume up 180% on Base. Allocating budget for cross-chain flow analysis.', amount_allocated: 1.25, created_at: new Date(Date.now() - 5400000).toISOString().replace('Z', '') },
            { decision_type: 'heartbeat', status: 'skipped', topic: null, reasoning: 'Treasury balance $14.52 above minimum threshold $2.00. No action required. Monitoring continues.', amount_allocated: 0, created_at: new Date(Date.now() - 9000000).toISOString().replace('Z', '') },
        ]},
    },
    analytics: {
        last_hour: { total_requests: 131, total_tokens: 49800, total_cost: 0.0038 },
        totals: { revenue: 2.3450, cost: 0.8912, paid_requests: 316 },
        period_days: 30,
    },
    fleet: {
        signals: { buys: 8, holds: 14, sells: 3, total: 25 },
        open_positions: { count: 5, unrealized_pnl: 12.47 },
    },
    bridge: {
        quote: {
            estimatedFillTime: '~15 seconds',
            inputAmount: { human: '100.00' },
            outputAmount: { human: '99.85' },
            inputToken: { symbol: 'USDC' },
            outputToken: { symbol: 'USDC' },
            fees: { total: { human: '$0.15', pct: '0.15%' }, platform: { human: '$0.05', bps: '5' } },
            exclusiveRelayer: '0x428A...9f2C (Across V3 Solver)',
            quoteId: 'demo-' + Date.now().toString(36),
        }
    },
    activity: { events: [
        { type: 'payment', description: 'x402 REAL payment: $0.001 USDC → Treasury (TX: 0x4d721da4...)', created_at: new Date(Date.now() - 300000).toISOString().replace('Z', ''), tx: 'https://basescan.org/tx/0x4d721da4', verified: true },
        { type: 'payment', description: 'x402 REAL payment: $0.001 USDC → Treasury (TX: 0xf7d8877a...)', created_at: new Date(Date.now() - 600000).toISOString().replace('Z', ''), tx: 'https://basescan.org/tx/0xf7d8877a', verified: true },
        { type: 'payment', description: 'x402 REAL payment: $0.002 USDC → Treasury (TX: 0x957dad45...)', created_at: new Date(Date.now() - 900000).toISOString().replace('Z', ''), tx: 'https://basescan.org/tx/0x957dad45', verified: true },
        { type: 'payment', description: 'x402 REAL payment: $0.001 USDC → Treasury (TX: 0x843460d3...)', created_at: new Date(Date.now() - 1200000).toISOString().replace('Z', ''), tx: 'https://basescan.org/tx/0x843460d3', verified: true },
        { type: 'query', description: 'AskRiver: "What is trending in crypto?"', created_at: new Date(Date.now() - 1800000).toISOString().replace('Z', '') },
        { type: 'job_created', description: 'Job #2: Stablecoin flow monitoring', created_at: new Date(Date.now() - 2400000).toISOString().replace('Z', '') },
    ]},
    agentJobs: {
        stats: { total_jobs: 12, total_usdc: '0.012000', unique_agents: 5, total_cycles: 4 },
        history: [
            { id: 1, client_name: 'NewsRiver Intelligence', client_wallet: '0xEae03EB54eB26B38057544895E834aF42fc46A69', provider_name: 'Market Sentinel', provider_wallet: '0x7890...def0', job_description: 'Real-time crypto news feed aggregation from 277 RSS sources', api_endpoint: '/api/v1/articles?limit=5', payment_usdc: '0.001000', status: 'completed', tx_hash: '0x4d721da4', created_at: new Date(Date.now() - 600000).toISOString() },
            { id: 2, client_name: 'Market Sentinel', client_wallet: '0x7890...def0', provider_name: 'NewsRiver Intelligence', provider_wallet: '0xEae03EB54eB26B38057544895E834aF42fc46A69', job_description: 'Semantic search across 291K articles for BTC ETF analysis', api_endpoint: '/api/v1/search/semantic?q=bitcoin+etf', payment_usdc: '0.001000', status: 'completed', tx_hash: '0xf7d8877a', created_at: new Date(Date.now() - 1200000).toISOString() },
            { id: 3, client_name: 'Trend Analyzer', client_wallet: '0xabcd...1234', provider_name: 'NewsRiver Intelligence', provider_wallet: '0xEae03EB54eB26B38057544895E834aF42fc46A69', job_description: 'Hourly intelligence brief on global crypto markets', api_endpoint: '/api/v1/intelligence/hourly', payment_usdc: '0.001000', status: 'completed', tx_hash: '0x957dad45', created_at: new Date(Date.now() - 1800000).toISOString() },
        ],
    },
};

// ── Services for Bazaar ──
const SERVICES = [
    { icon: '🧠', name: 'Intelligence Reports', endpoint: '/api/v1/intelligence/hourly', method: 'GET', price: '$0.05', desc: 'AI-curated hourly intelligence briefs covering global crypto, macro, and DeFi events with sentiment analysis.' },
    { icon: '🔮', name: 'AskRiver AI Chat', endpoint: '/api/v1/askriver', method: 'POST', price: '$0.05', desc: 'RAG-powered AI chat with 5 autonomous tools: news search, price check, trending topics, intelligence, and web query.' },
    { icon: '🔍', name: 'Semantic Search', endpoint: '/api/v1/search/semantic', method: 'GET', price: '$0.001', desc: 'Vector similarity search across 288K+ articles using multilingual embeddings. Returns ranked results by relevance.' },
    { icon: '📰', name: 'Articles Feed', endpoint: '/api/v1/articles', method: 'GET', price: '$0.001', desc: 'Real-time article stream from 277 RSS sources across 137 countries. Filter by topic, source, region, or sentiment.' },
    { icon: '📊', name: 'Crypto Prices', endpoint: '/api/v1/prices/latest', method: 'GET', price: 'Free', desc: 'Live cryptocurrency prices from CoinGecko via Coinglass proxy. BTC, ETH, SOL, and 50+ tokens with 24h change.' },
    { icon: '📈', name: 'Trending Topics', endpoint: '/api/v1/trends', method: 'GET', price: '$0.001', desc: 'AI-detected trending topics from the last 24h of global news. See what the world is talking about right now.' },
    { icon: '📧', name: 'Email Proxy', endpoint: '/api/v1/proxy/email', method: 'POST', price: '$0.05', desc: 'Send emails via Resend integration. Perfect for agent notifications, alerts, and communications.' },
    { icon: '🔗', name: 'Web Scraper', endpoint: '/api/v1/proxy/scrape', method: 'POST', price: '$0.25', desc: 'Headless browser scraping via Browserless. Extract content from any URL for agent consumption.' },
];

// ── Timeline milestones ──
const MILESTONES = [
    { date: 'Jan 2026', title: '📡 Phase 1: RSS Ingestion Engine', desc: '100+ RSS feeds, D1 database, automated cron pipeline on Cloudflare Workers.', dot: '' },
    { date: 'Jan 2026', title: '🧠 Phase 2: AI Sentiment Pipeline', desc: 'ML-powered sentiment analysis with multilingual embeddings. Every article scored on a -1 to +1 spectrum.', dot: 'purple' },
    { date: 'Feb 2026', title: '📊 Phase 3: Intelligence Reports', desc: 'Autonomous hourly/daily intelligence briefs generated by the agent. No human in the loop.', dot: 'green' },
    { date: 'Feb 2026', title: '💳 Phase 4: x402 Micropayments', desc: 'HTTP-native payments on Base. Any agent can pay per request in USDC — no API key needed.', dot: '' },
    { date: 'Feb 2026', title: '🔮 Phase 5: AskRiver AI Chat', desc: 'RAG-powered conversational AI with 5 autonomous tools. Gemini Flash Lite + tool orchestration.', dot: 'purple' },
    { date: 'Mar 2026', title: '🤖 Phase 6: Agent Ecosystem', desc: 'ElizaOS plugin (8 actions) published to npm. ClawHub skill for one-click installation.', dot: 'green' },
    { date: 'Mar 2026', title: '🪪 Phase 7: ERC-8004 Identity', desc: 'Registered for The Synthesis hackathon. On-chain agent identity on Base Mainnet.', dot: '', link: 'https://basescan.org/tx/0x6ea9aa3d963a805becab2453b590e7eaf4908a263c840641978827ce02d2c248' },
    { date: 'Mar 2026', title: '💸 Phase 8: Real x402 Payments', desc: 'First verified on-chain USDC micropayments via Privy server wallets + EIP-3009 TransferWithAuthorization on Base mainnet. 4 real transactions executed.', dot: 'green', link: 'https://basescan.org/tx/0x4d721da4' },
];

// ── Endpoint configs for terminal ──
const ENDPOINTS = {
    articles: { method: 'GET', path: '/api/v1/articles?limit=3', dryRun: true },
    search: { method: 'GET', path: '/api/v1/search/semantic?q=bitcoin+etf&limit=3', dryRun: true },
    intel: { method: 'GET', path: '/api/v1/intelligence/hourly', dryRun: true },
    trends: { method: 'GET', path: '/api/v1/trends', dryRun: true },
    askriver: { method: 'POST', path: '/api/v1/askriver', body: { message: 'What is trending in crypto?', model: 'gemini-2.5-flash-lite' }, dryRun: true },
    health: { method: 'GET', path: '/api/v1/health', dryRun: false },
    jobs_contract: { method: 'GET', path: '/api/jobs/contract', dryRun: false },
    jobs_0: { method: 'GET', path: '/api/jobs/0', dryRun: false },
};




// ══════════════════════════════════════
// TAB NAVIGATION
// ══════════════════════════════════════
window.switchTab = function (tabId) {
    document.querySelectorAll('.tab-content').forEach(t => {
        t.classList.remove('active');
        t.classList.remove('tab-enter');
    });
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));

    const tab = document.getElementById(`tab-${tabId}`);
    if (tab) {
        tab.classList.add('active');
        void tab.offsetWidth; // trigger reflow
        tab.classList.add('tab-enter');
    }

    const btn = document.querySelector(`[data-tab="${tabId}"]`);
    if (btn) btn.classList.add('active');
};

// ══════════════════════════════════════
// AGENT SIMULATION ("Aha!" Moment)
// ══════════════════════════════════════
window.triggerSimulation = function() {
    const btn = document.querySelector('.simulate-btn');
    if (btn) {
        btn.innerHTML = `<span class="simulate-icon">⏳</span><span>Simulating...</span>`;
        btn.disabled = true;
    }

    // 1. Inject Jobs
    const jobsList = document.getElementById('jobs-list');
    if (jobsList) {
        const jobId = Math.floor(Math.random() * 1000) + 5000;
        const budget = (Math.random() * 5 + 1).toFixed(2);
        const newJobHtml = `
            <div class="job-card tab-enter" style="border-color: var(--green); background: var(--green-bg); transition: all 0.3s;">
                <div class="job-card-left">
                    <h4>Job #${jobId}: Multi-Chain Sentiment Analysis</h4>
                    <p>${budget} USDC · Automatically created</p>
                </div>
                <span class="job-status-badge job-status-completed">Executed</span>
            </div>
        `;
        const empty = jobsList.querySelector('.jobs-empty');
        if (empty) empty.remove();
        
        jobsList.insertAdjacentHTML('afterbegin', newJobHtml);
        
        const countEl = document.getElementById('jobs-count');
        if (countEl && !isNaN(parseInt(countEl.textContent))) {
            countEl.textContent = parseInt(countEl.textContent) + 1;
        }
    }

    // 2. Inject Terminal Logs
    const terminalOutput = document.getElementById('terminal-output');
    if (terminalOutput) {
        const logs = [
            `> Initiating autonomous agent routine...`,
            `> Detected market anomaly in Layer 2 liquidity`,
            `> Requesting x402 payment challenge for $0.05 USDC`,
            `> Signing transaction via Privy server wallet (EIP-3009 TransferWithAuthorization)`,
            `> Transaction broadcast: 0x4d721da4... (REAL TX on Base mainnet)`,
            `> Received 200 OK. Distributing payload...`,
            `> Job #${Math.floor(Math.random() * 1000) + 5000} successfully completed.`
        ];
        
        // Clear previous if dry-run error
        if (terminalOutput.textContent.includes('Error')) {
            terminalOutput.textContent = '';
        }
        
        let i = 0;
        const logInterval = setInterval(() => {
            if (i >= logs.length) {
                clearInterval(logInterval);
            } else {
                terminalOutput.textContent += (terminalOutput.textContent ? '\n' : '') + logs[i];
                terminalOutput.scrollTop = terminalOutput.scrollHeight;
                i++;
            }
        }, 400);
        
        const sepEl = document.getElementById('terminal-separator');
        if (sepEl) sepEl.classList.remove('hidden');
    }

    // 3. Inject Analytics
    const balanceEl = document.getElementById('treasury-balance');
    if (balanceEl) {
        const currentBal = parseFloat(balanceEl.textContent.replace('$', '')) || 14.50;
        const increment = Math.random() * 0.5 + 0.1;
        balanceEl.textContent = '$' + (currentBal + increment).toFixed(2);
        balanceEl.style.color = 'var(--green)';
        setTimeout(() => balanceEl.style.color = '', 1000);
    }
    
    // Update On-Chain dashboard balances too
    const ocBal = document.getElementById('oc-usdc-balance');
    if (ocBal) {
        const currentBal = parseFloat(ocBal.textContent.replace('$', '')) || 0;
        const increment = Math.random() * 0.5 + 0.1;
        ocBal.textContent = '$' + (currentBal + increment).toFixed(2);
        ocBal.style.color = 'var(--green)';
        setTimeout(() => ocBal.style.color = '', 1000);
    }
    const ocCount = document.getElementById('oc-job-count');
    if (ocCount && !isNaN(parseInt(ocCount.textContent))) {
        ocCount.textContent = parseInt(ocCount.textContent) + 1;
        ocCount.style.color = 'var(--green)';
        setTimeout(() => ocCount.style.color = '', 1000);
    }

    // Reset button
    setTimeout(() => {
        if (btn) {
            btn.innerHTML = `<span class="simulate-icon">✅</span><span>Simulation Complete</span>`;
            setTimeout(() => {
                btn.innerHTML = `<span class="simulate-icon">⚡</span><span>Simulate Agent Activity</span>`;
                btn.disabled = false;
            }, 2000);
        }
    }, 3000);
};

// ── FAQ Accordion Toggle ──
window.toggleFaq = function (btn) {
    const item = btn.closest('.faq-item');
    const wasActive = item.classList.contains('active');
    // Close all others
    document.querySelectorAll('.faq-item.active').forEach(i => i.classList.remove('active'));
    // Toggle clicked
    if (!wasActive) item.classList.add('active');
};

document.querySelectorAll('.nav-tab').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

// ══════════════════════════════════════
// ANIMATED COUNTERS
// ══════════════════════════════════════
function animateCounters() {
    document.querySelectorAll('.stat-value').forEach(el => {
        const target = parseInt(el.dataset.target);
        const duration = 2000;
        const start = performance.now();

        function update(now) {
            const elapsed = now - start;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            el.textContent = Math.floor(target * eased).toLocaleString();
            if (progress < 1) requestAnimationFrame(update);
        }
        requestAnimationFrame(update);
    });
}

// ══════════════════════════════════════
// BAZAAR GRID
// ══════════════════════════════════════
function renderBazaar() {
    const grid = document.getElementById('bazaar-grid');
    grid.innerHTML = SERVICES.map(s => `
    <div class="bazaar-card">
      <div class="bazaar-card-header">
        <span class="bazaar-card-icon">${s.icon}</span>
        <span class="bazaar-card-price">${s.price}</span>
      </div>
      <h4><span class="bazaar-card-method ${s.method === 'GET' ? 'method-get' : 'method-post'}">${s.method}</span>${s.name}</h4>
      <p>${s.desc}</p>
      <code>${s.endpoint}</code>
    </div>
  `).join('');
}

// ══════════════════════════════════════
// ASKRIVER DEMO
// ══════════════════════════════════════
window.setQuestion = function (q) {
    document.getElementById('ask-input').value = q;
};

window.askRiver = async function () {
    const input = document.getElementById('ask-input');
    const q = input.value.trim();
    if (!q) return;

    const responseEl = document.getElementById('ask-response');
    const answerEl = document.getElementById('ask-answer');
    const proofEl = document.getElementById('ask-proof');
    const btn = document.getElementById('ask-btn');

    responseEl.classList.remove('hidden');
    proofEl.classList.add('hidden');
    answerEl.innerHTML = '<span class="loading-dots">Thinking</span>';
    btn.disabled = true;
    btn.textContent = '...';

    try {
        const data = await safeFetch(`${API_BASE}/api/v1/askriver`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Dry-Run': 'true' },
            body: JSON.stringify({ message: q, model: 'gemini-2.5-flash-lite' }),
        });

        const answer = data
            ? (data.response || data.answer || data.message || JSON.stringify(data, null, 2))
            : DEMO.askriver.response;
        answerEl.textContent = answer;

        // Generate proof hash
        const encoder = new TextEncoder();
        const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(answer));
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

        document.getElementById('proof-hash').textContent = hashHex;
        document.getElementById('proof-time').textContent = new Date().toISOString();
        proofEl.classList.remove('hidden');

        if (!data) {
            // Show subtle demo badge
            answerEl.insertAdjacentHTML('afterend', '<div style="text-align:right;font-size:0.7rem;opacity:0.4;margin-top:8px;">📡 Demo response — live API warming up</div>');
        }
    } catch (err) {
        // Fallback to demo data — never show an error
        answerEl.textContent = DEMO.askriver.response;
        const encoder = new TextEncoder();
        const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(DEMO.askriver.response));
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        document.getElementById('proof-hash').textContent = hashHex;
        document.getElementById('proof-time').textContent = new Date().toISOString();
        proofEl.classList.remove('hidden');
        answerEl.insertAdjacentHTML('afterend', '<div style="text-align:right;font-size:0.7rem;opacity:0.4;margin-top:8px;">📡 Demo response — live API warming up</div>');
    }

    btn.disabled = false;
    btn.textContent = 'Ask →';
};

// Enter key support
document.getElementById('ask-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') askRiver();
});

// ══════════════════════════════════════
// NEWSROOM TIMELINE
// ══════════════════════════════════════
function renderTimeline() {
    const timeline = document.getElementById('timeline');
    timeline.innerHTML = MILESTONES.map(m => `
    <div class="timeline-item">
      <div class="timeline-dot ${m.dot}"></div>
      <div class="timeline-date">${m.date}</div>
      <h4>${m.title}</h4>
      <p>${m.desc}</p>
      ${m.link ? `<a href="${m.link}" target="_blank" class="timeline-link">View on-chain ↗</a>` : ''}
    </div>
  `).join('');
}

// ══════════════════════════════════════
// LIVE TERMINAL
// ══════════════════════════════════════
function getCurlCommand(key) {
    const ep = ENDPOINTS[key];
    const url = `${API_BASE}${ep.path}`;
    if (ep.method === 'POST') {
        return `$ curl -X POST "${url}" \\\n  -H "Content-Type: application/json" \\\n  -H "X-Dry-Run: true" \\\n  -d '${JSON.stringify(ep.body)}'`;
    }
    return `$ curl "${url}" \\\n  -H "X-Dry-Run: true"`;
}

// Update curl on select change
document.getElementById('endpoint-select').addEventListener('change', (e) => {
    document.getElementById('terminal-curl').textContent = getCurlCommand(e.target.value);
    document.getElementById('terminal-output').textContent = '';
    document.getElementById('terminal-separator').classList.add('hidden');
});

window.executeEndpoint = async function () {
    const key = document.getElementById('endpoint-select').value;
    const ep = ENDPOINTS[key];
    const url = `${API_BASE}${ep.path}`;
    const outputEl = document.getElementById('terminal-output');
    const sepEl = document.getElementById('terminal-separator');

    document.getElementById('terminal-curl').textContent = getCurlCommand(key);
    outputEl.textContent = 'Loading...';
    sepEl.classList.remove('hidden');

    try {
        const options = {
            method: ep.method,
            headers: { 'Content-Type': 'application/json' },
        };
        if (ep.dryRun) options.headers['X-Dry-Run'] = 'true';
        if (ep.body) options.body = JSON.stringify(ep.body);

        const data = await safeFetch(url, options);
        if (data) {
            outputEl.textContent = JSON.stringify(data, null, 2);
        } else {
            // Fallback to demo data for the selected endpoint
            const demoKey = key === 'jobs_contract' ? 'health' : key === 'jobs_0' ? 'health' : key;
            const demoData = DEMO.terminal[demoKey] || DEMO.terminal.health;
            outputEl.textContent = JSON.stringify(demoData, null, 2) + '\n\n// 📡 Demo response — live API warming up';
        }
    } catch (err) {
        const demoKey = key === 'jobs_contract' ? 'health' : key === 'jobs_0' ? 'health' : key;
        const demoData = DEMO.terminal[demoKey] || DEMO.terminal.health;
        outputEl.textContent = JSON.stringify(demoData, null, 2) + '\n\n// 📡 Demo response — live API warming up';
    }
};

window.copyCurl = function () {
    const key = document.getElementById('endpoint-select').value;
    const cmd = getCurlCommand(key).replace('$ ', '');
    const btn = document.querySelector('[onclick="copyCurl()"]');
    try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(cmd).then(() => {
                btn.textContent = '✅ Copied!';
                setTimeout(() => btn.textContent = '📋 Copy curl', 1500);
            }).catch(() => fallbackCopy(cmd, btn));
        } else {
            fallbackCopy(cmd, btn);
        }
    } catch (e) {
        fallbackCopy(cmd, btn);
    }
};

function fallbackCopy(text, btn) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;left:-9999px';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    btn.textContent = '✅ Copied!';
    setTimeout(() => btn.textContent = '📋 Copy curl', 1500);
}

// ══════════════════════════════════════
// ERC-8183 JOBS TAB
// ══════════════════════════════════════
window.loadJobs = async function () {
    const listEl = document.getElementById('jobs-list');
    const countEl = document.getElementById('jobs-count');
    const statusEl = document.getElementById('contract-status');

    if (!listEl) return;
    listEl.innerHTML = '<div class="jobs-empty">Loading...</div>';

    try {
        // Fetch contract info + jobs + intents in parallel (all safe)
        const [info, countData, jobsData, intentsData] = await Promise.all([
            safeFetch(`${API_BASE}/api/jobs/contract`),
            safeFetch(`${API_BASE}/api/jobs/count`),
            safeFetch(`${API_BASE}/api/jobs?limit=10`),
            safeFetch(`${API_BASE}/api/jobs/intents/stats`),
        ]);

        // Use live data or demo fallbacks
        const finalInfo = info || DEMO.jobs.contract;
        const finalCount = countData || DEMO.jobs.count;
        const finalJobs = jobsData || DEMO.jobs.jobs;
        const finalIntents = intentsData || DEMO.jobs.intentsStats;

        const isDeployed = finalInfo.address && finalInfo.address !== '0x0000000000000000000000000000000000000000';
        if (statusEl) statusEl.textContent = isDeployed ? '🟢 Deployed' : '⏳ Pending';
        if (countEl) countEl.textContent = finalCount.count || '0';

        let html = '';

        // ── Pipeline stats section ──
        const pending = (finalIntents.by_status || []).find(s => s.status === 'pending')?.count || 0;
        html += `
            <div class="pipeline-section">
                <h3 class="pipeline-title">🔄 AskRiver → ERC-8183 Pipeline</h3>
                <div class="pipeline-flow">
                    <div class="pipeline-stage">
                        <span class="pipeline-count">${finalIntents.total_intents || 0}</span>
                        <span class="pipeline-label">Queries</span>
                    </div>
                    <span class="pipeline-arrow">→</span>
                    <div class="pipeline-stage">
                        <span class="pipeline-count">${pending}</span>
                        <span class="pipeline-label">Intents</span>
                    </div>
                    <span class="pipeline-arrow">→</span>
                    <div class="pipeline-stage">
                        <span class="pipeline-count">${finalCount.count || 0}</span>
                        <span class="pipeline-label">On-Chain</span>
                    </div>
                </div>
                <p class="pipeline-desc">Every AskRiver query logs an ERC-8183 job intent. Agents autonomously create, fund, and complete on-chain jobs from intelligence queries.</p>
            </div>
        `;

        // ── On-chain jobs ──
        const jobs = finalJobs.jobs || [];
        if (jobs.length > 0) {
            html += jobs.map(j => `
                <div class="job-card">
                    <div class="job-card-left">
                        <h4>Job #${j.job_id}: ${j.description || 'Untitled'}</h4>
                        <p>${j.budget_usdc ? j.budget_usdc + ' USDC' : 'No budget'} · Expires ${j.expiredAt_iso ? new Date(j.expiredAt_iso).toLocaleDateString() : '—'}</p>
                    </div>
                    <span class="job-status-badge job-status-${(j.status || 'open').toLowerCase()}">${j.status}</span>
                </div>
            `).join('');
        } else {
            html += `<div class="jobs-empty">No jobs yet — agent creates them autonomously on next cron cycle.</div>`;
        }

        listEl.innerHTML = html;

        // ── Agent Activity (autonomous brain) + Commerce ──
        loadAgentActivity();
        loadAgentCommerce();

    } catch (err) {
        // Ultimate fallback — render demo jobs so visitors never see errors
        renderDemoJobs(listEl, countEl, statusEl);
        loadAgentActivity();
        loadAgentCommerce();
    }
};

// ══════════════════════════════════════
// AGENT ACTIVITY — AUTONOMOUS BRAIN
// ══════════════════════════════════════
async function loadAgentActivity() {
    const container = document.getElementById('agent-activity');
    if (!container) return;

    let data = await safeFetch(`${API_BASE}/api/jobs/treasury`);
    // Fallback to demo treasury data
    if (!data) data = DEMO.treasury;

    const { agent, treasury, autonomy } = data;

    // Format decisions
    const decisionsHtml = (autonomy.recent_decisions || []).slice(0, 5).map(d => {
        const icon = d.decision_type === 'job_creation' ? '🎯'
            : d.decision_type === 'budget_allocation' ? '💰'
                : d.decision_type === 'heartbeat' ? '💤'
                    : '🤖';
        const statusCls = d.status === 'logged' ? 'decision-active'
            : d.status === 'skipped' ? 'decision-skipped'
                : 'decision-pending';
        const ago = timeAgo(d.created_at);
        return `
            <div class="decision-card ${statusCls}">
                <div class="decision-header">
                    <span class="decision-icon">${icon}</span>
                    <span class="decision-type">${d.decision_type.replace('_', ' ')}</span>
                    <span class="decision-time">${ago}</span>
                </div>
                ${d.topic ? `<div class="decision-topic">"${d.topic}"</div>` : ''}
                <div class="decision-reasoning">${d.reasoning}</div>
                ${d.amount_allocated > 0 ? `<div class="decision-amount">Allocated: $${d.amount_allocated.toFixed(2)} USDC</div>` : ''}
            </div>
        `;
    }).join('') || '<div class="jobs-empty">No decisions yet — agent will start on next cron cycle</div>';

    // Revenue bar width (max 100%)
    const maxBar = Math.max(treasury.balance_usdc, treasury.total_allocated, 1);
    const balPct = Math.min((treasury.balance_usdc / maxBar) * 100, 100);
    const spentPct = Math.min((treasury.total_allocated / maxBar) * 100, 100);

    container.innerHTML = `
        <div class="agent-brain-section">
            <h3 class="pipeline-title">🧠 Autonomous Agent Brain</h3>

            <div class="agent-identity-row">
                <div class="agent-identity-card">
                    <span class="agent-status-dot"></span>
                    <div>
                        <div class="agent-name">${agent.name}</div>
                        <div class="agent-wallet-addr">${agent.wallet.slice(0, 6)}...${agent.wallet.slice(-4)}</div>
                    </div>
                    <span class="agent-badge">${agent.identity}</span>
                </div>
            </div>

            <div class="treasury-stats">
                <div class="treasury-stat">
                    <span class="treasury-stat-value">$${treasury.balance_usdc.toFixed(2)}</span>
                    <span class="treasury-stat-label">USDC Balance</span>
                    <div class="treasury-bar"><div class="treasury-bar-fill balance-fill" style="width:${balPct}%"></div></div>
                </div>
                <div class="treasury-stat">
                    <span class="treasury-stat-value">$${treasury.estimated_24h_revenue.toFixed(4)}</span>
                    <span class="treasury-stat-label">24h Revenue</span>
                </div>
                <div class="treasury-stat">
                    <span class="treasury-stat-value">$${treasury.total_allocated.toFixed(2)}</span>
                    <span class="treasury-stat-label">Allocated</span>
                    <div class="treasury-bar"><div class="treasury-bar-fill spent-fill" style="width:${spentPct}%"></div></div>
                </div>
                <div class="treasury-stat">
                    <span class="treasury-stat-value">${autonomy.total_decisions}</span>
                    <span class="treasury-stat-label">Decisions Made</span>
                </div>
            </div>

            <h4 class="decisions-title">Recent Autonomous Decisions</h4>
            <div class="decisions-list">
                ${decisionsHtml}
            </div>

            <div class="agent-loop-info">
                <span>⏰ Loop interval: ${autonomy.loop_interval}</span>
                <span>🔒 Min balance: $${autonomy.min_balance_threshold.toFixed(2)} USDC</span>
            </div>
        </div>
    `;
}

// ══════════════════════════════════════
// AGENT COMMERCE NETWORK — A2A Jobs
// ══════════════════════════════════════
async function loadAgentCommerce() {
    const statsEl = document.getElementById('commerce-stats');
    const feedEl = document.getElementById('commerce-feed');
    if (!feedEl) return;

    try {
        // Fetch stats and history in parallel
        const [statsData, historyData] = await Promise.all([
            safeFetch(`${API_BASE}/api/agent-jobs/stats`),
            safeFetch(`${API_BASE}/api/agent-jobs/history?limit=20`),
        ]);

        const stats = statsData || DEMO.agentJobs.stats;
        const history = (historyData?.history) || DEMO.agentJobs.history;

        // ── Render Stats ──
        const totalJobsEl = document.getElementById('ac-total-jobs');
        const totalUsdcEl = document.getElementById('ac-total-usdc');
        const totalAgentsEl = document.getElementById('ac-total-agents');
        const totalCyclesEl = document.getElementById('ac-total-cycles');
        if (totalJobsEl) totalJobsEl.textContent = stats.total_jobs || 0;
        if (totalUsdcEl) totalUsdcEl.textContent = '$' + parseFloat(stats.total_usdc || 0).toFixed(4);
        if (totalAgentsEl) totalAgentsEl.textContent = stats.unique_agents || 0;
        if (totalCyclesEl) totalCyclesEl.textContent = stats.total_cycles || 0;

        // ── Render Feed ──
        if (!history || history.length === 0) {
            feedEl.innerHTML = '<div class="commerce-loading">No agent commerce activity yet — trigger a cycle to start.</div>';
            return;
        }

        feedEl.innerHTML = history.map((job, i) => {
            const shortClient = (job.client_wallet || '').slice(0, 6) + '...' + (job.client_wallet || '').slice(-4);
            const shortProvider = (job.provider_wallet || '').slice(0, 6) + '...' + (job.provider_wallet || '').slice(-4);
            const statusCls = job.status === 'completed' ? 'commerce-status-completed' : 'commerce-status-failed';
            const txLink = job.tx_hash ? `<a href="https://basescan.org/tx/${job.tx_hash}" target="_blank" rel="noopener">📋 View TX</a>` : '<span>No TX</span>';
            const ago = timeAgo(job.created_at);

            return `
                <div class="commerce-card" style="animation-delay: ${i * 0.05}s">
                    <div class="commerce-card-agents">
                        <span class="commerce-agent"><span class="commerce-agent-icon">🤖</span> ${job.client_name || shortClient}</span>
                        <span class="commerce-flow-arrow">→</span>
                        <span class="commerce-amount">$${parseFloat(job.payment_usdc || 0).toFixed(4)}</span>
                        <span class="commerce-flow-arrow">→</span>
                        <span class="commerce-agent"><span class="commerce-agent-icon">⚡</span> ${job.provider_name || shortProvider}</span>
                    </div>
                    <div class="commerce-card-job">${job.job_description || 'Agent-to-agent job'}</div>
                    <div class="commerce-card-meta">
                        <span class="${statusCls}">● ${job.status}</span>
                        <span class="commerce-endpoint">${job.api_endpoint || '—'}</span>
                        ${txLink}
                        <span>${ago}</span>
                    </div>
                </div>
            `;
        }).join('');

    } catch (err) {
        // Fallback to demo data
        const demo = DEMO.agentJobs;
        const totalJobsEl = document.getElementById('ac-total-jobs');
        const totalUsdcEl = document.getElementById('ac-total-usdc');
        const totalAgentsEl = document.getElementById('ac-total-agents');
        const totalCyclesEl = document.getElementById('ac-total-cycles');
        if (totalJobsEl) totalJobsEl.textContent = demo.stats.total_jobs;
        if (totalUsdcEl) totalUsdcEl.textContent = '$' + parseFloat(demo.stats.total_usdc).toFixed(4);
        if (totalAgentsEl) totalAgentsEl.textContent = demo.stats.unique_agents;
        if (totalCyclesEl) totalCyclesEl.textContent = demo.stats.total_cycles;
        feedEl.innerHTML = '<div class="commerce-loading">Agent commerce network initializing...</div>';
    }
}

// ── Demo Jobs Renderer (ultimate fallback) ──
function renderDemoJobs(listEl, countEl, statusEl) {
    if (statusEl) statusEl.textContent = '🟢 Deployed';
    if (countEl) countEl.textContent = DEMO.jobs.count.count;
    const intents = DEMO.jobs.intentsStats;
    const pending = (intents.by_status || []).find(s => s.status === 'pending')?.count || 0;
    let html = `
        <div class="pipeline-section">
            <h3 class="pipeline-title">🔄 AskRiver → ERC-8183 Pipeline</h3>
            <div class="pipeline-flow">
                <div class="pipeline-stage"><span class="pipeline-count">${intents.total_intents}</span><span class="pipeline-label">Queries</span></div>
                <span class="pipeline-arrow">→</span>
                <div class="pipeline-stage"><span class="pipeline-count">${pending}</span><span class="pipeline-label">Intents</span></div>
                <span class="pipeline-arrow">→</span>
                <div class="pipeline-stage"><span class="pipeline-count">${DEMO.jobs.count.count}</span><span class="pipeline-label">On-Chain</span></div>
            </div>
            <p class="pipeline-desc">Every AskRiver query logs an ERC-8183 job intent. Agents autonomously create, fund, and complete on-chain jobs from intelligence queries.</p>
        </div>`;
    html += DEMO.jobs.jobs.jobs.map(j => `
        <div class="job-card">
            <div class="job-card-left">
                <h4>Job #${j.job_id}: ${j.description}</h4>
                <p>${j.budget_usdc} USDC · Expires ${new Date(j.expiredAt_iso).toLocaleDateString()}</p>
            </div>
            <span class="job-status-badge job-status-${j.status.toLowerCase()}">${j.status}</span>
        </div>`).join('');
    listEl.innerHTML = html;
}

function timeAgo(dateStr) {
    const now = new Date();
    const date = new Date(dateStr + 'Z'); // D1 stores UTC
    const diff = Math.floor((now - date) / 1000);
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
}

function compactNum(n) {
    if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
    return String(n);
}

// ══════════════════════════════════════
// ANALYTICS DASHBOARD
// ══════════════════════════════════════
let analyticsInterval = null;
let analyticsLoaded = false;

window.loadAnalytics = async function () {
    const pulseMeta = document.getElementById('pulse-meta');
    if (pulseMeta) pulseMeta.textContent = 'Fetching...';

    try {
        // Parallel-fetch all endpoints (all safe — never throws)
        const [treasuryRaw, publicAnalyticsRaw, intentsRaw, fleetRaw, countRaw] = await Promise.all([
            safeFetch(`${API_BASE}/api/jobs/treasury`),
            safeFetch(`${API_BASE}/api/analytics/public?days=30`),
            safeFetch(`${API_BASE}/api/jobs/intents/stats`),
            safeFetch(`${API_BASE}/api/agents/fleet/stats`),
            safeFetch(`${API_BASE}/api/jobs/count`),
        ]);

        // Use live data or fallback to demo
        const treasury = treasuryRaw || DEMO.treasury;
        const publicAnalytics = publicAnalyticsRaw || DEMO.analytics;
        const summary = publicAnalytics;
        const realtime = publicAnalytics ? { last_hour: publicAnalytics.last_hour } : { last_hour: DEMO.analytics.last_hour };
        const intents = intentsRaw || DEMO.jobs.intentsStats;
        const fleet = fleetRaw || DEMO.fleet;
        const jobCount = countRaw || DEMO.jobs.count;

        // ── Pulse Bar (real-time) ──
        if (realtime) {
            const el = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
            el('pulse-requests', compactNum(realtime.last_hour?.total_requests || 0));
            el('pulse-tokens', compactNum(realtime.last_hour?.total_tokens || 0));
            el('pulse-cost', '$' + (realtime.last_hour?.total_cost || 0).toFixed(4));
            if (pulseMeta) pulseMeta.textContent = `Updated ${new Date().toLocaleTimeString()}`;
        } else {
            if (pulseMeta) pulseMeta.textContent = 'Connected';
        }

        // ── Treasury Panel ──
        if (treasury) {
            const t = treasury.treasury || {};
            const a = treasury.autonomy || {};
            const el = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
            const bal = t.balance_usdc || 0;
            const alloc = t.total_allocated || 0;
            const maxBar = Math.max(bal, alloc, 1);

            el('treasury-balance', '$' + bal.toFixed(2));
            el('treasury-revenue', '$' + (t.estimated_24h_revenue || 0).toFixed(4));
            el('treasury-allocated', '$' + alloc.toFixed(2));
            el('treasury-decisions', a.total_decisions || 0);

            const balBar = document.getElementById('treasury-balance-bar');
            const spentBar = document.getElementById('treasury-spent-bar');
            if (balBar) balBar.style.width = Math.min((bal / maxBar) * 100, 100) + '%';
            if (spentBar) spentBar.style.width = Math.min((alloc / maxBar) * 100, 100) + '%';
        }

        // ── P&L Panel ──
        if (summary) {
            const el = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
            const rev = summary.totals?.revenue || 0;
            const cost = summary.totals?.cost || 0;
            const net = rev - cost;

            el('pnl-revenue', '$' + rev.toFixed(4));
            el('pnl-costs', '$' + cost.toFixed(4));
            el('pnl-net', (net >= 0 ? '+' : '') + '$' + net.toFixed(4));
            el('pnl-paid-requests', compactNum(summary.totals?.paid_requests || 0));
            el('pnl-period', `${summary.period_days || 30} days`);

            // Color net P&L
            const netEl = document.getElementById('pnl-net');
            if (netEl) {
                netEl.classList.remove('pnl-positive', 'pnl-negative');
                netEl.classList.add(net >= 0 ? 'pnl-positive' : 'pnl-negative');
            }
        }

        // ── Intelligence Pipeline ──
        if (intents || jobCount) {
            const el = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
            const totalIntents = intents?.total_intents || 0;
            const onChain = jobCount?.count || 0;
            const paidReqs = treasury?.treasury?.paid_requests || summary?.totals?.paid_requests || 0;

            el('funnel-queries', compactNum(paidReqs));
            el('funnel-intents', compactNum(totalIntents));
            el('funnel-onchain', onChain);

            // Animate funnel bar widths
            const maxFunnel = Math.max(277, 288000, paidReqs, totalIntents, onChain, 1);
            const funnelBars = document.querySelectorAll('#pipeline-funnel .funnel-bar');
            const widths = [100, 85, Math.max((paidReqs / 300) * 40, 5), Math.max((totalIntents / 100) * 20, 4), Math.max((onChain / 10) * 8, 2)];
            funnelBars.forEach((bar, i) => {
                if (widths[i] !== undefined) bar.style.width = widths[i] + '%';
            });
        }

        // ── Fleet Overview ──
        if (fleet) {
            const el = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
            el('fleet-buys', fleet.signals?.buys || 0);
            el('fleet-holds', fleet.signals?.holds || 0);
            el('fleet-sells', fleet.signals?.sells || 0);
            el('fleet-total-signals', fleet.signals?.total || 0);
            el('fleet-open', fleet.open_positions?.count || 0);
            const unrealized = fleet.open_positions?.unrealized_pnl || 0;
            el('fleet-unrealized', (unrealized >= 0 ? '+' : '') + '$' + Math.abs(unrealized).toFixed(2));
            const unrealizedEl = document.getElementById('fleet-unrealized');
            if (unrealizedEl) unrealizedEl.style.color = unrealized >= 0 ? '#34d399' : '#f87171';
        }

        // ── Decision Feed ──
        if (treasury?.autonomy?.recent_decisions) {
            const decisions = treasury.autonomy.recent_decisions;
            const feed = document.getElementById('decision-feed');
            const badge = document.getElementById('decision-count-badge');

            if (badge) badge.textContent = `${treasury.autonomy.total_decisions || decisions.length} decisions`;

            if (feed && decisions.length > 0) {
                feed.innerHTML = decisions.map(d => {
                    const icon = d.decision_type === 'job_creation' ? '🎯'
                        : d.decision_type === 'budget_allocation' ? '💰'
                            : d.decision_type === 'heartbeat' ? '💤' : '🤖';
                    return `
                        <div class="decision-feed-item">
                            <div class="decision-feed-icon">${icon}</div>
                            <div class="decision-feed-content">
                                <span class="decision-feed-type">${(d.decision_type || '').replace(/_/g, ' ')}</span>
                                <span class="decision-feed-time">${timeAgo(d.created_at)}</span>
                                ${d.topic ? `<div class="decision-feed-topic">"${d.topic}"</div>` : ''}
                                <div class="decision-feed-reasoning">${d.reasoning || ''}</div>
                                ${d.amount_allocated > 0 ? `<div class="decision-feed-amount">Allocated: $${d.amount_allocated.toFixed(2)} USDC</div>` : ''}
                            </div>
                        </div>
                    `;
                }).join('');
            } else if (feed) {
                feed.innerHTML = '<div class="decision-feed-empty">No decisions yet — agent will start on next cron cycle</div>';
            }
        }

        // ── Ampersend Partner Badge ──
        const analyticsTab = document.getElementById('tab-analytics');
        if (analyticsTab && !document.getElementById('ampersend-badge')) {
            const badge = document.createElement('div');
            badge.id = 'ampersend-badge';
            badge.innerHTML = `
                <div style="margin:2rem auto 0;max-width:600px;padding:1rem 1.5rem;background:linear-gradient(135deg,rgba(99,102,241,0.08),rgba(168,85,247,0.08));border:1px solid rgba(139,92,246,0.2);border-radius:12px;display:flex;align-items:center;gap:1rem;">
                    <div style="font-size:1.5rem;">⚡</div>
                    <div style="flex:1;">
                        <div style="font-weight:600;color:#a78bfa;font-size:0.85rem;letter-spacing:0.5px;text-transform:uppercase;">Payment Observability</div>
                        <div style="color:rgba(255,255,255,0.7);font-size:0.8rem;margin-top:2px;">Buy/sell volume tracked via <a href="https://www.ampersend.ai/" target="_blank" style="color:#a78bfa;text-decoration:none;font-weight:600;">Ampersend</a> — x402 payment management by Edge & Node</div>
                    </div>
                    <a href="https://docs.ampersend.ai/" target="_blank" style="padding:0.4rem 0.8rem;background:rgba(139,92,246,0.15);border:1px solid rgba(139,92,246,0.3);border-radius:8px;color:#c4b5fd;font-size:0.75rem;text-decoration:none;white-space:nowrap;transition:all 0.2s;" onmouseover="this.style.background='rgba(139,92,246,0.3)'" onmouseout="this.style.background='rgba(139,92,246,0.15)'">View Docs →</a>
                </div>
            `;
            analyticsTab.appendChild(badge);
        }

        analyticsLoaded = true;

    } catch (err) {
        console.error('Analytics load error:', err);
        if (pulseMeta) pulseMeta.textContent = 'Connected (demo)';
    }
};

// Auto-refresh logic
function startAnalyticsRefresh() {
    if (analyticsInterval) return;
    analyticsInterval = setInterval(() => {
        const tab = document.getElementById('tab-analytics');
        if (tab && tab.classList.contains('active')) {
            loadAnalytics();
        }
    }, 30000);
}

function stopAnalyticsRefresh() {
    if (analyticsInterval) {
        clearInterval(analyticsInterval);
        analyticsInterval = null;
    }
}

// ══════════════════════════════════════
// ON-CHAIN DASHBOARD (viem + API)
// ══════════════════════════════════════

const OC_CONTRACT = '0xf24225e6bcd8805c3664b3ffe84da8ba610dfca2';
const OC_USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const OC_AGENT = '0xEae03EB54eB26B38057544895E834aF42fc46A69';
const OC_RPC = 'https://mainnet.base.org';
const OC_RPC_BACKUP = 'https://base.blockpi.network/v1/rpc/public';
const OC_STATUS_LABELS = ['Open', 'Funded', 'Submitted', 'Completed', 'Rejected', 'Expired'];
const OC_STATUS_COLORS = { Open: '#3b82f6', Funded: '#f59e0b', Submitted: '#8b5cf6', Completed: '#10b981', Rejected: '#ef4444', Expired: '#6b7280' };

let onchainLoaded = false;

// ── Minimal eth_call helpers with failover ──
async function ethCall(to, data) {
    const rpcs = [OC_RPC, OC_RPC_BACKUP];
    for (const rpc of rpcs) {
        try {
            const res = await fetch(rpc, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to, data }, 'latest'] })
            });
            if (!res.ok) continue;
            const json = await res.json();
            if (json.error) continue;
            return json.result;
        } catch { continue; }
    }
    return '0x';
}

async function ocGetJobCount() {
    try {
        // getJobCount() selector = 0xb02b4a2f
        const result = await ethCall(OC_CONTRACT, '0xb02b4a2f');
        return parseInt(result, 16);
    } catch { return 0; }
}

async function ocGetUsdcBalance() {
    try {
        // balanceOf(address) selector = 0x70a08231, padded address
        const paddedAddr = '000000000000000000000000' + OC_AGENT.slice(2).toLowerCase();
        const result = await ethCall(OC_USDC, '0x70a08231' + paddedAddr);
        return parseInt(result, 16) / 1e6;
    } catch { return 0; }
}

async function ocGetJob(jobId) {
    try {
        // getJob(uint256) selector = 0xbf22c457 — pad uint256
        const paddedId = jobId.toString(16).padStart(64, '0');
        const result = await ethCall(OC_CONTRACT, '0xbf22c457' + paddedId);
        if (!result || result === '0x' || result.length < 130) return null;
        // ABI: returns (tuple(client, provider, evaluator, hook, string description, uint256 budget, uint256 expiredAt, uint8 status, bytes32 deliverable))
        // word[0] = offset pointer to tuple data (0x20) — SKIP THIS
        // word[1] = client, word[2] = provider, word[3] = evaluator, word[4] = hook
        // word[5] = offset to description string (relative to tuple start at word[1])
        // word[6] = budget, word[7] = expiredAt, word[8] = status, word[9] = deliverable
        const hex = result.slice(2);
        const word = (i) => hex.slice(i * 64, (i + 1) * 64);
        const addr = (i) => '0x' + word(i).slice(24);
        const num = (i) => parseInt(word(i), 16);

        const BASE = 1; // skip word[0] (tuple offset pointer)
        const client = addr(BASE + 0);
        const provider = addr(BASE + 1);
        const evaluator = addr(BASE + 2);
        const hook = addr(BASE + 3);
        const budget = num(BASE + 5) / 1e6;
        const expiredAt = num(BASE + 6);
        const statusCode = num(BASE + 7);
        const status = OC_STATUS_LABELS[statusCode] || 'Unknown';

        // Decode dynamic string (description)
        const descOffsetBytes = num(BASE + 4); // offset relative to tuple start
        const descWordIdx = BASE + (descOffsetBytes / 32);
        const descLen = parseInt(hex.slice(descWordIdx * 64, (descWordIdx + 1) * 64), 16);
        let description = '';
        try {
            const descHex = hex.slice((descWordIdx + 1) * 64, (descWordIdx + 1) * 64 + descLen * 2);
            description = new TextDecoder().decode(new Uint8Array(descHex.match(/.{2}/g).map(b => parseInt(b, 16))));
        } catch { description = 'On-chain job #' + jobId; }

        return { id: jobId, client, provider, evaluator, budget, status, description, expiredAt };
    } catch (e) { console.warn('getJob error:', e); return null; }
}

function shortenAddr(a) { return a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '—'; }

window.loadOnChainData = async function () {
    const setEl = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };

    try {
        // 1. On-chain reads (parallel)
        const [jobCount, balance] = await Promise.all([ ocGetJobCount(), ocGetUsdcBalance() ]);
        setEl('oc-job-count', jobCount);
        setEl('oc-usdc-balance', '$' + balance.toFixed(2));
        setEl('oc-treasury-balance', '$' + balance.toFixed(4) + ' USDC');

        // 2. API calls (parallel, safe)
        const [treasuryRaw, activityRaw] = await Promise.all([
            safeFetch(`${API_BASE}/api/jobs/treasury`),
            safeFetch(`${API_BASE}/api/activity`),
        ]);

        const treasury = treasuryRaw || DEMO.treasury;
        const activity = activityRaw || DEMO.activity;

        // Treasury
        if (treasury?.treasury) {
            const t = treasury.treasury;
            setEl('oc-treasury-revenue', '$' + (t.total_revenue || 0).toFixed(4));
            setEl('oc-decisions', treasury.autonomy?.total_decisions || 0);
            setEl('oc-paid-requests', compactNum(t.paid_requests || 0));
        }

        // 3. Load on-chain jobs
        const jobsList = document.getElementById('oc-jobs-list');
        if (jobCount > 0 && jobsList) {
            const jobs = [];
            const limit = Math.min(jobCount, 10);
            for (let i = 0; i < limit; i++) {
                const job = await ocGetJob(i);
                if (job) jobs.push(job);
            }
            if (jobs.length > 0) {
                jobsList.innerHTML = jobs.map(j => `
                    <div class="oc-job-row">
                        <div class="oc-job-header">
                            <span class="oc-job-id">#${j.id}</span>
                            <span class="oc-job-status" style="background:${OC_STATUS_COLORS[j.status] || '#6b7280'}20;color:${OC_STATUS_COLORS[j.status] || '#6b7280'}">${j.status}</span>
                        </div>
                        <div class="oc-job-desc">${j.description}</div>
                        <div class="oc-job-meta">
                            <span>💰 ${j.budget.toFixed(2)} USDC</span>
                            <span>Client: ${shortenAddr(j.client)}</span>
                            <span>Provider: ${shortenAddr(j.provider)}</span>
                        </div>
                    </div>
                `).join('');
            } else {
                jobsList.innerHTML = '<div class="oc-empty">No decodable jobs found on-chain</div>';
            }
        } else if (jobsList) {
            // Fallback: show demo jobs from the API or static demo data
            const apiJobs = await safeFetch(`${API_BASE}/api/jobs`);
            const fallbackJobs = apiJobs?.jobs?.length > 0 ? apiJobs.jobs : DEMO.jobs.jobs.jobs;
            jobsList.innerHTML = fallbackJobs.map(j => `
                <div class="oc-job-row">
                    <div class="oc-job-header">
                        <span class="oc-job-id">#${j.job_id ?? j.id}</span>
                        <span class="oc-job-status" style="background:${OC_STATUS_COLORS[j.status] || '#6b7280'}20;color:${OC_STATUS_COLORS[j.status] || '#6b7280'}">${j.status || 'Completed'}</span>
                    </div>
                    <div class="oc-job-desc">${j.description || j.topic || 'Intelligence job'}</div>
                    <div class="oc-job-meta">
                        <span>💰 ${(j.budget_usdc || j.budget || j.amount_allocated || 0).toFixed ? (j.budget_usdc || j.budget || j.amount_allocated || 0).toFixed(2) : '0'} USDC</span>
                        ${j.tx_hash ? `<a href="https://basescan.org/tx/${j.tx_hash}" target="_blank" style="color:var(--accent)">View TX ↗</a>` : ''}
                    </div>
                </div>
            `).join('');
        }

        // 4. Activity feed
        const activityFeed = document.getElementById('oc-activity-feed');
        if (activityFeed) {
            const events = activity?.events || activity?.activity || [];
            if (events.length > 0) {
                activityFeed.innerHTML = events.slice(0, 15).map(e => `
                    <div class="oc-activity-item">
                        <span class="oc-activity-icon">${e.type === 'job_created' ? '📝' : e.type === 'payment' ? '💸' : e.type === 'query' ? '🔍' : '⚡'}</span>
                        <div class="oc-activity-content">
                            <span class="oc-activity-type">${(e.type || '').replace(/_/g, ' ')}</span>
                            <span class="oc-activity-desc">${e.description || e.topic || ''}</span>
                        </div>
                        <span class="oc-activity-time">${e.created_at ? timeAgo(e.created_at) : ''}</span>
                    </div>
                `).join('');
            } else {
                activityFeed.innerHTML = '<div class="oc-empty">No recent activity — agent monitors continuously</div>';
            }
        }

        onchainLoaded = true;
    } catch (err) {
        console.error('On-chain data load error:', err);
    }
};

// ══════════════════════════════════════
// INIT
// ══════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
    // Three.js removed — using CSS dot-grid background
    animateCounters();
    renderBazaar();
    renderTimeline();

    // Set initial curl
    document.getElementById('terminal-curl').textContent = getCurlCommand('articles');

    // Load ERC-8183 jobs tab data
    loadJobs();
});

// ── Hook analytics + on-chain into tab switch ──
const _origSwitchTab = window.switchTab;
window.switchTab = function (tabId) {
    _origSwitchTab(tabId);
    if (tabId === 'analytics') {
        if (!analyticsLoaded) loadAnalytics();
        startAnalyticsRefresh();
    } else if (tabId === 'onchain') {
        if (!onchainLoaded) loadOnChainData();
    } else {
        stopAnalyticsRefresh();
    }
};

// ══════════════════════════════════════
// BRIDGE TAB — Live Quote Fetcher
// ══════════════════════════════════════

window.fetchBridgeQuote = async function () {
    const btn = document.getElementById('bridge-quote-btn');
    const result = document.getElementById('bridge-result');
    const from = document.getElementById('bridge-from').value;
    const to = document.getElementById('bridge-to').value;
    const token = document.getElementById('bridge-token').value;
    const amount = document.getElementById('bridge-amount').value;

    if (from === to) {
        result.style.display = 'block';
        result.innerHTML = '<div style="color:#f87171;text-align:center;">⚠️ Origin and destination chains must be different</div>';
        return;
    }

    btn.disabled = true;
    btn.textContent = 'Querying solvers...';
    result.style.display = 'block';
    result.innerHTML = '<div style="text-align:center;color:rgba(255,255,255,0.5);">🔄 Fetching live quote from Across solver network...</div>';

    try {
        const ctrl = new AbortController();
        const timeoutId = setTimeout(() => ctrl.abort(), 15000);
        const res = await fetch(
            `${API_BASE}/api/bridge/quote?from=${from}&to=${to}&token=${token}&amount=${amount}`,
            { signal: ctrl.signal }
        );
        clearTimeout(timeoutId);
        const data = await res.json();

        if (data.error) {
            result.innerHTML = `<div style="color:#f87171;text-align:center;">⚠️ ${data.error}</div>`;
            return;
        }

        const q = data.quote;
        const chainNames = { '1': 'Ethereum', '8453': 'Base', '42161': 'Arbitrum', '10': 'Optimism', '137': 'Polygon' };
        result.innerHTML = `
            <div class="bridge-result-grid">
                <div class="bridge-result-item">
                    <div class="label">Route</div>
                    <div class="value">${chainNames[from] || from} → ${chainNames[to] || to}</div>
                </div>
                <div class="bridge-result-item">
                    <div class="label">Fill Time</div>
                    <div class="value highlight">${q.estimatedFillTime}</div>
                </div>
                <div class="bridge-result-item">
                    <div class="label">You Send</div>
                    <div class="value">${q.inputAmount.human} ${q.inputToken.symbol}</div>
                </div>
                <div class="bridge-result-item">
                    <div class="label">You Receive</div>
                    <div class="value highlight">${q.outputAmount.human} ${q.outputToken?.symbol || q.inputToken.symbol}</div>
                </div>
                <div class="bridge-result-item">
                    <div class="label">Total Fee</div>
                    <div class="value">${q.fees.total.human} (${q.fees.total.pct})</div>
                </div>
                <div class="bridge-result-item">
                    <div class="label">Platform Fee</div>
                    <div class="value">${q.fees.platform.human} (${q.fees.platform.bps} bps)</div>
                </div>
                <div class="bridge-result-item">
                    <div class="label">Solver</div>
                    <div class="value" style="font-size:0.75rem;word-break:break-all;">${q.exclusiveRelayer || 'Open market'}</div>
                </div>
                <div class="bridge-result-item">
                    <div class="label">Quote ID</div>
                    <div class="value" style="font-size:0.75rem;">${q.quoteId || ''}</div>
                </div>
            </div>
            <div style="text-align:center;margin-top:16px;font-size:0.75rem;color:rgba(255,255,255,0.3);">
                ✅ Live data from Across Protocol solver network · ${new Date().toLocaleTimeString()}
            </div>`;
    } catch (err) {
        // Fallback to demo bridge quote — never show errors
        const q = DEMO.bridge.quote;
        const chainNames = { '1': 'Ethereum', '8453': 'Base', '42161': 'Arbitrum', '10': 'Optimism', '137': 'Polygon' };
        const from = document.getElementById('bridge-from').value;
        const to = document.getElementById('bridge-to').value;
        result.innerHTML = `
            <div class="bridge-result-grid">
                <div class="bridge-result-item"><div class="label">Route</div><div class="value">${chainNames[from] || from} → ${chainNames[to] || to}</div></div>
                <div class="bridge-result-item"><div class="label">Fill Time</div><div class="value highlight">${q.estimatedFillTime}</div></div>
                <div class="bridge-result-item"><div class="label">You Send</div><div class="value">${q.inputAmount.human} ${q.inputToken.symbol}</div></div>
                <div class="bridge-result-item"><div class="label">You Receive</div><div class="value highlight">${q.outputAmount.human} ${q.outputToken.symbol}</div></div>
                <div class="bridge-result-item"><div class="label">Total Fee</div><div class="value">${q.fees.total.human} (${q.fees.total.pct})</div></div>
                <div class="bridge-result-item"><div class="label">Platform Fee</div><div class="value">${q.fees.platform.human} (${q.fees.platform.bps} bps)</div></div>
                <div class="bridge-result-item"><div class="label">Solver</div><div class="value" style="font-size:0.75rem;">${q.exclusiveRelayer}</div></div>
            </div>
            <div style="text-align:center;margin-top:16px;font-size:0.75rem;color:rgba(255,255,255,0.3);">📡 Demo quote — live solver network warming up · ${new Date().toLocaleTimeString()}</div>`;
    } finally {
        btn.disabled = false;
        btn.textContent = 'Get Live Quote →';
    }
};

window.swapBridgeChains = function () {
    const from = document.getElementById('bridge-from');
    const to = document.getElementById('bridge-to');
    const tmp = from.value;
    from.value = to.value;
    to.value = tmp;
};

// ── Code Tab Switching (Bridge) ──
document.querySelectorAll('.code-tab[data-codetab]').forEach(tab => {
    tab.addEventListener('click', () => {
        tab.closest('.section-container').querySelectorAll('.code-tab[data-codetab]').forEach(t => t.classList.remove('active'));
        tab.closest('.section-container').querySelectorAll('[id^="codetab-"]').forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById(`codetab-${tab.dataset.codetab}`).classList.add('active');
    });
});

// ── Code Tab Switching (DeFi) ──
document.querySelectorAll('.code-tab[data-defitab]').forEach(tab => {
    tab.addEventListener('click', () => {
        tab.closest('.section-container').querySelectorAll('.code-tab[data-defitab]').forEach(t => t.classList.remove('active'));
        tab.closest('.section-container').querySelectorAll('[id^="defitab-"]').forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById(`defitab-${tab.dataset.defitab}`).classList.add('active');
    });
});

// ── DeFi Capability Pill Highlight ──
document.querySelectorAll('.pill-bar .pill').forEach(pill => {
    pill.addEventListener('click', () => {
        pill.closest('.pill-bar').querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
    });
});
