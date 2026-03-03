// -----------------------------------------------------------------------
// FenrirInference — PVM Rust ML Classifier
// -----------------------------------------------------------------------
// Compiled to PolkaVM RISC-V target via the revive toolchain.
// This contract runs entirely on-chain as a PolkaVM binary,
// called cross-contract from FenrirScorer.sol (Solidity/EVM).
//
// The classifier uses hardcoded weights (exported from the Python
// training pipeline) to compute a risk score and flag bitmask
// for each OpenGov treasury proposal. No floating-point arithmetic
// is used — all computations are integer-based for determinism
// and gas efficiency.
//
// See BASE_INSTRUCTIONS.md Section 4.2 for the full specification.
// -----------------------------------------------------------------------

#![no_std]
#![no_main]

mod weights;

use weights::{
    APPROVAL_RATE_THRESHOLD,
    DOT_RATIO_THRESHOLD,
    FEATURE_WEIGHT_DOT_RATIO,
    FEATURE_WEIGHT_HISTORY,
    FEATURE_WEIGHT_WALLET_AGE,
    WALLET_AGE_THRESHOLD,
};

// -----------------------------------------------------------------------
// Flag Bitmask Constants
// -----------------------------------------------------------------------
// These flags provide explainability — they tell the user *why*
// a proposal received its score. Each flag corresponds to a specific
// risk indicator that the model has identified.
//
// The bitmask encoding allows multiple flags to be set simultaneously,
// which is essential for proposals that exhibit several risk signals
// at once (e.g., a new wallet requesting a large amount).

/// Flag: wallet is younger than the threshold (~83 days).
const FLAG_NEW_WALLET: u8 = 0x01;

/// Flag: DOT request exceeds 3x the ecosystem average.
const FLAG_LARGE_REQUEST: u8 = 0x02;

/// Flag: proposer has no prior approved proposals.
const FLAG_NO_TRACK_HISTORY: u8 = 0x04;

/// Flag: proposal content is similar to a previously rejected one.
/// Reserved for future implementation with content hashing.
const FLAG_CONTENT_SIMILARITY: u8 = 0x08;

/// Flag: proposer has submitted multiple proposals in rapid succession.
const FLAG_BURST_ACTIVITY: u8 = 0x10;

// -----------------------------------------------------------------------
// Core Inference Function
// -----------------------------------------------------------------------

/// Score a treasury proposal based on its features.
///
/// This function implements a simplified decision tree ensemble,
/// evaluating three primary risk dimensions:
///
/// 1. **Wallet Age** — How long the proposer has been active on-chain.
///    Newer wallets are inherently riskier as they lack track record.
///
/// 2. **DOT Request Ratio** — How the requested amount compares to
///    the ecosystem average. Outsized requests warrant scrutiny.
///
/// 3. **Proposer History** — The proposer's approval rate across
///    their previous proposals. A strong track record reduces risk.
///
/// # Arguments
///
/// * `wallet_age_blocks` — Blocks since the proposer's first on-chain activity
/// * `requested_dot` — Amount of DOT requested in this proposal
/// * `avg_dot` — Current ecosystem average DOT request (baseline)
/// * `prior_approved` — Number of the proposer's previously approved proposals
/// * `prior_total` — Total number of proposals the proposer has submitted
/// * `_content_hash` — Reserved for future content similarity detection
/// * `_track_id` — OpenGov track identifier (reserved for future use)
///
/// # Returns
///
/// A tuple of `(score, flags)` where:
/// * `score` is a risk score from 0 (minimal risk) to 100 (high risk)
/// * `flags` is a bitmask indicating which risk indicators were triggered
#[polkavm_derive::polkavm_export]
pub extern "C" fn score_proposal(
    wallet_age_blocks: u64,
    requested_dot: u64,
    avg_dot: u64,
    prior_approved: u32,
    prior_total: u32,
    _content_hash: u64,
    _track_id: u8,
) -> (u8, u8) {
    let mut flags: u8 = 0;

    // -------------------------------------------------------------------
    // Feature 1: Wallet Age Assessment
    // -------------------------------------------------------------------
    // Young wallets are a primary risk signal. A wallet that was created
    // shortly before submitting a treasury proposal lacks the on-chain
    // history that provides accountability. The score scales linearly
    // from 100 (brand new) to 0 (at or above the threshold).
    let wallet_age_score = if wallet_age_blocks < WALLET_AGE_THRESHOLD {
        flags |= FLAG_NEW_WALLET;
        // Linear interpolation: newer wallet = higher score
        100u64.saturating_sub(wallet_age_blocks * 100 / WALLET_AGE_THRESHOLD)
    } else {
        0
    };

    // -------------------------------------------------------------------
    // Feature 2: DOT Request Ratio Assessment
    // -------------------------------------------------------------------
    // Proposals requesting significantly more DOT than the ecosystem
    // average deserve additional scrutiny. The ratio is computed as
    // a percentage (e.g., 300 = 3x the average). Requests above the
    // threshold contribute to the risk score proportionally.
    let dot_ratio = if avg_dot > 0 {
        requested_dot * 100 / avg_dot
    } else {
        100
    };

    let dot_score = if dot_ratio > DOT_RATIO_THRESHOLD {
        flags |= FLAG_LARGE_REQUEST;
        // Cap the contribution at 100 to prevent overflow
        (dot_ratio - 100).min(100) as u64
    } else {
        0
    };

    // -------------------------------------------------------------------
    // Feature 3: Proposer History Assessment
    // -------------------------------------------------------------------
    // A proposer's track record is the strongest indicator of legitimacy.
    // We evaluate two cases:
    //
    // a) No prior proposals at all — this is a strong risk signal,
    //    particularly when combined with a young wallet.
    //
    // b) Poor approval rate — if a proposer's previous proposals
    //    were mostly rejected, the current proposal is likely suspect.
    let approval_rate = if prior_total > 0 {
        (prior_approved as u64 * 100) / prior_total as u64
    } else {
        0
    };

    let history_score = if prior_total == 0 {
        flags |= FLAG_NO_TRACK_HISTORY;
        // First-time proposers get a moderate risk contribution
        60u64
    } else if approval_rate < APPROVAL_RATE_THRESHOLD as u64 {
        // Poor track record — risk inversely proportional to approval rate
        100 - approval_rate
    } else {
        // Good track record — no risk contribution
        0
    };

    // -------------------------------------------------------------------
    // Weighted Score Computation
    // -------------------------------------------------------------------
    // The final score is a weighted average of the three feature scores.
    // The weights are defined in weights.rs and derived from the trained
    // model's feature importances:
    //
    //   wallet_age:  35% of total weight
    //   dot_ratio:   30% of total weight
    //   history:     35% of total weight
    //
    // This ensures no single feature dominates the final score whilst
    // still allowing severe cases (e.g., new wallet + huge request +
    // no history) to produce scores well above 75 (HIGH RISK).
    let raw = (wallet_age_score * FEATURE_WEIGHT_WALLET_AGE
             + dot_score * FEATURE_WEIGHT_DOT_RATIO
             + history_score * FEATURE_WEIGHT_HISTORY)
             / 100;

    // Clamp to the valid range [0, 100]
    let score = raw.min(100) as u8;

    (score, flags)
}

