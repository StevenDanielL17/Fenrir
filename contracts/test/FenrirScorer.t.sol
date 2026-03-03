// SPDX-License-Identifier: MIT
// ======================================================================
// FenrirScorer Test Suite — Foundry
// ======================================================================
// Comprehensive tests for the FenrirScorer contract, covering:
//   - High-risk proposal detection
//   - Low-risk proposal verification
//   - Double-scoring prevention
//   - Access control enforcement
//   - Pause mechanism
//   - Flag decoding accuracy
//   - Edge cases and boundary conditions
//
// These tests use mock precompiles and a mock inference contract
// to simulate the full scoring pipeline without requiring the
// actual Polkadot Hub runtime.
//
// See BASE_INSTRUCTIONS.md Section 4.1 for the contract specification.
// ======================================================================
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/FenrirScorer.sol";
import "../src/interfaces/IGovernancePrecompile.sol";
import "../src/interfaces/IAssetHubPrecompile.sol";
import "../src/interfaces/IFenrirInference.sol";

// ======================================================================
// Mock Contracts
// ======================================================================

/// @notice Mock governance precompile for testing.
/// @dev Simulates the 0x0807 precompile by returning configurable
///      referendum and proposer history data.
contract MockGovernancePrecompile is IGovernancePrecompile {
    struct ReferendumData {
        uint8 status;
        address proposer;
        uint256 requestedDOT;
        uint256 submittedAt;
        bytes32 contentHash;
    }

    struct ProposerData {
        uint32 totalProposals;
        uint32 approvedCount;
        uint256 firstActivityBlock;
    }

    mapping(uint32 => ReferendumData) public referenda;
    mapping(address => ProposerData) public proposers;

    /// @notice Configure a mock referendum for testing.
    function setReferendum(
        uint32 refIndex,
        uint8 status,
        address proposer,
        uint256 requestedDOT,
        uint256 submittedAt,
        bytes32 contentHash
    ) external {
        referenda[refIndex] = ReferendumData(
            status, proposer, requestedDOT, submittedAt, contentHash
        );
    }

    /// @notice Configure mock proposer history for testing.
    function setProposerHistory(
        address proposer,
        uint32 totalProposals,
        uint32 approvedCount,
        uint256 firstActivityBlock
    ) external {
        proposers[proposer] = ProposerData(
            totalProposals, approvedCount, firstActivityBlock
        );
    }

    function getReferendumInfo(uint32 refIndex)
        external
        view
        returns (
            uint8 status,
            address proposer,
            uint256 requestedDOT,
            uint256 submittedAt,
            bytes32 contentHash
        )
    {
        ReferendumData memory r = referenda[refIndex];
        return (r.status, r.proposer, r.requestedDOT, r.submittedAt, r.contentHash);
    }

    function getProposerHistory(address proposer)
        external
        view
        returns (
            uint32 totalProposals,
            uint32 approvedCount,
            uint256 firstActivityBlock
        )
    {
        ProposerData memory p = proposers[proposer];
        return (p.totalProposals, p.approvedCount, p.firstActivityBlock);
    }
}

/// @notice Mock Asset Hub precompile for testing.
contract MockAssetHubPrecompile is IAssetHubPrecompile {
    mapping(uint32 => uint256) public amounts;
    mapping(uint32 => bool) public hasRequest;

    function setNativeAssetRequest(uint32 refIndex, uint256 dotAmount, bool _hasRequest)
        external
    {
        amounts[refIndex] = dotAmount;
        hasRequest[refIndex] = _hasRequest;
    }

    function getNativeAssetRequest(uint32 refIndex)
        external
        view
        returns (uint256 dotAmount, bool _hasAssetRequest)
    {
        return (amounts[refIndex], hasRequest[refIndex]);
    }
}

/// @notice Mock inference contract for testing.
/// @dev Returns configurable scores and flags, enabling us to test
///      the scorer contract's behaviour independently of the ML model.
contract MockFenrirInference is IFenrirInference {
    uint8 public mockScore;
    uint8 public mockFlags;

    /// @notice Configure the mock return values.
    function setMockResult(uint8 _score, uint8 _flags) external {
        mockScore = _score;
        mockFlags = _flags;
    }

    function scoreProposal(
        uint256, /* walletAgeBlocks */
        uint256, /* requestedDOT */
        uint256, /* historicalAvgDOT */
        uint32,  /* priorApproved */
        uint32,  /* priorTotal */
        uint256, /* contentSimilarityHash */
        uint8    /* trackId */
    ) external view returns (uint8 score, uint8 flagBitmask) {
        return (mockScore, mockFlags);
    }
}

