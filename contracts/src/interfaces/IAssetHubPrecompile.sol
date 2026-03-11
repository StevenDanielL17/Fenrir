// SPDX-License-Identifier: MIT
// Asset Hub Precompile Interface (0x0808)
// ========================================
// This interface provides access to native asset request data
// from the Polkadot Asset Hub. It enables Fenrir to verify
// DOT amounts requested through the treasury mechanism.
//
// See BASE_INSTRUCTIONS.md Section 4.1 for the full specification.
pragma solidity ^0.8.19;

/// @title IAssetHubPrecompile
/// @notice Interface for the Polkadot Asset Hub precompile at address 0x0808.
/// @dev Provides on-chain access to native DOT treasury request amounts.
///      This precompile enables Fenrir to flag proposals that request
///      amounts exceeding anomaly thresholds without any off-chain lookup.
interface IAssetHubPrecompile {
    /// @notice Retrieve the native DOT request amount for a referendum.
    /// @param refIndex The index of the referendum to query.
    /// @return dotAmount The amount of native DOT requested (in Planck).
    /// @return hasAssetRequest Whether the referendum includes a native asset request.
    function getNativeAssetRequest(uint32 refIndex)
        external
        view
        returns (uint256 dotAmount, bool hasAssetRequest);
}
