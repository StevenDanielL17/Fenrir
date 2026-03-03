// SPDX-License-Identifier: MIT
// ======================================================================
// FenrirScorer.sol — Main EVM Scoring Contract
// ======================================================================
// The orchestrator contract for the Fenrir on-chain risk intelligence
// system. Deployed on Polkadot Hub's EVM layer, it coordinates between
// the governance precompile, Asset Hub precompile, and the PVM Rust
// inference contract to produce transparent, verifiable risk scores
// for OpenGov treasury proposals.
//
// This contract is the public-facing API of Fenrir. Any wallet, dApp,
// or smart contract in the Polkadot ecosystem can call getScore() to
// retrieve a proposal's risk assessment.
//
// See BASE_INSTRUCTIONS.md Section 4.1 for the full specification.
// ======================================================================
pragma solidity ^0.8.20;

import "./interfaces/IGovernancePrecompile.sol";
import "./interfaces/IAssetHubPrecompile.sol";
import "./interfaces/IFenrirInference.sol";

/// @title FenrirScorer
/// @author Fenrir Team — Polkadot Solidity Hackathon 2026
/// @notice On-chain risk scoring for OpenGov treasury proposals.
/// @dev Integrates governance precompile, Asset Hub precompile, and
///      PVM Rust inference to produce explainable risk scores (0-100).
contract FenrirScorer {

    // ==================================================================
    // Precompile Addresses (Polkadot Hub Native)
    // ==================================================================

    /// @notice Governance precompile — provides referendum and proposer data.
    IGovernancePrecompile constant GOVERNANCE =
        IGovernancePrecompile(0x0000000000000000000000000000000000000807);

    /// @notice Asset Hub precompile — provides native DOT request amounts.
    IAssetHubPrecompile constant ASSET_HUB =
        IAssetHubPrecompile(0x0000000000000000000000000000000000000808);

    /// @notice PVM Rust inference contract — runs the ML classifier.
    IFenrirInference public inferenceContract;

    // ==================================================================
    // Score Storage
    // ==================================================================

    /// @notice Structure holding a proposal's risk assessment.
    /// @param score The numerical risk score (0 = minimal, 100 = high).
    /// @param flags Bitmask of triggered risk flags (see FLAG_* constants).
    /// @param scoredAtBlock The block number at which scoring occurred.
    /// @param exists Whether this proposal has been scored.
    struct FenrirScore {
        uint8 score;
        uint8 flags;
        uint256 scoredAtBlock;
        bool exists;
    }

    /// @notice Mapping from referendum index to its Fenrir score.
    mapping(uint32 => FenrirScore) public scores;

    /// @notice Total number of proposals scored by this contract.
    uint256 public totalScored;

    // ==================================================================
    // Flag Constants (Explainability Layer)
    // ==================================================================
    // Each flag corresponds to a specific risk indicator. When a flag
    // is set in the bitmask, it means the corresponding risk condition
    // was detected during scoring. This is Fenrir's core value
    // proposition — not just a score, but an explanation of *why*.

    /// @notice Wallet is younger than ~83 days (50,000 blocks).
    uint8 constant FLAG_NEW_WALLET = 0x01;

    /// @notice Request exceeds 3x the ecosystem average DOT amount.
    uint8 constant FLAG_LARGE_REQUEST = 0x02;

    /// @notice Proposer has no previously approved proposals.
    uint8 constant FLAG_NO_TRACK_HISTORY = 0x04;

    /// @notice Proposal content is similar to a previously rejected one.
    uint8 constant FLAG_CONTENT_SIMILARITY = 0x08;

    /// @notice Multiple proposals submitted in a short time window.
    uint8 constant FLAG_BURST_ACTIVITY = 0x10;

    // ==================================================================
    // Ecosystem Baseline Configuration
    // ==================================================================

    /// @notice The ecosystem average DOT request amount (in Planck).
    /// @dev Updated via governance to reflect the current ecosystem norm.
    ///      Defaults to 5000 DOT (5000 * 10^18 Planck).
    uint256 public baselineAvgDOT = 5000 ether;

    /// @notice Contract owner — authorised to update baseline parameters.
    address public owner;

    /// @notice Whether the contract is paused for emergency situations.
    bool public paused;

    /// @notice Reentrancy guard state variable.
    bool private _locked;

    // ==================================================================
    // Events
    // ==================================================================

    /// @notice Emitted when a proposal is scored.
    /// @param refIndex The referendum index that was scored.
    /// @param proposer The address of the proposal's author.
    /// @param score The computed risk score (0-100).
    /// @param flags The triggered risk flag bitmask.
    /// @param requestedDOT The amount of DOT requested by the proposal.
    event ScorePublished(
        uint32 indexed refIndex,
        address indexed proposer,
        uint8 score,
        uint8 flags,
        uint256 requestedDOT
    );

    /// @notice Emitted when the ecosystem baseline is updated.
    /// @param oldBaseline The previous baseline average.
    /// @param newBaseline The newly set baseline average.
    event BaselineUpdated(uint256 oldBaseline, uint256 newBaseline);

    // ==================================================================
    // Modifiers
    // ==================================================================

    /// @notice Restricts access to the contract owner.
    modifier onlyOwner() {
        require(msg.sender == owner, "Fenrir: caller is not the owner");
        _;
    }

    /// @notice Prevents reentrancy attacks on state-changing functions.
    modifier nonReentrant() {
        require(!_locked, "Fenrir: reentrant call detected");
        _locked = true;
        _;
        _locked = false;
    }

    /// @notice Ensures the contract is not paused.
    modifier whenNotPaused() {
        require(!paused, "Fenrir: contract is paused");
        _;
    }

    // ==================================================================
    // Constructor
    // ==================================================================

    /// @notice Deploy the FenrirScorer contract.
    /// @param _inferenceContract Address of the deployed PVM inference contract.
    constructor(address _inferenceContract) {
        require(
            _inferenceContract != address(0),
            "Fenrir: inference contract cannot be zero address"
        );
        inferenceContract = IFenrirInference(_inferenceContract);
        owner = msg.sender;
    }

    // ==================================================================
    // Core Scoring Function
    // ==================================================================

    /// @notice Score an active OpenGov referendum.
    /// @dev This function performs the complete scoring pipeline:
    ///      1. Fetches proposal data from the governance precompile
    ///      2. Fetches proposer history from the governance precompile
    ///      3. Computes feature values from the raw data
    ///      4. Calls the PVM Rust inference contract for ML scoring
    ///      5. Stores the result on-chain
    ///      6. Emits the ScorePublished event
    /// @param refIndex The referendum index to score.
    /// @return score The computed risk score (0-100).
    function scoreReferendum(uint32 refIndex)
        external
        nonReentrant
        whenNotPaused
        returns (uint8 score)
    {
        // Ensure we haven't already scored this proposal.
        // Each proposal gets exactly one immutable score for transparency.
        require(!scores[refIndex].exists, "Fenrir: already scored");

        // ----- Step 1: Fetch proposal data from governance precompile -----
        (
            uint8 status,
            address proposer,
            uint256 requestedDOT,
            uint256 submittedAt,
            /* bytes32 contentHash */
        ) = GOVERNANCE.getReferendumInfo(refIndex);

        // Only score active (ongoing) proposals — we cannot retroactively
        // score proposals that have already concluded.
        require(status == 0, "Fenrir: only score active proposals");

        // ----- Step 2: Fetch proposer governance history -----
        (
            uint32 totalProposals,
            uint32 approvedCount,
            uint256 firstActivityBlock
        ) = GOVERNANCE.getProposerHistory(proposer);

        // ----- Step 3: Compute feature values -----
        // Wallet age: how many blocks have elapsed since the proposer's
        // first on-chain activity. This is a proxy for trustworthiness.
        uint256 walletAgeBlocks = submittedAt > firstActivityBlock
            ? submittedAt - firstActivityBlock
            : 0;

        // ----- Step 4: Cross-contract call to PVM inference -----
        // This is where the magic happens — Solidity calls a Rust
        // contract running on PolkaVM. The inference contract evaluates
        // the feature vector against trained ML weights and returns
        // a score and flag bitmask.
        (uint8 riskScore, uint8 flagBitmask) = inferenceContract.scoreProposal(
            walletAgeBlocks,
            requestedDOT,
            baselineAvgDOT,
            approvedCount,
            totalProposals,
            uint256(keccak256(abi.encodePacked(refIndex))),  // Simplified content hash
            uint8(refIndex % 16)  // Track ID approximation for demo
        );

        // ----- Step 5: Store the immutable on-chain result -----
        scores[refIndex] = FenrirScore({
            score: riskScore,
            flags: flagBitmask,
            scoredAtBlock: block.number,
            exists: true
        });

        totalScored++;

        // ----- Step 6: Broadcast the scoring event -----
        emit ScorePublished(
            refIndex,
            proposer,
            riskScore,
            flagBitmask,
            requestedDOT
        );

        return riskScore;
    }

    // ==================================================================
    // Public Read Functions
    // ==================================================================

    /// @notice Retrieve the full risk assessment for a scored proposal.
    /// @param refIndex The referendum index to look up.
    /// @return score The numerical risk score (0-100).
    /// @return verdict A human-readable risk verdict string.
    /// @return activeFlags An array of human-readable flag descriptions.
    function getScore(uint32 refIndex)
        external
        view
        returns (
            uint8 score,
            string memory verdict,
            string[] memory activeFlags
        )
    {
        FenrirScore memory s = scores[refIndex];
        require(s.exists, "Fenrir: not yet scored");

        score = s.score;
        verdict = _verdict(s.score);
        activeFlags = _decodeFlags(s.flags);
    }

    /// @notice Check whether a referendum has been scored.
    /// @param refIndex The referendum index to check.
    /// @return exists True if the proposal has been scored.
    function isScored(uint32 refIndex) external view returns (bool exists) {
        return scores[refIndex].exists;
    }

    /// @notice Retrieve the raw score data for a referendum.
    /// @param refIndex The referendum index to look up.
    /// @return score The numerical risk score.
    /// @return flags The raw flag bitmask.
    /// @return scoredAtBlock The block at which scoring occurred.
    function getRawScore(uint32 refIndex)
        external
        view
        returns (uint8 score, uint8 flags, uint256 scoredAtBlock)
    {
        FenrirScore memory s = scores[refIndex];
        require(s.exists, "Fenrir: not yet scored");

        return (s.score, s.flags, s.scoredAtBlock);
    }

    // ==================================================================
    // Administrative Functions
    // ==================================================================

    /// @notice Update the ecosystem average DOT request baseline.
    /// @dev This should be called periodically to reflect the current
    ///      ecosystem norm. Only the contract owner may call this.
    /// @param newAvg The new baseline average DOT amount (in Planck).
    function updateBaseline(uint256 newAvg) external onlyOwner {
        require(newAvg > 0, "Fenrir: baseline must be positive");

        uint256 oldBaseline = baselineAvgDOT;
        baselineAvgDOT = newAvg;

        emit BaselineUpdated(oldBaseline, newAvg);
    }

    /// @notice Pause or unpause the contract for emergency situations.
    /// @param _paused Whether to pause (true) or unpause (false).
    function setPaused(bool _paused) external onlyOwner {
        paused = _paused;
    }

    /// @notice Transfer ownership to a new address.
    /// @param newOwner The address to transfer ownership to.
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Fenrir: new owner cannot be zero address");
        owner = newOwner;
    }

    /// @notice Update the inference contract address.
    /// @dev Use with caution — this changes the ML model used for scoring.
    /// @param _inferenceContract The new inference contract address.
    function updateInferenceContract(address _inferenceContract) external onlyOwner {
        require(
            _inferenceContract != address(0),
            "Fenrir: inference contract cannot be zero address"
        );
        inferenceContract = IFenrirInference(_inferenceContract);
    }

    // ==================================================================
    // Internal Helper Functions
    // ==================================================================

    /// @notice Convert a numerical score to a human-readable verdict.
    /// @param _score The risk score to classify.
    /// @return A verdict string: MINIMAL RISK, LOW RISK, MODERATE RISK, or HIGH RISK.
    function _verdict(uint8 _score) internal pure returns (string memory) {
        if (_score >= 75) return "HIGH RISK";
        if (_score >= 50) return "MODERATE RISK";
        if (_score >= 25) return "LOW RISK";
        return "MINIMAL RISK";
    }

    /// @notice Decode a flag bitmask into human-readable descriptions.
    /// @param flags The flag bitmask to decode.
    /// @return An array of flag description strings.
    function _decodeFlags(uint8 flags) internal pure returns (string[] memory) {
        // Allocate the maximum possible array size
        string[] memory result = new string[](5);
        uint8 count = 0;

        // Check each flag bit and add the corresponding description
        if (flags & FLAG_NEW_WALLET != 0) {
            result[count++] = "New wallet — no established history";
        }
        if (flags & FLAG_LARGE_REQUEST != 0) {
            result[count++] = "Request exceeds 3x ecosystem average";
        }
        if (flags & FLAG_NO_TRACK_HISTORY != 0) {
            result[count++] = "No prior approved proposals";
        }
        if (flags & FLAG_CONTENT_SIMILARITY != 0) {
            result[count++] = "Content similar to rejected proposal";
        }
        if (flags & FLAG_BURST_ACTIVITY != 0) {
            result[count++] = "Multiple proposals submitted rapidly";
        }

        // Trim the array to the actual number of active flags
        string[] memory trimmed = new string[](count);
        for (uint8 i = 0; i < count; i++) {
            trimmed[i] = result[i];
        }

        return trimmed;
    }
}
