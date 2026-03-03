// SPDX-License-Identifier: MIT
// PVM Inference Contract Interface
// ==================================
// This interface defines the cross-contract call boundary between
// the Solidity EVM layer and the Rust PolkaVM inference contract.
// It is the key integration point that makes Fenrir possible only
// on Polkadot — EVM and PVM contracts coexisting and calling one
// another in a unified address space.
//
// See BASE_INSTRUCTIONS.md Section 4.1 for the full specification.
pragma solidity ^0.8.20;

/// @title IFenrirInference
/// @notice Interface for the FenrirInference PVM Rust contract.
/// @dev This is a cross-contract call from Solidity (EVM) to Rust (PolkaVM).
///      The Rust contract is compiled to RISC-V and deployed separately.
///      It runs the ML classifier with hardcoded weights and returns
///      a risk score with an explainability bitmask.
interface IFenrirInference {
    /// @notice Score a treasury proposal using the on-chain ML classifier.
    /// @dev This function performs pure computation — no state changes.
    ///      It evaluates the feature vector against the trained model
    ///      weights and returns both a numerical score and a bitmask
    ///      indicating which risk flags were triggered.
    /// @param walletAgeBlocks Blocks since the proposer's first on-chain activity.
    /// @param requestedDOT The amount of DOT requested in this proposal (in Planck).
    /// @param historicalAvgDOT The current ecosystem average DOT request for baseline comparison.
    /// @param priorApproved Number of the proposer's previously approved proposals.
    /// @param priorTotal Total number of proposals the proposer has ever submitted.
    /// @param contentSimilarityHash A hash fingerprint for detecting content similarity to rejected proposals.
    /// @param trackId The OpenGov track identifier (0=root, 1=whitelisted, 34=big_spender, etc.).
    /// @return score Risk score from 0 (minimal risk) to 100 (high risk).
    /// @return flagBitmask Bitmask of triggered flags — see FLAG_* constants in FenrirScorer.
    function scoreProposal(
        uint256 walletAgeBlocks,
        uint256 requestedDOT,
        uint256 historicalAvgDOT,
        uint32 priorApproved,
        uint32 priorTotal,
        uint256 contentSimilarityHash,
        uint8 trackId
    ) external view returns (uint8 score, uint8 flagBitmask);
}
