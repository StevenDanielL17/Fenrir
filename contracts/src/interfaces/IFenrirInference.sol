// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title Fenrir PVM Inference Contract Interface
/// @dev Cross-VM call: Solidity (EVM) → Rust (PolkaVM).
///      The Rust contract is compiled to RISC-V and deployed separately.
interface IFenrirInference {

    /// @param walletAgeBlocks    Blocks since proposer's first on-chain activity
    /// @param requestedDotRaw    DOT requested in Planck (1e18)
    /// @param priorApproved      Number of previously approved proposals
    /// @param priorTotal         Total proposals submitted by this address
    /// @param daysSinceLastProp  Days since last submission (for burst detection)
    /// @param trackId            OpenGov track ID (0=root, 13=treasurer, etc.)
    /// @return score             Risk score 0–100
    /// @return flagBitmask       Which risk features triggered (see FLAG_* constants)
    function scoreProposal(
        uint64 walletAgeBlocks,
        uint64 requestedDotRaw,
        uint32 priorApproved,
        uint32 priorTotal,
        uint32 daysSinceLastProp,
        uint8  trackId
    ) external view returns (uint8 score, uint8 flagBitmask);
}
