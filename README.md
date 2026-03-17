<p align="center">
  <h1 align="center">🐺 FENRIR</h1>
  <p align="center"><strong>On-chain OpenGov risk intelligence for Polkadot.</strong></p>
  <p align="center"><em>Track 2 — PVM Smart Contracts | Polkadot Solidity Hackathon 2026</em></p>
</p>

<p align="center">
  <a href="#live-demo">Live Demo</a> •
  <a href="#why-only-on-polkadot">Why Only On Polkadot</a> •
  <a href="#architecture">Architecture</a> •
  <a href="#contracts--addresses">Contracts</a> •
  <a href="#quick-start">Quick Start</a> •
  <a href="#testing">Testing</a>
</p>

---

## Live Demo

- App: https://fenrir-opengov.vercel.app/
- Status: ✅ Shipped and live

---

## What Fenrir Ships

Fenrir is a complete on-chain governance risk stack that reads live referendum data, scores proposals with Rust inference on PolkaVM, stores explainable results on-chain, and serves a production-ready frontend + auto-scorer workflow.

### Core Capabilities

- ✅ Governance precompile integration (`0x0807`) for proposal + proposer history
- ✅ Rust inference contract returning packed risk score + flags
- ✅ Solidity orchestration contract with persistent stats and events
- ✅ Asset Hub precompile integration (`0x0808`) for large-request detection
- ✅ Frontend with proposal feed, score details, urgent alerts, stats view, and narrative charting
- ✅ Auto-scorer backend service for continuous scoring flow
- ✅ Full ML pipeline: scrape → train → export weights → on-chain inference constants

---

## Why Only On Polkadot

- **Native governance precompiles**: Fenrir reads governance state directly from chain-level precompiles instead of relying on centralized APIs.
- **Rust inference on PolkaVM**: Risk logic executes natively in Rust/PVM and is callable from Solidity contracts.
- **Cross-runtime composition**: Solidity + Rust + precompiles work as one trustless pipeline in the same ecosystem.

---

## Architecture

```text
                         POLKADOT HUB

  Governance Precompile (0x0807)
             │
             ▼
      FenrirScorer.sol (EVM)
      - reads referendum data
      - derives features
      - calls PVM inference
      - stores score + flags + stats
             │
             ▼
      FenrirInference (Rust / PolkaVM)
      - packed uint64 output
      - score (upper 32 bits)
      - flags (lower bits)

  Asset Hub Precompile (0x0808)
      - native asset request checks
      - large-request flag reinforcement

  Frontend (React/Vite)
      - proposals
      - score details
      - urgency signals
      - stats + donut distribution

  Backend AutoScorer (Node/TS)
      - continuous scoring workflow
      - startup scan + ongoing updates
```

---

## Contracts & Addresses

### Testnet Deployment

| Contract | Address |
|---|---|
| FenrirScorer | `0xC85154584f2A491d65A3B034c9BbBe87c7753e3e` |
| FenrirInference | `0xc60FfD7b415e00def0153dc420447cFdE1FAa8B3` |

### RPC

- `https://services.polkadothub-rpc.com/testnet`

---

## Risk Model Output

Fenrir publishes:

- **Score**: `0–100`
- **Verdict bands**:
  - `75–100`: HIGH RISK
  - `50–74`: MODERATE RISK
  - `25–49`: LOW RISK
  - `0–24`: MINIMAL RISK
- **Flags**:
  - `0x01` New wallet
  - `0x02` Large request
  - `0x04` No history
  - `0x08` Low approval
  - `0x10` Burst activity

---

## Quick Start

```bash
git clone https://github.com/StevenDanielL17/Fenrir.git
cd Fenrir
forge install
forge build
forge test
cd ml && pip install -r requirements.txt && python scraper.py && python train.py && cd ..
cd frontend && npm install && npm run dev
```

---

## Testing

Run contract tests:

```bash
forge test -v
```

Run ML pipeline:

```bash
cd ml
python scraper.py
python train.py
python export_weights.py
```

Run frontend production build:

```bash
cd frontend
npm run build
```

---

## Repository Structure

```text
contracts/   Solidity contracts + interfaces + tests
inference/   Rust PolkaVM inference contract
ml/          Data pipeline + training + weight export
frontend/    React/Vite dashboard
backend/     Auto-scorer services
```

---

## Hackathon Declaration

- **Track**: Track 2 — PVM Smart Contracts
- **Project**: Fenrir
- **Category fit**: PVM + precompiles + native governance intelligence

---

<p align="center">
  <strong>Fenrir — shipped governance intelligence for Polkadot OpenGov.</strong>
</p>