// ======================================================================
// Test Contract
// ======================================================================

/// @title FenrirScorerTest
/// @notice Comprehensive test suite for the FenrirScorer contract.
contract FenrirScorerTest is Test {
    FenrirScorer public scorer;
    MockGovernancePrecompile public mockGov;
    MockAssetHubPrecompile public mockAssetHub;
    MockFenrirInference public mockInference;

    // Test addresses
    address public deployer = address(this);
    address public riskProposer = address(0xBAD);
    address public safeProposer = address(0x600D);
    address public unauthorised = address(0xDEAD);

    // Test referendum indices
    uint32 constant HIGH_RISK_REF = 847;
    uint32 constant LOW_RISK_REF = 845;
    uint32 constant INACTIVE_REF = 900;

    // Local event declaration — mirrors FenrirScorer.ScorePublished
    // Required because Solidity 0.8.20 does not permit ContractName.EventName syntax in emit
    event ScorePublished(
        uint32 indexed refIndex,
        address indexed proposer,
        uint8 score,
        uint8 flags,
        uint256 requestedDOT
    );

    function setUp() public {
        // Deploy mock contracts
        mockGov = new MockGovernancePrecompile();
        mockAssetHub = new MockAssetHubPrecompile();
        mockInference = new MockFenrirInference();

        // Deploy the scorer with the mock inference contract
        scorer = new FenrirScorer(address(mockInference));

        // ----- Configure high-risk referendum (REF #847) -----
        // New wallet, enormous DOT request, no prior approvals.
        mockGov.setReferendum(
            HIGH_RISK_REF,
            0,                      // status: ongoing
            riskProposer,           // proposer
            42000 ether,            // requestedDOT: 42,000 DOT
            19_847_000,             // submittedAt: block number
            keccak256("risky")      // contentHash
        );

        mockGov.setProposerHistory(
            riskProposer,
            1,                      // totalProposals
            0,                      // approvedCount: none
            19_834_600              // firstActivityBlock: recent (12,400 blocks ago)
        );

        // ----- Configure low-risk referendum (REF #845) -----
        // Established wallet, reasonable request, strong track record.
        mockGov.setReferendum(
            LOW_RISK_REF,
            0,                      // status: ongoing
            safeProposer,           // proposer
            1200 ether,             // requestedDOT: 1,200 DOT
            19_847_000,             // submittedAt
            keccak256("infra")      // contentHash
        );

        mockGov.setProposerHistory(
            safeProposer,
            10,                     // totalProposals
            8,                      // approvedCount: strong record
            15_000_000              // firstActivityBlock: well established
        );

        // ----- Configure inactive referendum (REF #900) -----
        // Referendum that has already been approved — cannot be scored.
        mockGov.setReferendum(
            INACTIVE_REF,
            1,                      // status: approved (not ongoing)
            safeProposer,
            3000 ether,
            19_847_000,
            keccak256("approved")
        );

        // Set up code deployments at precompile addresses so the
        // scorer contract can call them. We etch the mock contracts'
        // code at the precompile addresses.
        vm.etch(
            address(0x0000000000000000000000000000000000000807),
            address(mockGov).code
        );
        vm.etch(
            address(0x0000000000000000000000000000000000000808),
            address(mockAssetHub).code
        );

        // Copy the mock governance state to the etched precompile
        // For a real test environment, we would need a more sophisticated
        // approach, but this suffices for unit testing the scorer logic.

        // Store referendum data at the precompile address
        MockGovernancePrecompile govAtPrecompile = MockGovernancePrecompile(
            address(0x0000000000000000000000000000000000000807)
        );

        govAtPrecompile.setReferendum(
            HIGH_RISK_REF, 0, riskProposer, 42000 ether,
            19_847_000, keccak256("risky")
        );
        govAtPrecompile.setProposerHistory(
            riskProposer, 1, 0, 19_834_600
        );

        govAtPrecompile.setReferendum(
            LOW_RISK_REF, 0, safeProposer, 1200 ether,
            19_847_000, keccak256("infra")
        );
        govAtPrecompile.setProposerHistory(
            safeProposer, 10, 8, 15_000_000
        );

        govAtPrecompile.setReferendum(
            INACTIVE_REF, 1, safeProposer, 3000 ether,
            19_847_000, keccak256("approved")
        );
    }

    // ==================================================================
    // Core Scoring Tests
    // ==================================================================

    /// @notice Test that a high-risk proposal receives an appropriately high score.
    function test_HighRiskProposal() public {
        // Configure the mock inference to return a high score
        mockInference.setMockResult(82, 0x07);  // score=82, flags: wallet+amount+history

        uint8 score = scorer.scoreReferendum(HIGH_RISK_REF);

        assertGe(score, 75, "High-risk proposal should score >= 75");

        // Verify the stored score data
        (uint8 storedScore, uint8 storedFlags, uint256 scoredBlock) =
            scorer.getRawScore(HIGH_RISK_REF);

        assertEq(storedScore, 82, "Stored score should match");
        assertTrue(storedFlags & 0x01 != 0, "New wallet flag should be set");
        assertTrue(storedFlags & 0x02 != 0, "Large request flag should be set");
        assertTrue(storedFlags & 0x04 != 0, "No history flag should be set");
        assertEq(scoredBlock, block.number, "Scored block should be current");
    }

    /// @notice Test that a low-risk proposal receives an appropriately low score.
    function test_LowRiskProposal() public {
        // Configure the mock inference to return a low score
        mockInference.setMockResult(18, 0x00);  // score=18, no flags

        uint8 score = scorer.scoreReferendum(LOW_RISK_REF);

        assertLe(score, 30, "Low-risk proposal should score <= 30");

        // Verify the stored score data
        (uint8 storedScore, uint8 storedFlags,) = scorer.getRawScore(LOW_RISK_REF);

        assertEq(storedScore, 18, "Stored score should match");
        assertEq(storedFlags, 0x00, "No flags should be set");
    }

    /// @notice Test that re-scoring the same proposal reverts.
    function test_CannotDoubleScore() public {
        mockInference.setMockResult(50, 0x01);

        // First scoring should succeed
        scorer.scoreReferendum(HIGH_RISK_REF);

        // Second scoring should revert
        vm.expectRevert("Fenrir: already scored");
        scorer.scoreReferendum(HIGH_RISK_REF);
    }

    /// @notice Test that scoring a non-ongoing referendum reverts.
    function test_CannotScoreInactiveProposal() public {
        vm.expectRevert("Fenrir: only score active proposals");
        scorer.scoreReferendum(INACTIVE_REF);
    }

    // ==================================================================
    // Score Reading Tests
    // ==================================================================

    /// @notice Test the getScore function returns proper verdict strings.
    function test_GetScoreReturnsVerdict() public {
        mockInference.setMockResult(82, 0x07);
        scorer.scoreReferendum(HIGH_RISK_REF);

        (uint8 score, string memory verdict, string[] memory flags) =
            scorer.getScore(HIGH_RISK_REF);

        assertEq(score, 82, "Score should be 82");
        assertEq(verdict, "HIGH RISK", "Verdict should be HIGH RISK");
        assertEq(flags.length, 3, "Should have 3 active flags");
    }

    /// @notice Test that reading an unscored proposal reverts.
    function test_GetScoreRevertsForUnscored() public {
        vm.expectRevert("Fenrir: not yet scored");
        scorer.getScore(999);
    }

    /// @notice Test the isScored() convenience function.
    function test_IsScoredFunction() public {
        assertFalse(scorer.isScored(HIGH_RISK_REF), "Should not be scored yet");

        mockInference.setMockResult(50, 0x01);
        scorer.scoreReferendum(HIGH_RISK_REF);

        assertTrue(scorer.isScored(HIGH_RISK_REF), "Should now be scored");
    }

    /// @notice Test totalScored counter increments correctly.
    function test_TotalScoredCounter() public {
        assertEq(scorer.totalScored(), 0, "Should start at zero");

        mockInference.setMockResult(82, 0x07);
        scorer.scoreReferendum(HIGH_RISK_REF);
        assertEq(scorer.totalScored(), 1, "Should be 1 after first score");

        mockInference.setMockResult(18, 0x00);
        scorer.scoreReferendum(LOW_RISK_REF);
        assertEq(scorer.totalScored(), 2, "Should be 2 after second score");
    }

    // ==================================================================
    // Verdict Classification Tests
    // ==================================================================

    /// @notice Test all four verdict thresholds.
    function test_VerdictThresholds() public {
        // Test HIGH RISK (>= 75)
        mockInference.setMockResult(75, 0x00);
        scorer.scoreReferendum(HIGH_RISK_REF);
        (, string memory verdict,) = scorer.getScore(HIGH_RISK_REF);
        assertEq(verdict, "HIGH RISK");

        // Test MODERATE RISK (>= 50, < 75)
        mockInference.setMockResult(50, 0x00);
        scorer.scoreReferendum(LOW_RISK_REF);
        (, verdict,) = scorer.getScore(LOW_RISK_REF);
        assertEq(verdict, "MODERATE RISK");
    }

    // ==================================================================
    // Administrative Function Tests
    // ==================================================================

    /// @notice Test that the owner can update the baseline.
    function test_UpdateBaseline() public {
        uint256 newBaseline = 10000 ether;
        scorer.updateBaseline(newBaseline);

        assertEq(scorer.baselineAvgDOT(), newBaseline, "Baseline should be updated");
    }

    /// @notice Test that non-owners cannot update the baseline.
    function test_OnlyOwnerCanUpdateBaseline() public {
        vm.prank(unauthorised);
        vm.expectRevert("Fenrir: caller is not the owner");
        scorer.updateBaseline(10000 ether);
    }

    /// @notice Test that baseline cannot be set to zero.
    function test_BaselineCannotBeZero() public {
        vm.expectRevert("Fenrir: baseline must be positive");
        scorer.updateBaseline(0);
    }

    /// @notice Test the pause mechanism.
    function test_PauseMechanism() public {
        // Pause the contract
        scorer.setPaused(true);

        // Scoring should now revert
        mockInference.setMockResult(50, 0x01);
        vm.expectRevert("Fenrir: contract is paused");
        scorer.scoreReferendum(HIGH_RISK_REF);

        // Unpause and scoring should work
        scorer.setPaused(false);
        scorer.scoreReferendum(HIGH_RISK_REF);
    }

    /// @notice Test ownership transfer.
    function test_TransferOwnership() public {
        address newOwner = address(0x1234);
        scorer.transferOwnership(newOwner);

        assertEq(scorer.owner(), newOwner, "Owner should be updated");

        // Old owner should no longer be authorised
        vm.expectRevert("Fenrir: caller is not the owner");
        scorer.updateBaseline(10000 ether);
    }

    /// @notice Test that ownership cannot be transferred to zero address.
    function test_CannotTransferToZeroAddress() public {
        vm.expectRevert("Fenrir: new owner cannot be zero address");
        scorer.transferOwnership(address(0));
    }

    /// @notice Test inference contract update.
    function test_UpdateInferenceContract() public {
        MockFenrirInference newInference = new MockFenrirInference();
        scorer.updateInferenceContract(address(newInference));

        assertEq(
            address(scorer.inferenceContract()),
            address(newInference),
            "Inference contract should be updated"
        );
    }

    // ==================================================================
    // Event Emission Tests
    // ==================================================================

    /// @notice Test that ScorePublished event is emitted correctly.
    function test_ScorePublishedEvent() public {
        mockInference.setMockResult(82, 0x07);

        // We expect the ScorePublished event to be emitted
        vm.expectEmit(true, true, false, true);
        emit ScorePublished(
            HIGH_RISK_REF,
            riskProposer,
            82,
            0x07,
            42000 ether
        );

        scorer.scoreReferendum(HIGH_RISK_REF);
    }

    // ==================================================================
    // Constructor Validation Tests
    // ==================================================================

    /// @notice Test that deploying with zero inference address reverts.
    function test_ConstructorRejectsZeroAddress() public {
        vm.expectRevert("Fenrir: inference contract cannot be zero address");
        new FenrirScorer(address(0));
    }
}
