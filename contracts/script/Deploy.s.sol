// SPDX-License-Identifier: MIT
// ======================================================================
// Deployment Script for FenrirScorer + FenrirInference
// ======================================================================
// Deploys the FenrirScorer contract to the Polkadot Hub EVM layer.
// The PVM Rust inference contract must be deployed separately via
// the revive toolchain before running this script.
//
// Usage:
//   forge script script/Deploy.s.sol \
//     --rpc-url $WESTEND_RPC \
//     --private-key $PRIVATE_KEY \
//     --broadcast
//
// Prerequisites:
//   1. Deploy the FenrirInference PVM contract first
//   2. Set INFERENCE_CONTRACT_ADDRESS in your environment
//   3. Ensure sufficient DOT for gas on the deployer account
//
// See BASE_INSTRUCTIONS.md Section 7 (Week 3) for deployment steps.
// ======================================================================
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/FenrirScorer.sol";

/// @title DeployFenrir
/// @notice Deployment script for the Fenrir scoring system.
contract DeployFenrir is Script {

    /// @notice Entry point for the deployment.
    function run() external {
        // Retrieve the inference contract address from the environment.
        // This must be set before running the script.
        address inferenceAddress = vm.envOr(
            "INFERENCE_CONTRACT_ADDRESS",
            address(0x0000000000000000000000000000000000001000)  // Default for testing
        );

        // Retrieve the deployer's private key.
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");

        console.log("=== Fenrir Deployment ===");
        console.log("Deployer:          ", vm.addr(deployerKey));
        console.log("Inference contract:", inferenceAddress);
        console.log("Chain ID:          ", block.chainid);

        // Begin the broadcast — all subsequent calls are sent as real transactions.
        vm.startBroadcast(deployerKey);

        // Deploy the FenrirScorer contract
        FenrirScorer scorer = new FenrirScorer(inferenceAddress);

        console.log("FenrirScorer deployed at:", address(scorer));
        console.log("Owner:                   ", scorer.owner());
        console.log("Baseline DOT:            ", scorer.baselineAvgDOT());

        vm.stopBroadcast();

        // Log deployment summary
        console.log("");
        console.log("=== Deployment Complete ===");
        console.log("Add to your .env file:");
        console.log("  VITE_SCORER_ADDRESS=", address(scorer));
    }
}
