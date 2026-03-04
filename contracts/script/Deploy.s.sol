// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import {Script, console} from "forge-std/Script.sol";
import {FenrirScorer} from "../src/FenrirScorer.sol";

contract Deploy is Script {
    function run() external {
        address inferenceContract = vm.envAddress("INFERENCE_CONTRACT");

        vm.startBroadcast();
        FenrirScorer scorer = new FenrirScorer(inferenceContract);
        vm.stopBroadcast();

        console.log("FenrirScorer deployed:", address(scorer));
        console.log("Inference contract:   ", inferenceContract);
    }
}
