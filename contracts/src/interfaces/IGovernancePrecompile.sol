// SPDX-License-Identifier: MIT
// Governance Precompile Interface (0x0807)
// =========================================
// This interface defines the functions available via the Polkadot Hub
// governance precompile. It provides on-chain access to referendum
// metadata and proposer history — no oracle or off-chain service required.
//
// See BASE_INSTRUCTIONS.md Section 4.1 for the full specification.
pragma solidity ^0.8.20;

/// @title IGovernancePrecompile
/// @notice Interface for the Polkadot Hub governance precompile at address 0x0807.
/// @dev This precompile is native to the Polkadot Hub runtime and provides
///      direct access to OpenGov referendum data. It is not available on
///      Ethereum or any other EVM chain — this is a Polkadot-only primitive.
interface IGovernancePrecompile {
    /// @notice Retrieve information about a specific referendum.
    /// @param refIndex The index of the referendum to query.
    /// @return status The referendum status: 0 = ongoing, 1 = approved, 2 = rejected.
    /// @return proposer The address of the account that submitted the proposal.
    /// @return requestedDOT The amount of DOT requested by the proposal (in Planck).
    /// @return submittedAt The block number at which the proposal was submitted.
    /// @return contentHash The IPFS content hash of the proposal text.
    function getReferendumInfo(uint32 refIndex)
        external
        view
        returns (
            uint8 status,
            address proposer,
            uint256 requestedDOT,
            uint256 submittedAt,
            bytes32 contentHash
        );

    /// @notice Retrieve the governance activity history of a proposer.
    /// @param proposer The address of the proposer to query.
    /// @return totalProposals The total number of proposals submitted by this address.
    /// @return approvedCount The number of proposals that were approved.
    /// @return firstActivityBlock The block number of the proposer's first on-chain activity.
    function getProposerHistory(address proposer)
        external
        view
        returns (
            uint32 totalProposals,
            uint32 approvedCount,
            uint256 firstActivityBlock
        );
}
