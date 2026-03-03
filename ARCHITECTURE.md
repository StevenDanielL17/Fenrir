# Fenrir Architecture

> See [BASE_INSTRUCTIONS.md](./BASE_INSTRUCTIONS.md) for the complete technical blueprint.

This document provides a condensed architecture reference for developers working on Fenrir.

## System Overview

Fenrir is a three-layer on-chain risk scoring system:

1. **FenrirScorer.sol** (Solidity/EVM) — Orchestration, precompile reads, score storage
2. **FenrirInference** (Rust/PolkaVM) — ML classifier with hardcoded weights
3. **ML Pipeline** (Python/Off-chain) — Training, weight export

## Data Flow

```
Governance Precompile (0x0807)
        │
        ▼
FenrirScorer.sol ──── encodes features ────▶ FenrirInference (PVM)
        │                                            │
        │◀──── returns (score, flags) ◀──────────────┘
        │
        ▼
Score stored on-chain + ScorePublished event emitted
```

## Precompile Addresses

| Precompile | Address  | Function                        |
| ---------- | -------- | ------------------------------- |
| Governance | `0x0807` | Proposal data, proposer history |
| Asset Hub  | `0x0808` | Native DOT request amounts      |
| XCM        | `0x0803` | Cross-chain score broadcast     |

## Feature Vector

7 features passed from Solidity → PVM Rust:

1. `walletAgeBlocks` — blocks since first activity
2. `requestedDOT` — amount requested
3. `historicalAvgDOT` — ecosystem baseline
4. `priorApproved` — approved proposal count
5. `priorTotal` — total proposal count
6. `contentSimilarityHash` — content fingerprint
7. `trackId` — OpenGov track identifier

## Flag Bitmask

| Bit    | Flag               | Threshold                  |
| ------ | ------------------ | -------------------------- |
| `0x01` | New wallet         | < 50,000 blocks            |
| `0x02` | Large request      | > 3x ecosystem avg         |
| `0x04` | No track history   | 0 approved proposals       |
| `0x08` | Content similarity | Similar to rejected        |
| `0x10` | Burst activity     | Multiple rapid submissions |

## Score Ranges

| Range  | Verdict       |
| ------ | ------------- |
| 0–24   | MINIMAL RISK  |
| 25–49  | LOW RISK      |
| 50–74  | MODERATE RISK |
| 75–100 | HIGH RISK     |
