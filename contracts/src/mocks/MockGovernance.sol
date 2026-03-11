// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;
import {IGovernancePrecompile} from "../interfaces/IGovernancePrecompile.sol";

/// @title Mock Governance Precompile for testing
/// @dev Stands in for 0x0807 when precompile is not live on testnet.
contract MockGovernance is IGovernancePrecompile {
    mapping(uint32 => ReferendumInfo) public referenda;
    mapping(address => ProposerHistory) public histories;

    function setReferendum(uint32 index, ReferendumInfo calldata info) external {
        referenda[index] = info;
    }
    function setHistory(address proposer, ProposerHistory calldata h) external {
        histories[proposer] = h;
    }
    function getReferendumInfo(uint32 i) external view returns (ReferendumInfo memory) {
        return referenda[i];
    }
    function getProposerHistory(address p) external view returns (ProposerHistory memory) {
        return histories[p];
    }
    function getReferendumCount() external pure returns (uint32) { return 1000; }
}
