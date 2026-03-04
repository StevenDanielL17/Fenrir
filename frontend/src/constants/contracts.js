// ======================================================================
// Contract constants — ABI, addresses, risk levels, flag definitions.
// Single source of truth for all contract-related config.
// ======================================================================

export const CONTRACTS = {
  scorer: {
    address: import.meta.env.VITE_SCORER_ADDRESS,
    abi: [
      "function scoreReferendum(uint32 refIndex) returns (uint8)",
      "function getScoreDetails(uint32 refIndex) view returns (uint8 score, string verdict, bool flagNewWallet, bool flagLargeRequest, bool flagNoHistory, bool flagLowApproval, bool flagBurst, uint64 scoredAtBlock)",
      "function getRecentScores(uint256 offset, uint256 limit) view returns (uint32[] indices, uint8[] scoreValues)",
      "function getStats() view returns (uint256 total, uint256 highRisk, uint256 moderate, uint256 low)",
      "function scores(uint32) view returns (uint8 value, uint8 flags, uint64 scoredAtBlock, uint128 requestedDOT, bool exists)",
      "event ScorePublished(uint32 indexed refIndex, address indexed proposer, uint8 score, uint8 flags, uint128 requestedDOT, uint64 scoredAtBlock)",
    ],
  },
};

export const RPC_URL =
  import.meta.env.VITE_RPC_URL ||
  "https://westend-asset-hub-eth-rpc.polkadot.io";

export const RISK_LEVELS = {
  HIGH:     { min: 75, label: "HIGH RISK",     color: "#E05252" },
  MODERATE: { min: 50, label: "MODERATE RISK", color: "#D97706" },
  LOW:      { min: 25, label: "LOW RISK",      color: "#CA8A04" },
  MINIMAL:  { min: 0,  label: "MINIMAL RISK",  color: "#16A34A" },
};

export const FLAGS = {
  NEW_WALLET:    { bit: 0x01, label: "New wallet",          desc: "Proposer wallet is less than 50,000 blocks old (~83 days). High-risk proposers often create fresh wallets to avoid history checks." },
  LARGE_REQUEST: { bit: 0x02, label: "Oversized request",   desc: "Requesting more than 3x the ecosystem average DOT amount for this track." },
  NO_HISTORY:    { bit: 0x04, label: "No proposal history",  desc: "This address has never submitted a proposal to OpenGov before. No track record." },
  LOW_APPROVAL:  { bit: 0x08, label: "Poor approval record", desc: "Less than 20% of this proposer's past proposals were approved by voters." },
  BURST:         { bit: 0x10, label: "Rapid submissions",    desc: "Multiple proposals submitted within 3 days. May indicate spam or rushed submissions." },
};

/// Returns the risk level key for a given score.
export function getRiskLevel(score) {
  if (score >= 75) return "HIGH";
  if (score >= 50) return "MODERATE";
  if (score >= 25) return "LOW";
  return "MINIMAL";
}
