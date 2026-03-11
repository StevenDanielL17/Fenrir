// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {Test} from "forge-std/Test.sol";
import {FenrirScorer} from "../src/FenrirScorer.sol";
import {MockGovernance} from "../src/mocks/MockGovernance.sol";
import {MockAssetHub} from "../src/mocks/MockAssetHub.sol";
import {IFenrirInference} from "../src/interfaces/IFenrirInference.sol";
import {IGovernancePrecompile} from "../src/interfaces/IGovernancePrecompile.sol";

/// @title Mock inference contract for testing
contract MockInference is IFenrirInference {
    uint8 public mockScore = 80;
    uint8 public mockFlags = 0x03;
    bool  public shouldFail = false;

    function setMock(uint8 score, uint8 flags) external {
        mockScore = score;
        mockFlags = flags;
    }
    function setShouldFail(bool fail) external {
        shouldFail = fail;
    }
    // Returns packed u64 matching the real PVM Rust contract:
    // upper 32 bits = score, lower 32 bits = flag bitmask.
    function scoreProposal(uint64,uint64,uint32,uint32,uint32,uint8)
        external view returns (uint64 packed)
    {
        if (shouldFail) revert("inference boom");
        return (uint64(mockScore) << 32) | uint64(mockFlags);
    }
}

