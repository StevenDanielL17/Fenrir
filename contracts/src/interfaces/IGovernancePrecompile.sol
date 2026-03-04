// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title Polkadot Hub Governance Precompile Interface
/// @dev Address: 0x0000000000000000000000000000000000000807
/// @dev If precompile not live on testnet, use MockGovernance.sol instead.
interface IGovernancePrecompile {

    struct ReferendumInfo {
        uint8   status;           // 0=ongoing, 1=approved, 2=rejected, 3=cancelled
        address proposer;
        uint256 requestedDOT;     // in Planck (1e18)
        uint256 submittedBlock;
        uint8   trackId;
    }

    struct ProposerHistory {
        uint32  totalProposals;
        uint32  approvedCount;
        uint256 firstActivityBlock;
        uint256 lastProposalBlock;
    }

    function getReferendumInfo(uint32 refIndex)
        external view
        returns (ReferendumInfo memory);

    function getProposerHistory(address proposer)
        external view
        returns (ProposerHistory memory);

    function getReferendumCount()
        external view
        returns (uint32);
}
