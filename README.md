<p align="center">
  <h1 align="center">🐺 FENRIR</h1>
  <p align="center"><strong>On-Chain OpenGov Risk Intelligence for Polkadot</strong></p>
  <p align="center">
    <em>The wolf that hunts corruption in governance.</em>
  </p>
</p>

<p align="center">
  <a href="#architecture">Architecture</a> •
  <a href="#how-it-works">How It Works</a> •
  <a href="#getting-started">Getting Started</a> •
  <a href="#contracts">Contracts</a> •
  <a href="#ml-pipeline">ML Pipeline</a> •
  <a href="#frontend">Frontend</a> •
  <a href="#deployment">Deployment</a> •
  <a href="#why-polkadot">Why Polkadot</a>
</p>

---

## The Problem

Polkadot's OpenGov processes treasury requests worth **millions of DOT**. Human reviewers can't scale. Malicious actors submit treasury drain proposals with new wallets, inflated budgets, and recycled pitches — and sometimes they pass. There is no automated, trustless risk assessment layer.

## The Solution

**Fenrir** is an on-chain risk scoring system deployed on Polkadot Hub that analyzes OpenGov treasury proposals in real-time.

A Solidity contract reads live proposal data via the **governance precompile**, feeds structured features into a **Rust-compiled ML classifier running natively on PolkaVM**, and writes a public **risk score (0–100)** with explainable flags back on-chain — **no oracle, no off-chain service, no trust assumption**.

Any wallet, UI, or contract in the Polkadot ecosystem can read a proposal's Fenrir score before voting.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     POLKADOT HUB                            │
│                                                             │
│  ┌──────────────┐    ┌─────────────────────────────────┐   │
│  │  Governance  │───▶│     FenrirScorer.sol            │   │
│  │  Precompile  │    │  (Solidity - REVM/EVM layer)    │   │
│  │  (0x0807)    │    │  - Reads proposal data          │   │
│  └──────────────┘    │  - Encodes feature vector       │   │
│                      │  - Calls PVM inference contract │   │
│  ┌──────────────┐    │  - Stores score + flags         │   │
│  │ Asset Hub    │───▶│  - Emits ScorePublished event   │   │
│  │ Precompile   │    └──────────────┬──────────────────┘   │
│  │ (native DOT  │                   │ cross-contract call   │
│  │  threshold)  │    ┌──────────────▼──────────────────┐   │
│  └──────────────┘    │     FenrirInference (PVM)        │   │
│                      │  Rust contract compiled to       │   │
│  ┌──────────────┐    │  RISC-V — runs ML classifier    │   │
│  │ XCM Precomp  │    │  with hardcoded weights         │   │
│  │ (0x0803)     │◀───│  Returns: score + flag bitmask  │   │
│  └──────────────┘    └─────────────────────────────────┘   │
│         │                                                   │
└─────────┼───────────────────────────────────────────────────┘
          │ XCM broadcast (optional)
          ▼
    Asset Hub / other parachains read Fenrir scores
