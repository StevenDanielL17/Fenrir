// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title Polkadot Hub XCM Precompile Interface
/// @dev Address: 0x0000000000000000000000000000000000000803
/// @dev Reserved for future cross-chain score broadcasting.
///      Not used in the MVP scoring flow, but included for
///      architectural completeness and the W3F grant roadmap.
interface IXCMPrecompile {

    /// @notice Send an XCM message to another parachain.
    /// @param dest The destination parachain ID.
    /// @param message The XCM-encoded message bytes.
    function sendXCM(uint32 dest, bytes calldata message) external;
}
