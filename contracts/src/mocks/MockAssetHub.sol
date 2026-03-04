// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import {IAssetHubPrecompile} from "../interfaces/IAssetHubPrecompile.sol";

/// @title Mock Asset Hub Precompile for testing
/// @dev Stands in for 0x0808 when precompile is not live on testnet.
contract MockAssetHub is IAssetHubPrecompile {
    mapping(uint32 => uint256) public amounts;
    mapping(uint32 => bool) public hasRequest;

    function setNativeAssetRequest(uint32 refIndex, uint256 dotAmount, bool _hasRequest) external {
        amounts[refIndex] = dotAmount;
        hasRequest[refIndex] = _hasRequest;
    }
    function getNativeAssetRequest(uint32 refIndex)
        external view returns (uint256 dotAmount, bool _hasAssetRequest)
    {
        return (amounts[refIndex], hasRequest[refIndex]);
    }
}