```

### Three-Layer Design

| Layer               | Technology            | Purpose                                                                     |
| ------------------- | --------------------- | --------------------------------------------------------------------------- |
| **FenrirScorer**    | Solidity (EVM)        | Reads governance data via precompiles, orchestrates scoring, stores results |
| **FenrirInference** | Rust (PolkaVM/RISC-V) | Runs ML classifier with hardcoded weights, returns score + flag bitmask     |
| **ML Pipeline**     | Python (off-chain)    | Trains model on historical proposals, exports weights to Rust constants     |

---

## How It Works

### 1. Score a Proposal

Call `scoreReferendum(refIndex)` on the FenrirScorer contract. The contract:

1. **Fetches proposal data** from the governance precompile (`0x0807`) — proposer address, requested DOT amount, submission block, content hash
2. **Fetches proposer history** — total proposals, approval count, first activity block
3. **Encodes a feature vector** — wallet age, DOT ratio to ecosystem average, approval rate, track ID
4. **Calls the PVM inference contract** — Rust-compiled ML model processes the features and returns a risk score (0–100) and flag bitmask
5. **Stores the result on-chain** — score, flags, and block number are permanently recorded
6. **Emits `ScorePublished` event** — frontends and other contracts can listen and react

### 2. Read a Score

Call `getScore(refIndex)` to receive:

- **Risk score** (0–100)
- **Verdict** — `MINIMAL RISK`, `LOW RISK`, `MODERATE RISK`, or `HIGH RISK`
- **Active flags** — human-readable explanations of what triggered the score

### 3. Risk Flags (Explainability)

| Flag                      | Bitmask | Meaning                                                    |
| ------------------------- | ------- | ---------------------------------------------------------- |
| `FLAG_NEW_WALLET`         | `0x01`  | Wallet created < 50,000 blocks ago (~83 days)              |
| `FLAG_LARGE_REQUEST`      | `0x02`  | Requesting > 3x the ecosystem average DOT                  |
| `FLAG_NO_TRACK_HISTORY`   | `0x04`  | Proposer has no previously approved proposals              |
| `FLAG_CONTENT_SIMILARITY` | `0x08`  | Proposal content similar to a previously rejected proposal |
| `FLAG_BURST_ACTIVITY`     | `0x10`  | Multiple proposals submitted in a short time window        |

---

## Getting Started

### Prerequisites

- [Rust](https://rustup.rs/) (stable + nightly)
- [Foundry](https://getfoundry.sh/) (forge, cast, anvil)
- [Node.js](https://nodejs.org/) >= 18
- [revive-cli](https://github.com/nicola-parity/revive) (Parity's Solidity → PolkaVM compiler)

### Installation

```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/fenrir.git
cd fenrir

# Install Foundry dependencies
cd contracts && forge install && cd ..

# Install revive toolchain for PVM compilation
cargo install revive-cli

# Install frontend dependencies
cd frontend && npm install && cd ..

# Install ML pipeline dependencies
cd ml && pip install -r requirements.txt && cd ..
```

### Build

```bash
# Build Solidity contracts
cd contracts && forge build

# Build Rust inference contract for PolkaVM
cd inference && cargo build --target riscv32emac-unknown-none-polkavm --release

# Build frontend
cd frontend && npm run build
```

### Test

```bash
# Run Solidity tests
cd contracts && forge test -vvv

# Run Rust inference tests
cd inference && cargo test

