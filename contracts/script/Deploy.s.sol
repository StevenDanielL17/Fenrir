// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;
import {Script, console} from "forge-std/Script.sol";
import {FenrirScorer} from "../src/FenrirScorer.sol";
import {DeployableInference} from "./DeployableInference.sol";

/// @title Deploy
/// @notice Deploys FenrirScorer + optional stand-in inference contract.
/// @dev If INFERENCE_CONTRACT env var is set, uses that address.
///      If not set, deploys DeployableInference as a stand-in.
contract Deploy is Script {
    function run() external {
        // Try to read INFERENCE_CONTRACT from env; use address(0) as sentinel
        address inferenceAddr = vm.envOr("INFERENCE_CONTRACT", address(0));

        vm.startBroadcast();

        // Deploy stand-in inference if no PVM contract address provided
        if (inferenceAddr == address(0)) {
            DeployableInference inference = new DeployableInference();
            inferenceAddr = address(inference);
            console.log("Deployed stand-in inference:", inferenceAddr);
        } else {
            console.log("Using existing inference:   ", inferenceAddr);
        }

        FenrirScorer scorer = new FenrirScorer(inferenceAddr);
        vm.stopBroadcast();

        console.log("FenrirScorer deployed:     ", address(scorer));
        console.log("Inference contract:        ", inferenceAddr);
    }
}