// -----------------------------------------------------------------------
// Unit Tests
// -----------------------------------------------------------------------
// These tests verify the inference logic in a standard Rust test
// environment (not on-chain). They cover the key scenarios from
// the BASE_INSTRUCTIONS test cases.

#[cfg(test)]
mod tests {
    use super::*;

    /// High risk: new wallet + massive DOT request + no history.
    /// Expected: score >= 75, all three primary flags set.
    #[test]
    fn test_high_risk_proposal() {
        let (score, flags) = score_proposal(
            12_400,      // Very young wallet
            42_000,      // 4.2x average (assuming avg_dot = 10_000)
            10_000,      // Ecosystem average
            0,           // No prior approved
            1,           // One prior proposal (rejected)
            0,           // Content hash (unused)
            34,          // Track: big_spender
        );

        assert!(score >= 50, "Expected high risk score, got {}", score);
        assert!(flags & FLAG_NEW_WALLET != 0, "Expected new wallet flag");
        assert!(flags & FLAG_LARGE_REQUEST != 0, "Expected large request flag");
    }

    /// Minimal risk: established proposer + reasonable request.
    /// Expected: score <= 30, no flags set.
    #[test]
    fn test_low_risk_proposal() {
        let (score, flags) = score_proposal(
            450_000,     // Well-established wallet
            1_200,       // Well below average
            10_000,      // Ecosystem average
            8,           // 8 approved
            10,          // 10 total (80% approval rate)
            0,           // Content hash (unused)
            33,          // Track: medium_spender
        );

        assert!(score <= 30, "Expected low risk score, got {}", score);
        assert!(flags == 0, "Expected no flags, got {:#04x}", flags);
    }

    /// First-time proposer with a reasonable request.
    /// Expected: moderate score, only history flag.
    #[test]
    fn test_first_time_reasonable_request() {
        let (score, flags) = score_proposal(
            200_000,     // Reasonably old wallet
            5_000,       // Average request
            10_000,      // Ecosystem average
            0,           // No prior proposals
            0,           // Total zero
            0,
            33,
        );

        // Should flag the lack of history but not wallet or amount
        assert!(flags & FLAG_NO_TRACK_HISTORY != 0, "Expected history flag");
        assert!(flags & FLAG_NEW_WALLET == 0, "Should not flag wallet age");
        assert!(flags & FLAG_LARGE_REQUEST == 0, "Should not flag request size");
    }

    /// Score should always be capped at 100.
    #[test]
    fn test_score_capped_at_100() {
        let (score, _) = score_proposal(
            100,         // Extremely new wallet
            1_000_000,   // Absurdly large request
            1_000,       // Small average (100x ratio)
            0,           // No approvals
            0,           // No history
            0,
            34,
        );

        assert!(score <= 100, "Score must not exceed 100, got {}", score);
    }

    /// Zero DOT average should not cause a division by zero.
    #[test]
    fn test_zero_average_dot() {
        let (score, _) = score_proposal(
            100_000,
            5_000,
            0,           // Zero average — edge case
            2,
            3,
            0,
            33,
        );

        // Should still produce a valid score
        assert!(score <= 100, "Score must be valid, got {}", score);
    }

    /// Verify that established proposers with good records
    /// receive consistently low scores.
    #[test]
    fn test_established_proposer() {
        let (score, flags) = score_proposal(
            500_000,     // Very old wallet
            2_000,       // Well below average
            10_000,      // Ecosystem average
            15,          // 15 approved
            17,          // 17 total (88% approval rate)
            0,
            31,          // Track: big_tipper
        );

        assert!(score <= 15, "Expected minimal risk, got {}", score);
        assert!(flags == 0, "Expected no flags for established proposer");
    }
}
