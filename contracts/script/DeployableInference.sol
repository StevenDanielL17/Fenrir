// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {IFenrirInference} from "../src/interfaces/IFenrirInference.sol";

/// @title DeployableInference
/// @notice Stand-in inference contract for testnet deployment.
/// @dev Returns a deterministic score based on input features.
///      Will be replaced by the real PVM Rust contract once deployed.
contract DeployableInference is IFenrirInference {
    function scoreProposal(
        uint64 walletAgeBlocks,
        uint64 requestedDotRaw,
        uint32 priorApproved,
        uint32 priorTotal,
        uint32 daysSinceLastProp,
        uint8  trackId
    ) external pure override returns (uint64 packed) {
        uint8 s = 0;
        uint8 flags = 0;

        if (walletAgeBlocks < 50_000)       { s += 25; flags |= 0x01; }
        if (requestedDotRaw > 30_000 * 1e10) { s += 20; flags |= 0x02; }  // 30000 DOT at 1e10 scale
        if (priorTotal == 0)                { s += 20; flags |= 0x04; }
        if (priorTotal > 0 && (priorApproved * 100 / priorTotal) < 20)
                                            { s += 15; flags |= 0x08; }
        if (daysSinceLastProp < 3)          { s += 10; flags |= 0x10; }
        if (trackId == 34)                  { s += 10; }

        if (s > 100) s = 100;
        return (uint64(s) << 32) | uint64(flags);
    }
}