# Run ML pipeline tests
cd ml && python -m pytest
```

---

## Contracts

### FenrirScorer.sol (EVM)

The main orchestrator contract deployed on Polkadot Hub's EVM layer.

| Function                  | Visibility  | Description                                                    |
| ------------------------- | ----------- | -------------------------------------------------------------- |
| `scoreReferendum(uint32)` | `external`  | Score an active referendum — calls precompiles + PVM inference |
| `getScore(uint32)`        | `view`      | Returns score, verdict string, and active flag descriptions    |
| `updateBaseline(uint256)` | `onlyOwner` | Update the ecosystem average DOT request baseline              |
| `scores(uint32)`          | `view`      | Raw score struct: score, flags, scoredAtBlock, exists          |

### FenrirInference (PVM/Rust)

Rust contract compiled to RISC-V, deployed as a PolkaVM contract.

| Function              | Description                                              |
| --------------------- | -------------------------------------------------------- |
| `score_proposal(...)` | Takes 7 feature inputs, returns `(score: u8, flags: u8)` |

### Precompile Integrations

| Precompile | Address  | Usage                                          |
| ---------- | -------- | ---------------------------------------------- |
| Governance | `0x0807` | `getReferendumInfo()`, `getProposerHistory()`  |
| Asset Hub  | `0x0808` | `getNativeAssetRequest()` — DOT threshold flag |
| XCM        | `0x0803` | Score broadcast to parachains (stretch goal)   |

---

## ML Pipeline

### Training Data

Historical OpenGov proposals scraped from:

- [Polkassembly API](https://polkadot.polkassembly.io/) — proposal metadata, outcomes
- [Subsquare API](https://polkadot.subsquare.io/) — proposer history, voting data
- On-chain data — block timestamps, wallet first activity

### Feature Vector

| Feature                | Type    | Description                                               |
| ---------------------- | ------- | --------------------------------------------------------- |
| `wallet_age_blocks`    | `int`   | Blocks since proposer's first on-chain activity           |
| `dot_requested`        | `float` | DOT amount requested (18-decimal normalized)              |
| `dot_ratio_to_avg`     | `float` | Requested / ecosystem average at submission time          |
| `prior_approved`       | `int`   | Number of previously approved proposals                   |
| `prior_total`          | `int`   | Total proposals ever submitted                            |
| `approval_rate`        | `float` | `prior_approved / prior_total`                            |
| `track_id`             | `int`   | OpenGov track (0=root, 1=whitelisted, 13=treasurer, etc.) |
| `days_since_last_prop` | `int`   | Burst detection — rapid sequential submissions            |

### Model

- **Algorithm:** Decision Tree Classifier (`max_depth=5`)
- **Target:** 70%+ precision on high-risk class
- **Export:** Weights hardcoded as Rust constants in `inference/src/weights.rs`

### Pipeline Commands

```bash
# Scrape proposal data
python ml/scraper.py --output ml/data/proposals.csv

# Train model
python ml/train.py --data ml/data/proposals.csv --output ml/data/model.pkl

# Export weights to Rust
python ml/export_weights.py --model ml/data/model.pkl --output inference/src/weights.rs
```

---

## Frontend

React + Vite dashboard for interacting with Fenrir scores.

### Pages

| Page                | Description                                                                                |
| ------------------- | ------------------------------------------------------------------------------------------ |
| **Live Proposals**  | Feed of active proposals with Fenrir risk scores and flags                                 |
| **Proposal Detail** | Deep-dive into a scored proposal — flag breakdown, proposer history, on-chain verification |
| **Stats**           | Aggregate metrics — total scored, risk distribution, DOT flagged                           |

### Running Locally

```bash
cd frontend
npm install
npm run dev
```

### Environment Variables

```env
VITE_RPC_URL=https://westend-rpc.polkadot.io
VITE_SCORER_ADDRESS=0x...
VITE_CHAIN_ID=420420421
```

---

## Deployment

### Testnet (Westend)

```bash
# Deploy PVM inference contract
cd inference
cargo build --target riscv32emac-unknown-none-polkavm --release
cast send --rpc-url $WESTEND_RPC \
  --private-key $PRIVATE_KEY \
  --create $(cat target/riscv32emac-unknown-none-polkavm/release/fenrir_inference.polkavm | xxd -p)

