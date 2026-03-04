// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {IGovernancePrecompile} from "./interfaces/IGovernancePrecompile.sol";
import {IFenrirInference} from "./interfaces/IFenrirInference.sol";

/// @title FenrirScorer
/// @notice On-chain OpenGov proposal risk scorer powered by PVM ML inference.
/// @dev Reads proposals via governance precompile, calls Rust inference via PVM.
///      Part of Polkadot Solidity Hackathon 2026 — Track 2: PVM Smart Contracts.
contract FenrirScorer is ReentrancyGuard, Ownable2Step {

    // =========================================================================
    // CONSTANTS
    // =========================================================================

    IGovernancePrecompile public constant GOVERNANCE =
        IGovernancePrecompile(0x0000000000000000000000000000000000000807);

    // Risk flag bit positions — must match inference/src/lib.rs exactly
    uint8 public constant FLAG_NEW_WALLET       = 0x01;
    uint8 public constant FLAG_LARGE_REQUEST    = 0x02;
    uint8 public constant FLAG_NO_HISTORY       = 0x04;
    uint8 public constant FLAG_LOW_APPROVAL     = 0x08;
    uint8 public constant FLAG_BURST            = 0x10;
    uint8 public constant FLAG_INFERENCE_FAILED = 0x20;

    // Risk verdict thresholds
    uint8 public constant THRESHOLD_HIGH        = 75;
    uint8 public constant THRESHOLD_MODERATE    = 50;
    uint8 public constant THRESHOLD_LOW         = 25;

    // =========================================================================
    // STATE
    // =========================================================================

    IFenrirInference public inferenceContract;

    struct Score {
        uint8   value;           // 0–100
        uint8   flags;           // bitmask
        uint64  scoredAtBlock;
        uint128 requestedDOT;   // snapshot at time of scoring
        bool    exists;
    }

    mapping(uint32 => Score) public scores;
    uint32[] public scoredReferenda;
    uint256 public totalScored;
    uint256 public totalHighRiskFound;

    // =========================================================================
    // EVENTS
    // =========================================================================

    event ScorePublished(
        uint32  indexed refIndex,
        address indexed proposer,
        uint8           score,
        uint8           flags,
        uint128         requestedDOT,
        uint64          scoredAtBlock
    );

    event InferenceContractUpdated(address oldContract, address newContract);
    event InferenceFailure(uint32 indexed refIndex);

    // =========================================================================
    // ERRORS
    // =========================================================================

    error AlreadyScored(uint32 refIndex);
    error NotActiveReferendum(uint32 refIndex, uint8 status);
    error InferenceCallFailed();
    error InvalidInferenceContract();

    // =========================================================================
    // CONSTRUCTOR
    // =========================================================================

    constructor(address _inferenceContract) Ownable(msg.sender) {
        if (_inferenceContract == address(0)) revert InvalidInferenceContract();
        inferenceContract = IFenrirInference(_inferenceContract);
    }

    // =========================================================================
    // CORE SCORING
    // =========================================================================

    /// @notice Score an active referendum.
    /// @param refIndex The referendum index in OpenGov.
    /// @return score Risk score 0–100 (higher = riskier).
    function scoreReferendum(uint32 refIndex)
        external
        nonReentrant
        returns (uint8 score)
    {
        if (scores[refIndex].exists) revert AlreadyScored(refIndex);

        // Fetch proposal data from governance precompile
        IGovernancePrecompile.ReferendumInfo memory info =
            GOVERNANCE.getReferendumInfo(refIndex);

        if (info.status != 0) revert NotActiveReferendum(refIndex, info.status);

        // Fetch proposer history
        IGovernancePrecompile.ProposerHistory memory history =
            GOVERNANCE.getProposerHistory(info.proposer);

        // Compute wallet age in blocks
        uint64 walletAgeBlocks = info.submittedBlock > history.firstActivityBlock
            ? uint64(info.submittedBlock - history.firstActivityBlock)
            : 0;

        // Compute days since last proposal (~14400 blocks per day at 6s/block)
        uint32 daysSinceLast = history.lastProposalBlock > 0
            && info.submittedBlock > history.lastProposalBlock
            ? uint32((info.submittedBlock - history.lastProposalBlock) / 14400)
            : 999;

        // Call PVM Rust inference — wrapped in try/catch per Security.md §1.6
        uint8 riskScore;
        uint8 flagBitmask;
        try inferenceContract.scoreProposal(
            walletAgeBlocks,
            uint64(info.requestedDOT),
            history.approvedCount,
            history.totalProposals,
            daysSinceLast,
            info.trackId
        ) returns (uint8 _score, uint8 _flags) {
            riskScore = _score;
            flagBitmask = _flags;
        } catch {
            // Inference failed — store neutral score with failure flag.
            // This prevents a broken inference contract from blocking all scoring.
            riskScore = 50;
            flagBitmask = FLAG_INFERENCE_FAILED;
            emit InferenceFailure(refIndex);
        }

        // Persist the result
        scores[refIndex] = Score({
            value:        riskScore,
            flags:        flagBitmask,
            scoredAtBlock: uint64(block.number),
            requestedDOT: uint128(info.requestedDOT),
            exists:       true
        });

        scoredReferenda.push(refIndex);
        totalScored++;
        if (riskScore >= THRESHOLD_HIGH) totalHighRiskFound++;

        emit ScorePublished(
            refIndex,
            info.proposer,
            riskScore,
            flagBitmask,
            uint128(info.requestedDOT),
            uint64(block.number)
        );

        return riskScore;
    }

    // =========================================================================
    // VIEW FUNCTIONS
    // =========================================================================

    /// @notice Get full score details with human-readable verdict and decoded flags.
    function getScoreDetails(uint32 refIndex)
        external view
        returns (
            uint8   score,
            string memory verdict,
            bool    flagNewWallet,
            bool    flagLargeRequest,
            bool    flagNoHistory,
            bool    flagLowApproval,
            bool    flagBurst,
            uint64  scoredAtBlock
        )
    {
        Score memory s = scores[refIndex];
        require(s.exists, "Not scored yet");

        return (
            s.value,
            _verdictString(s.value),
            s.flags & FLAG_NEW_WALLET    != 0,
            s.flags & FLAG_LARGE_REQUEST != 0,
            s.flags & FLAG_NO_HISTORY    != 0,
            s.flags & FLAG_LOW_APPROVAL  != 0,
            s.flags & FLAG_BURST         != 0,
            s.scoredAtBlock
        );
    }

    /// @notice Get paginated list of recently scored referenda (newest first).
    function getRecentScores(uint256 offset, uint256 limit)
        external view
        returns (uint32[] memory indices, uint8[] memory scoreValues)
    {
        uint256 total = scoredReferenda.length;
        if (offset >= total) return (new uint32[](0), new uint8[](0));

        uint256 end = offset + limit > total ? total : offset + limit;
        uint256 count = end - offset;

        indices     = new uint32[](count);
        scoreValues = new uint8[](count);

        for (uint256 i = 0; i < count; i++) {
            uint32 idx = scoredReferenda[total - 1 - offset - i]; // newest first
            indices[i]     = idx;
            scoreValues[i] = scores[idx].value;
        }
    }

    /// @notice Returns global scoring statistics.
    function getStats()
        external view
        returns (
            uint256 total,
            uint256 highRisk,
            uint256 moderate,
            uint256 low
        )
    {
        total    = totalScored;
        highRisk = totalHighRiskFound;
        // Moderate and low computed from events off-chain for gas efficiency
        moderate = 0;
        low      = 0;
    }

    // =========================================================================
    // ADMIN
    // =========================================================================

    /// @notice Update the PVM inference contract address.
    /// @dev Only the contract owner may call this. Two-step ownership via Ownable2Step.
    function updateInferenceContract(address newContract) external onlyOwner {
        if (newContract == address(0)) revert InvalidInferenceContract();
        emit InferenceContractUpdated(address(inferenceContract), newContract);
        inferenceContract = IFenrirInference(newContract);
    }

    // =========================================================================
    // INTERNAL
    // =========================================================================

    function _verdictString(uint8 score) internal pure returns (string memory) {
        if (score >= THRESHOLD_HIGH)     return "HIGH RISK";
        if (score >= THRESHOLD_MODERATE) return "MODERATE RISK";
        if (score >= THRESHOLD_LOW)      return "LOW RISK";
        return "MINIMAL RISK";
    }
}
