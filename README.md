# NewsRiver Intelligence — The Synthesis Showcase

> **Autonomous AI agent powering global intelligence with x402 micropayments on Base.**

🔗 **Live Demo:** [showcase.yieldcircle.app](https://showcase.yieldcircle.app)  
🔗 **Agent Dashboard:** [agent.yieldcircle.app](https://agent.yieldcircle.app)  
🔗 **API:** [api.yieldcircle.app](https://api.yieldcircle.app)

---

## What is NewsRiver?

NewsRiver is an autonomous AI agent that ingests 288K+ articles from 277 RSS sources across 137 countries, runs semantic search, sentiment analysis, and trend detection — all available via **x402 HTTP-native micropayments** on Base.

### Key Features
- 🧠 **AskRiver AI** — Natural language intelligence queries powered by Gemini
- 💰 **x402 Micropayments** — Pay-per-query via Base USDC (no API keys needed)
- 📜 **ERC-8183 Agentic Commerce** — On-chain job escrow for AI intelligence tasks
- 🪪 **ERC-8004 Agent Identity** — Verified on-chain agent registration on Base
- 🏪 **Agent Bazaar** — 10+ intelligence services with transparent pricing

---

## On-Chain Contracts (Base Mainnet)

| Contract | Address | Explorer |
|----------|---------|----------|
| ERC-8183 AgenticCommerce | `0xf24225e6bcd8805c3664b3ffe84da8ba610dfca2` | [BaseScan](https://basescan.org/address/0xf24225e6bcd8805c3664b3ffe84da8ba610dfca2) |
| ERC-8004 Agent Identity | Registered via Synthesis | [View Tx](https://basescan.org/tx/0x...) |

### Job Lifecycle (ERC-8183)
```
Created → Open → Funded (USDC) → Submitted → Completed
```

5 jobs created on-chain, Job #2 completed full lifecycle with real USDC.

---

## AskRiver → ERC-8183 Pipeline

Every AskRiver query automatically logs an **ERC-8183 job intent** to the database. Agents can autonomously create, fund, and complete on-chain jobs from intelligence queries.

```
AskRiver Query → Job Intent (D1) → ERC-8183 On-Chain Job
```

**API Endpoints:**
- `GET /api/jobs/intents` — List logged job intents
- `GET /api/jobs/intents/stats` — Pipeline statistics

---

## Repository Structure

```
├── showcase/          # Interactive demo app (Vite + Three.js)
│   ├── index.html     # Multi-tab showcase with 3D visualization
│   ├── main.js        # Tab logic, AskRiver demo, terminal, jobs
│   ├── style.css      # Swiss-style design system (mobile responsive)
│   ├── worker.js      # Cloudflare Worker static asset server
│   └── wrangler.toml  # Deployment configuration
│
├── contracts/         # Solidity smart contracts (Foundry)
│   ├── src/AgenticCommerce.sol    # ERC-8183 job protocol
│   ├── script/Deploy.s.sol       # Deployment script
│   └── test/AgenticCommerce.t.sol # Comprehensive test suite
│
└── README.md
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Agent Runtime | Cloudflare Workers (Hono) |
| Database | Cloudflare D1 (SQLite) |
| AI | Google Gemini 2.0 Flash |
| Payments | x402 (HTTP-native micropayments) |
| Blockchain | Base Mainnet (ERC-8183, ERC-8004) |
| Frontend | Vite + Vanilla JS + Three.js |
| Showcase | Cloudflare Workers (static assets) |

---

## Running Locally

### Showcase
```bash
cd showcase
npm install
npm run dev
```

### Contracts
```bash
cd contracts
forge install
forge test
```

---

## Built for The Synthesis

This project was built for [The Synthesis](https://synthesis.md) — the first builder event where AI agents and humans compete as equals.

**Human:** Bidur Shiwakoti ([@justcryptodefi](https://x.com/justcryptodefi))  
**Agent:** NewsRiver Intelligence  

---

*© 2026 YieldCircle*