# Deploy Solidity scorer contract
cd contracts
forge script script/Deploy.s.sol --rpc-url $WESTEND_RPC --private-key $PRIVATE_KEY --broadcast
```

### Contract Addresses (Testnet)

| Contract        | Network | Address |
| --------------- | ------- | ------- |
| FenrirScorer    | Westend | `TBD`   |
| FenrirInference | Westend | `TBD`   |

---

## Why Polkadot

Fenrir **cannot exist on Ethereum**. Here's why:

| Component                   | Why Not Ethereum                                                                     |
| --------------------------- | ------------------------------------------------------------------------------------ |
| **Governance Precompile**   | Ethereum has no on-chain governance. No precompile exists.                           |
| **PVM Rust Inference**      | EVM is a 256-bit stack machine. Rust ML inference is prohibitively expensive in gas. |
| **Asset Hub DOT Threshold** | Ethereum has no native treasury or governance asset management.                      |
| **XCM Score Broadcast**     | Ethereum has no native cross-chain messaging at the protocol layer.                  |
| **Unified Address Space**   | EVM + PVM contracts coexisting and calling each other — impossible on Ethereum.      |

---

## Polkadot Integration Categories

| Integration                  | How Fenrir Uses It                                                 |
| ---------------------------- | ------------------------------------------------------------------ |
| ✅ **PVM Rust Interop**      | ML inference runs in Rust compiled to RISC-V, called from Solidity |
| ✅ **Governance Precompile** | Live proposal data fetched on-chain — no subgraph, no API          |
| ✅ **Asset Hub Precompile**  | Flags proposals requesting native assets above anomaly threshold   |
| ✅ **XCM Precompile**        | Score broadcast to parachain subscribers (stretch goal)            |

---

## Roadmap

### Phase 1 — Hackathon (Current)

- Core scoring contracts (EVM + PVM)
- ML model trained on 200+ proposals
- Frontend dashboard
- Testnet deployment

### Phase 2 — Accuracy Improvement

- Train on 1,000+ proposals with advanced feature engineering
- Content similarity via IPFS text hashing
- Community labeling DAO for training data quality

### Phase 3 — Ecosystem Integration

- Nova Wallet / SubWallet plugin — Fenrir score inline during voting
- Polkassembly & Subsquare integration
- Automatic scoring on every new proposal submission

### Phase 4 — DAO Governance

- Model weight updates governed by on-chain DOT vote
- Bounty system for catching high-risk proposals
- Fenrir as a **permanent public good**, funded by W3F treasury

---

## Project Structure

```
fenrir/
├── contracts/                         # Solidity smart contracts (Foundry)
│   ├── src/
│   │   ├── FenrirScorer.sol          # Main EVM scoring contract
│   │   └── interfaces/
│   │       ├── IGovernancePrecompile.sol
│   │       ├── IAssetHubPrecompile.sol
│   │       └── IFenrirInference.sol
│   ├── test/
│   │   └── FenrirScorer.t.sol        # Foundry test suite
│   └── script/
│       └── Deploy.s.sol              # Deployment script
│
├── inference/                         # PVM Rust inference contract
│   ├── src/
│   │   ├── lib.rs                    # ML classifier logic
│   │   └── weights.rs                # Exported model weights
│   ├── Cargo.toml
│   └── .cargo/config.toml            # RISC-V target configuration
│
├── ml/                                # Off-chain ML training pipeline
│   ├── scraper.py                    # Polkassembly data collector
│   ├── train.py                      # Model training script
│   ├── export_weights.py             # Python → Rust weight exporter
│   ├── requirements.txt              # Python dependencies
│   └── data/
│       └── proposals.csv             # Training dataset
│
├── frontend/                          # React + Vite dashboard
│   ├── src/
│   │   ├── components/
│   │   │   ├── ProposalCard.jsx
│   │   │   ├── ScoreDisplay.jsx
│   │   │   ├── FlagBreakdown.jsx
│   │   │   └── StatsPanel.jsx
│   │   ├── hooks/
│   │   │   └── useFenrir.js
│   │   └── App.jsx
│   └── package.json
│
├── BASE_INSTRUCTIONS.md               # Complete technical blueprint
├── ARCHITECTURE.md                    # Architecture documentation
└── README.md                          # This file
```

---

## License

MIT

---

## Acknowledgments

- [Polkadot](https://polkadot.network/) — Governance precompiles, PVM, XCM
- [Parity Technologies](https://www.parity.io/) — Revive toolchain, PolkaVM
- [Web3 Foundation](https://web3.foundation/) — Ecosystem support
- [Polkassembly](https://polkassembly.io/) — Governance data API
- [Subsquare](https://subsquare.io/) — Proposal analytics

---

<p align="center">
  <strong>🐺 Fenrir: The wolf that hunts corruption in governance</strong><br>
  <em>Built for the Polkadot Solidity Hackathon 2026 — Track 2: PVM Smart Contracts</em>
</p>
