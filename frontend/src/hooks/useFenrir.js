// ======================================================================
// useFenrir Hook — Contract interactions and state management.
//
// Follows Security.md §3 — read-only provider for display, signer
// only when user explicitly clicks "Score". Never prompts wallet
// on page load.
// ======================================================================

import { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import { CONTRACTS, RPC_URL } from "../constants/contracts";

// Demo proposals used when VITE_SCORER_ADDRESS is not set
const DEMO_PROPOSALS = [
  { refIndex: 847, score: 82, verdict: "HIGH RISK", requestedDOT: "42000", flags: { newWallet: true, largeRequest: true, noHistory: false, lowApproval: false, burst: false } },
  { refIndex: 845, score: 36, verdict: "LOW RISK", requestedDOT: "8500", flags: { newWallet: false, largeRequest: false, noHistory: true, lowApproval: false, burst: false } },
  { refIndex: 839, score: 91, verdict: "HIGH RISK", requestedDOT: "120000", flags: { newWallet: true, largeRequest: true, noHistory: true, lowApproval: false, burst: true } },
  { refIndex: 834, score: 15, verdict: "MINIMAL RISK", requestedDOT: "3200", flags: { newWallet: false, largeRequest: false, noHistory: false, lowApproval: false, burst: false } },
  { refIndex: 830, score: 58, verdict: "MODERATE RISK", requestedDOT: "27800", flags: { newWallet: false, largeRequest: true, noHistory: false, lowApproval: true, burst: false } },
  { refIndex: 826, score: 22, verdict: "MINIMAL RISK", requestedDOT: "4100", flags: { newWallet: false, largeRequest: false, noHistory: false, lowApproval: false, burst: false } },
  { refIndex: 821, score: 71, verdict: "MODERATE RISK", requestedDOT: "35600", flags: { newWallet: true, largeRequest: true, noHistory: false, lowApproval: false, burst: false } },
  { refIndex: 818, score: 44, verdict: "LOW RISK", requestedDOT: "12400", flags: { newWallet: false, largeRequest: false, noHistory: true, lowApproval: true, burst: false } },
];

export function useFenrir() {
  const isDemoMode = !CONTRACTS.scorer.address;

  const [provider] = useState(() => {
    try { return new ethers.JsonRpcProvider(RPC_URL); }
    catch { return null; }
  });

  const [contract] = useState(() => {
    if (isDemoMode || !provider) return null;
    return new ethers.Contract(
      CONTRACTS.scorer.address,
      CONTRACTS.scorer.abi,
      provider
    );
  });

  const [stats, setStats]       = useState({ total: 0, highRisk: 0 });
  const [scores, setScores]     = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [selected, setSelected] = useState(null);
  const [filter, setFilter]     = useState("all");
  const [search, setSearch]     = useState("");

  // -----------------------------------------------------------------------
  // Data Loading
  // -----------------------------------------------------------------------

  const loadStats = useCallback(async () => {
    if (isDemoMode) {
      const high = DEMO_PROPOSALS.filter(p => p.score >= 75).length;
      setStats({ total: DEMO_PROPOSALS.length, highRisk: high });
      return;
    }
    try {
      const s = await contract.getStats();
      setStats({ total: Number(s.total), highRisk: Number(s.highRisk) });
    } catch (e) {
      console.error("Stats load failed:", e);
    }
  }, [contract, isDemoMode]);

  const loadRecentScores = useCallback(async () => {
    if (isDemoMode) {
      setScores(DEMO_PROPOSALS);
      return;
    }
    try {
      const { indices, scoreValues } = await contract.getRecentScores(0, 20);
      const enriched = await Promise.all(
        indices.map(async (idx, i) => {
          const details = await contract.getScoreDetails(idx);
          const raw = await contract.scores(idx);
          return {
            refIndex: Number(idx),
            score: Number(scoreValues[i]),
            verdict: details.verdict,
            requestedDOT: ethers.formatEther(raw.requestedDOT),
            flags: {
              newWallet:    details.flagNewWallet,
              largeRequest: details.flagLargeRequest,
              noHistory:    details.flagNoHistory,
              lowApproval:  details.flagLowApproval,
              burst:        details.flagBurst,
            },
          };
        })
      );
      setScores(enriched);
    } catch (e) {
      console.error("Scores load failed:", e);
      setError("Could not load proposals. Check your connection and try again.");
    }
  }, [contract, isDemoMode]);

  useEffect(() => {
    Promise.all([loadStats(), loadRecentScores()])
      .finally(() => setLoading(false));

    if (contract) {
      contract.on("ScorePublished", () => {
        loadStats();
        loadRecentScores();
      });
      return () => contract.removeAllListeners();
    }
  }, [contract, loadStats, loadRecentScores]);

  // -----------------------------------------------------------------------
  // Scoring — requires signer
  // -----------------------------------------------------------------------

  const scoreProposal = useCallback(async (refIndex) => {
    if (isDemoMode) {
      // Simulate scoring
      const fakeScore = Math.floor(Math.random() * 80) + 10;
      const fakeFlags = { newWallet: fakeScore > 60, largeRequest: fakeScore > 70, noHistory: false, lowApproval: false, burst: false };
      const verdict = fakeScore >= 75 ? "HIGH RISK" : fakeScore >= 50 ? "MODERATE RISK" : fakeScore >= 25 ? "LOW RISK" : "MINIMAL RISK";
      const newProposal = { refIndex, score: fakeScore, verdict, requestedDOT: "10000", flags: fakeFlags };
      setScores(prev => [newProposal, ...prev]);
      setStats(prev => ({
        total: prev.total + 1,
        highRisk: prev.highRisk + (fakeScore >= 75 ? 1 : 0),
      }));
      return newProposal;
    }

    // Real scoring — request signer
    if (!window.ethereum) throw new Error("No wallet detected");
    const browserProvider = new ethers.BrowserProvider(window.ethereum);
    const signer = await browserProvider.getSigner();
    const contractWithSigner = contract.connect(signer);

    try {
      const tx = await contractWithSigner.scoreReferendum(refIndex);
      return await tx.wait();
    } catch (e) {
      if (e.message?.includes("AlreadyScored")) {
        return { alreadyScored: true };
      }
      if (e.message?.includes("NotActiveReferendum")) {
        throw new Error("This referendum is no longer active");
      }
      throw e;
    }
  }, [contract, isDemoMode]);

  // -----------------------------------------------------------------------
  // Filtering
  // -----------------------------------------------------------------------

  const filteredScores = scores
    .filter(p => {
      if (filter === "high")     return p.score >= 75;
      if (filter === "moderate") return p.score >= 50 && p.score < 75;
      if (filter === "low")      return p.score >= 25 && p.score < 50;
      if (filter === "minimal")  return p.score < 25;
      return true;
    })
    .filter(p => {
      if (!search) return true;
      return p.refIndex.toString().includes(search);
    });

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  return {
    stats,
    scores: filteredScores,
    loading,
    error,
    isDemoMode,
    selected,
    filter,
    search,
    setFilter,
    setSearch,
    setSelected,
    scoreProposal,
    loadRecentScores,
    clearError: () => setError(null),
    retry: () => {
      setLoading(true);
      setError(null);
      Promise.all([loadStats(), loadRecentScores()])
        .finally(() => setLoading(false));
    },
  };
}
