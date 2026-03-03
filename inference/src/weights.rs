// -----------------------------------------------------------------------
// Fenrir Model Weights — Default Blueprint Weights
// Generated from BASE_INSTRUCTIONS.md specification
// These weights represent the trained decision tree's feature
// importances, scaled to integer weights suitable for on-chain
// arithmetic. The inference contract uses these to compute a
// weighted risk score without floating-point operations.
// -----------------------------------------------------------------------

/// Weight for wallet age feature.
/// Negative correlation — younger wallets receive higher risk scores.
/// Derived from feature importance: 35% of total model weight.
pub const WEIGHT_WALLET_AGE: i32 = -45;

/// Weight for DOT request ratio feature.
/// Positive correlation — requests above the ecosystem average
/// contribute proportionally to risk.
pub const WEIGHT_DOT_RATIO: i32 = 38;

/// Weight for approval rate feature.
/// Negative correlation — proposers with good track records
/// receive lower risk scores.
pub const WEIGHT_APPROVAL_RATE: i32 = -29;

/// Weight for the no-history penalty.
/// Applied when a proposer has zero prior approved proposals.
pub const WEIGHT_NO_HISTORY: i32 = 22;

/// Weight for burst activity detection.
/// Applied when multiple proposals are submitted in rapid succession.
pub const WEIGHT_BURST: i32 = 15;

/// Baseline score before feature adjustments.
/// A score of 50 represents neutral risk — features push it
/// up towards 100 (high risk) or down towards 0 (minimal risk).
pub const BIAS: i32 = 50;

// -----------------------------------------------------------------------
// Thresholds — define when risk flags are triggered
// -----------------------------------------------------------------------

/// Wallet must be at least this many blocks old to avoid the
/// new-wallet flag. At ~6 seconds per block, 50000 blocks
/// equates to roughly 83 days.
pub const WALLET_AGE_THRESHOLD: u64 = 50_000;

/// DOT ratio threshold as a percentage.
/// A value of 300 means the requested amount must exceed
/// 3x the ecosystem average to trigger the large-request flag.
pub const DOT_RATIO_THRESHOLD: u64 = 300;

/// Approval rate threshold as a percentage.
/// Proposers with an approval rate below 20% are flagged
/// as having a poor track record.
pub const APPROVAL_RATE_THRESHOLD: u32 = 20;

// -----------------------------------------------------------------------
// Feature weight percentages (for weighted score computation)
// -----------------------------------------------------------------------

/// Percentage of the final score attributed to wallet age.
pub const FEATURE_WEIGHT_WALLET_AGE: u64 = 35;

/// Percentage of the final score attributed to DOT ratio.
pub const FEATURE_WEIGHT_DOT_RATIO: u64 = 30;

/// Percentage of the final score attributed to proposer history.
pub const FEATURE_WEIGHT_HISTORY: u64 = 35;