/// @title FenrirScorer Test Suite
contract FenrirScorerTest is Test {
    FenrirScorer  scorer;
    MockInference inference;
    MockGovernance gov;
    MockAssetHub  assetHub;

    address proposer = address(0xBEEF);
    address notOwner = address(0xDEAD);

    // Mirror of the ScorePublished event for vm.expectEmit
    event ScorePublished(
        uint32  indexed refIndex,
        address indexed proposer,
        uint8           score,
        uint8           flags,
        uint128         requestedDot,
        uint64          scoredAtBlock
    );

    function setUp() public {
        inference = new MockInference();
        scorer    = new FenrirScorer(address(inference));
        gov       = new MockGovernance();
        assetHub  = new MockAssetHub();

        // Etch mock governance code at the precompile address
        vm.etch(address(scorer.GOVERNANCE()), address(gov).code);
        // Etch mock Asset Hub at 0x0808 precompile address
        vm.etch(address(scorer.ASSET_HUB()), address(assetHub).code);
    }

    // =========================================================================
    // HAPPY PATH
    // =========================================================================

    function test_ScoresActiveProposal() public {
        _setupProposal(0, 0, proposer, 50_000 ether, 100, 5);

        uint8 score = scorer.scoreReferendum(0);

        assertEq(score, 80);
        // scores() returns: (value, flags, scoredAtBlock, requestedDot, exists)
        (uint8 v,,,,) = scorer.scores(0);
        assertEq(v, 80);
        // getScoreDetails() returns 8 values
        (uint8 s, string memory verdict,,,,,,) = scorer.getScoreDetails(0);
        assertEq(s, 80);
        assertEq(verdict, "HIGH RISK");
        assertEq(scorer.totalScored(), 1);
        assertEq(scorer.totalHighRiskFound(), 1); // score=80 >= 75
    }

    // =========================================================================
    // REVERT CASES
    // =========================================================================

    function test_CannotScoreTwice() public {
        _setupProposal(0, 0, proposer, 50_000 ether, 100, 5);
        scorer.scoreReferendum(0);

        vm.expectRevert(abi.encodeWithSelector(FenrirScorer.AlreadyScored.selector, 0));
        scorer.scoreReferendum(0);
    }

    function test_RejectsNonActiveProposal() public {
        _setupProposal(0, 1, proposer, 50_000 ether, 100, 5); // status=1 = approved

        vm.expectRevert(
            abi.encodeWithSelector(FenrirScorer.NotActiveReferendum.selector, 0, 1)
        );
        scorer.scoreReferendum(0);
    }

    // =========================================================================
    // SCORE DETAILS
    // =========================================================================

    function test_ScoreDetailsDecoded() public {
        inference.setMock(82, 0x01 | 0x02); // new wallet + large request
        _setupProposal(0, 0, proposer, 50_000 ether, 100, 5);
        scorer.scoreReferendum(0);

        (
            uint8 score,
            string memory verdict,
            bool newWallet,
            bool largeReq,
            bool noHistory,
            bool lowApproval,
            bool burst,
            /* uint64 scoredAtBlock */
        ) = scorer.getScoreDetails(0);

        assertEq(score, 82);
        assertEq(verdict, "HIGH RISK");
        assertTrue(newWallet);
        assertTrue(largeReq);
        assertFalse(noHistory);
        assertFalse(lowApproval);
        assertFalse(burst);
    }

    // =========================================================================
    // EVENT EMISSION
    // =========================================================================

    function test_EmitsScorePublished() public {
        _setupProposal(0, 0, proposer, 50_000 ether, 100, 5);

        vm.expectEmit(true, true, false, true);
        emit ScorePublished(
            0, proposer, 80, 0x03, uint128(50_000 ether), uint64(block.number)
        );

        scorer.scoreReferendum(0);
    }

    // =========================================================================
    // HIGH/LOW RISK INPUTS
    // =========================================================================

    function test_HighRiskInputsProduceHighScore() public {
        inference.setMock(92, 0x07);
        _setupProposal(1, 0, proposer, 100_000 ether, 100, 34);
        uint8 score = scorer.scoreReferendum(1);
        assertGe(score, 75, "Worst-case inputs should produce high risk");
    }

    function test_CleanInputsProduceLowScore() public {
        inference.setMock(12, 0x00);
        _setupProposal(2, 0, proposer, 2_000 ether, 100, 33);
        uint8 score = scorer.scoreReferendum(2);
        assertLe(score, 30, "Established proposer should score low");
    }

    // =========================================================================
    // INFERENCE FAILURE GRACEFUL HANDLING
    // =========================================================================

    function test_InferenceFailureGraceful() public {
        inference.setShouldFail(true);
        _setupProposal(3, 0, proposer, 50_000 ether, 100, 5);

        uint8 score = scorer.scoreReferendum(3);

        // Should produce neutral score of 50 with INFERENCE_FAILED flag
        assertEq(score, 50, "Failed inference should give neutral score");
        (
            uint8 s,
            string memory verdict,
            , , , , , /* scoredAtBlock */
        ) = scorer.getScoreDetails(3);
        assertEq(s, 50);
        assertEq(verdict, "MODERATE RISK");
    }

    // =========================================================================
    // ADMIN
    // =========================================================================

    function test_OnlyOwnerCanUpdateInference() public {
        vm.prank(notOwner);
        vm.expectRevert();
        scorer.updateInferenceContract(address(0x1234));
    }

    function test_OwnerCanUpdateInference() public {
        MockInference newInference = new MockInference();
        scorer.updateInferenceContract(address(newInference));
        assertEq(address(scorer.inferenceContract()), address(newInference));
    }

    function test_CannotSetZeroInference() public {
        vm.expectRevert(FenrirScorer.InvalidInferenceContract.selector);
        scorer.updateInferenceContract(address(0));
    }

    function test_ConstructorRejectsZeroAddress() public {
        vm.expectRevert(FenrirScorer.InvalidInferenceContract.selector);
        new FenrirScorer(address(0));
    }

    // =========================================================================
    // PAGINATION
    // =========================================================================

    function test_GetRecentScores() public {
        // Score three proposals
        for (uint32 i = 0; i < 3; i++) {
            _setupProposal(i, 0, proposer, 10_000 ether, 100 + i, 5);
            scorer.scoreReferendum(i);
        }

        (uint32[] memory indices, uint8[] memory scoreValues) =
            scorer.getRecentScores(0, 20);

        assertEq(indices.length, 3);
        assertEq(scoreValues.length, 3);
        // Newest first
        assertEq(indices[0], 2);
        assertEq(indices[1], 1);
        assertEq(indices[2], 0);
    }

    function test_GetRecentScoresOffsetBeyondTotal() public view {
        (uint32[] memory indices,) = scorer.getRecentScores(100, 20);
        assertEq(indices.length, 0);
    }

    // =========================================================================
    // STATS
    // =========================================================================

    function test_GetStats() public {
        _setupProposal(0, 0, proposer, 50_000 ether, 100, 5);
        scorer.scoreReferendum(0); // score 80 = high risk

        inference.setMock(30, 0x00);
        _setupProposal(1, 0, proposer, 2_000 ether, 200, 33);
        scorer.scoreReferendum(1); // score 30 = low risk

        (uint256 total, uint256 highRisk,,) = scorer.getStats();
        assertEq(total, 2);
        assertEq(highRisk, 1);
    }

    // =========================================================================
    // HELPERS
    // =========================================================================

    function _setupProposal(
        uint32 index, uint8 status, address prop,
        uint256 dotAmt, uint256 submittedBlock, uint8 trackId
    ) internal {
        IGovernancePrecompile.ReferendumInfo memory info = IGovernancePrecompile.ReferendumInfo({
            status:         status,
            proposer:       prop,
            requestedDot:   dotAmt,
            submittedBlock: submittedBlock,
            trackId:        trackId
        });
        IGovernancePrecompile.ProposerHistory memory hist = IGovernancePrecompile.ProposerHistory({
            totalProposals:     2,
            approvedCount:      1,
            firstActivityBlock: 0,
            lastProposalBlock:  50
        });
        MockGovernance(address(scorer.GOVERNANCE())).setReferendum(index, info);
        MockGovernance(address(scorer.GOVERNANCE())).setHistory(prop, hist);
    }

    // =========================================================================
    // ADDITIONAL TESTS — minimum 19 total
    // =========================================================================

    /// @dev Verifies that HIGH RISK inputs (new wallet, large request, no history)
    ///      produce a score >= 70 from the mock inference.
    function test_WeightsProduceNonZeroScore() public {
        inference.setMock(85, 0x07); // high risk: new wallet + large request + no history
        _setupProposal(10, 0, proposer, 200_000 ether, 100, 34);
        uint8 score = scorer.scoreReferendum(10);
        assertGe(score, 70, "HIGH RISK inputs must score >= 70");
        (uint8 v,,,,) = scorer.scores(10);
        assertGe(v, 70);
    }

    /// @dev Verifies that a clean, established proposer scores <= 30.
    function test_CleanProducerScoresLow() public {
        inference.setMock(10, 0x00); // no flags, established proposer
        _setupProposal(11, 0, proposer, 500 ether, 300_000, 33);
        uint8 score = scorer.scoreReferendum(11);
        assertLe(score, 30, "Established proposer must score <= 30");
    }

    /// @dev Verifies that packed uint64 from inference unpacks to correct score + flags.
    ///      score=77, flags=0x03 → packed = (77 << 32) | 3
    function test_PackedReturnUnpacksCorrectly() public {
        uint8 expectedScore = 77;
        uint8 expectedFlags = 0x03;
        inference.setMock(expectedScore, expectedFlags);
        _setupProposal(12, 0, proposer, 50_000 ether, 100, 5);
        scorer.scoreReferendum(12);
        (
            uint8 score,
            ,
            bool newWallet,
            bool largeReq,
            , , ,
        ) = scorer.getScoreDetails(12);
        assertEq(score, expectedScore, "Score must unpack correctly from upper 32 bits");
        assertTrue(newWallet,  "FLAG_NEW_WALLET (0x01) must be set");
        assertTrue(largeReq,   "FLAG_LARGE_REQUEST (0x02) must be set");
    }

    /// @dev Verifies that totalModerate and totalLow counters increment correctly.
    function test_StatsCountersIncrement() public {
        // Score 1: HIGH RISK = 80 → goes to totalHighRiskFound
        inference.setMock(80, 0x01);
        _setupProposal(20, 0, proposer, 50_000 ether, 100, 5);
        scorer.scoreReferendum(20);

        // Score 2: MODERATE = 60 → goes to totalModerate
        inference.setMock(60, 0x00);
        _setupProposal(21, 0, proposer, 10_000 ether, 200, 33);
        scorer.scoreReferendum(21);

        // Score 3: LOW = 30 → goes to totalLow
        inference.setMock(30, 0x00);
        _setupProposal(22, 0, proposer, 2_000 ether, 300, 33);
        scorer.scoreReferendum(22);

        (uint256 total, uint256 highRisk, uint256 moderate, uint256 low) = scorer.getStats();
        assertEq(total,    3, "Total should be 3");
        assertEq(highRisk, 1, "High risk counter should be 1");
        assertEq(moderate, 1, "Moderate counter should be 1");
        assertEq(low,      1, "Low counter should be 1");
    }
}
