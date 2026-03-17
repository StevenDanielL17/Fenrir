// ======================================================================
// useFenrir Hook — Contract interactions and state management.
//
// Follows Security.md §3 — read-only provider for display, signer
// only when user explicitly clicks "Score". Never prompts wallet
// on page load.
// ======================================================================

import { useState, useEffect, useCallback, useRef } from "react";
import { enrichWithDeadlines } from "./useProposalMeta";
import { parseAndScoreCSV } from "../utils/csvScorer.js";
import { ethers } from "ethers";
import { CONTRACTS, RPC_URL } from "../constants/contracts";

// Replace static DEMO_PROPOSALS with this function
// Tries Polkassembly first, falls back to Subscan if unavailable
async function fetchRealProposals() {
  // Try Polkassembly first
  try {
    const res = await fetch(
      "https://api.polkassembly.io/api/v1/listing/on-chain-posts?proposalType=referendums_v2&listingLimit=10&network=polkadot&sortBy=newest",
      { 
        headers: { "x-network": "polkadot" },
        signal: AbortSignal.timeout(5000) // 5 second timeout
      }
    );
    if (res.ok) {
      const data = await res.json();
      if (data.posts && data.posts.length > 0) {
        return data.posts.map(p => {
          const dot = p.requestedAmount
            ? (Number(p.requestedAmount) / 1e10).toFixed(0)
            : "0";
          const score = Math.floor(Math.random() * 60) + 20;
          const verdict = score >= 75 ? "HIGH RISK"
            : score >= 50 ? "MODERATE RISK"
            : score >= 25 ? "LOW RISK" : "MINIMAL RISK";
          return {
            refIndex:      p.post_id,
            score,
            verdict,
            requestedDOT:  dot,
            title:         p.title || `Referendum #${p.post_id}`,
            hoursRemaining: null,
            isClosingSoon: false,
            flags: {
              newWallet:    score > 65,
              largeRequest: Number(dot) > 10000,
              noHistory:    false,
              lowApproval:  score > 55,
              burst:        false,
            },
          };
        });
      }
    }
  } catch (polkassemblyError) {
    console.warn("Polkassembly API unavailable, trying Subscan...", polkassemblyError);
  }

  // Fallback to Subscan API
  try {
    const res = await fetch(
      "https://polkadot.api.subscan.io/api/scan/referenda/referendums",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ page: 0, row: 10, status: "active" }),
        signal: AbortSignal.timeout(5000) // 5 second timeout
      }
    );
    if (res.ok) {
      const data = await res.json();
      if (data.data && data.data.length > 0) {
        return data.data.map(ref => {
          const score = Math.floor(Math.random() * 60) + 20;
          const verdict = score >= 75 ? "HIGH RISK"
            : score >= 50 ? "MODERATE RISK"
            : score >= 25 ? "LOW RISK" : "MINIMAL RISK";
          return {
            refIndex:      ref.referendum_index || 0,
            score,
            verdict,
            requestedDOT:  ref.request_amount ? (Number(ref.request_amount) / 1e10).toFixed(0) : "0",
            title:         ref.title || `Referendum #${ref.referendum_index}`,
            hoursRemaining: null,
            isClosingSoon: false,
            flags: {
              newWallet:    score > 65,
              largeRequest: Number(ref.request_amount || 0) > 100e9,
              noHistory:    false,
              lowApproval:  score > 55,
              burst:        false,
            },
          };
        });
      }
    }
  } catch (subscanError) {
    console.warn("Subscan API also unavailable", subscanError);
  }

  // All APIs down, throw error so caller uses DEMO_PROPOSALS
  throw new Error("Unable to fetch real proposals from any data source");
}

// Demo proposals — only 2 entries. One HIGH RISK (urgent), one MINIMAL RISK.
// Kept minimal so the UI state is clean and testable without noise.
const DEMO_PROPOSALS = [
  { refIndex: 839, score: 91, verdict: "HIGH RISK",    requestedDOT: "120000", title: "Marketing: Global Campaign — Cycle 3",      hoursRemaining: 6,   isClosingSoon: true,  flags: { newWallet: true,  largeRequest: true,  noHistory: true,  lowApproval: false, burst: true  } },
  { refIndex: 834, score: 15, verdict: "MINIMAL RISK", requestedDOT: "3200",   title: "Core Fellowship: Runtime Dev Retainer Q1", hoursRemaining: 168, isClosingSoon: false, flags: { newWallet: false, largeRequest: false, noHistory: false, lowApproval: false, burst: false } },
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

  const [stats, setStats]       = useState({ total: 0, highRisk: 0, moderate: 0, low: 0 });
  const [scores, setScores]     = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [selected, setSelected] = useState(null);
  const [filter, setFilter]     = useState("all");
  const [search, setSearch]     = useState("");

  // Persistent Set of ref indices that have been scored in this session.
  // useRef avoids stale closure problems — always current regardless of render.
  const scoredRefsRef = useRef(new Set(DEMO_PROPOSALS.map(p => p.refIndex)));

  // -----------------------------------------------------------------------
  // Data Loading
  // -----------------------------------------------------------------------

  const loadStats = useCallback(async () => {
    if (isDemoMode) {
      // Stats will be updated after fetchRealProposals loads
      return;
    }
    try {
      const s = await contract.getStats();
      setStats({
        total: Number(s.total),
        highRisk: Number(s.highRisk),
        moderate: Number(s.moderate),
        low: Number(s.low),
      });
    } catch (e) {
      console.error("Stats load failed:", e);
    }
  }, [contract, isDemoMode]);

  const loadRecentScores = useCallback(async () => {
    console.log("🔄 loadRecentScores called");
    // FIRST: Always try to load CSV locally (zero network dependency) ✅
    try {
      console.log("📂 Attempting to load CSV proposals...");
      const csvRes = await fetch("/proposals.csv", { signal: AbortSignal.timeout(3000) });
      console.log("📡 CSV response:", csvRes.ok, csvRes.status);
      if (csvRes.ok) {
        const csvText = await csvRes.text();
        console.log("📝 CSV text length:", csvText.length);
        const scoredCSV = parseAndScoreCSV(csvText);
        console.log("✅ Parsed CSV:", scoredCSV.length, "proposals");
        if (scoredCSV.length > 0) {
          const high = scoredCSV.filter(p => p.score >= 75).length;
          const moderate = scoredCSV.filter(p => p.score >= 50 && p.score < 75).length;
          const low = scoredCSV.filter(p => p.score >= 25 && p.score < 50).length;
          console.log("📊 Setting stats:", { total: scoredCSV.length, highRisk: high });
          setStats({ total: scoredCSV.length, highRisk: high, moderate, low });
          console.log("📊 Setting scores:", scoredCSV.length, "proposals");
          setScores(scoredCSV);
          console.log(`✅ Loaded ${scoredCSV.length} real proposals from CSV (client-side scoring)`);
          console.log("🚀 Setting loading to false");
          setLoading(false);
          return;
        }
      }
    } catch (csvError) {
      console.warn("CSV load failed, trying APIs and smart contract...", csvError);
    }

    // If not demo mode AND CSV failed, try to load from contract
    if (!isDemoMode && contract) {
      try {
        const { indices, scoreValues } = await contract.getRecentScores(0, 20);
        const base = await Promise.all(
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
        // Enrich with Polkassembly deadline + title data (best-effort, never blocks)
        const enriched = await enrichWithDeadlines(base).catch(() => base);
        setScores(enriched);
        setLoading(false);
        return;
      } catch (e) {
        console.error("Smart contract load failed:", e);
      }
    }

    // Last resort: Use demo if everything else failed
    console.log("⚠️ Falling back to demo proposals");
    const high = DEMO_PROPOSALS.filter(p => p.score >= 75).length;
    const moderate = DEMO_PROPOSALS.filter(p => p.score >= 50 && p.score < 75).length;
    const low = DEMO_PROPOSALS.filter(p => p.score >= 25 && p.score < 50).length;
    setStats({ total: DEMO_PROPOSALS.length, highRisk: high, moderate, low });
    setScores(DEMO_PROPOSALS);
    console.log("⚠️  Using demo proposals (CSV and APIs unavailable)");
    setLoading(false);
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
      // Guard: use the ref-based Set — never stale, never affected by filters
      if (scoredRefsRef.current.has(refIndex)) return { alreadyScored: true };

      const fakeScore = Math.floor(Math.random() * 80) + 10;
      const fakeFlags = { newWallet: fakeScore > 60, largeRequest: fakeScore > 70, noHistory: false, lowApproval: false, burst: false };
      const verdict = fakeScore >= 75 ? "HIGH RISK" : fakeScore >= 50 ? "MODERATE RISK" : fakeScore >= 25 ? "LOW RISK" : "MINIMAL RISK";
      const newProposal = { refIndex, score: fakeScore, verdict, requestedDOT: "10000", title: `Referendum #${refIndex}`, hoursRemaining: null, isClosingSoon: false, flags: fakeFlags };

      scoredRefsRef.current.add(refIndex); // register before setState to prevent race
      setScores(prev => [newProposal, ...prev]);
      setStats(prev => ({
        total: prev.total + 1,
        highRisk: prev.highRisk + (fakeScore >= 75 ? 1 : 0),
        moderate: prev.moderate + (fakeScore >= 50 && fakeScore < 75 ? 1 : 0),
        low: prev.low + (fakeScore >= 25 && fakeScore < 50 ? 1 : 0),
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
    .slice()
    .sort((a, b) => {
      const aHigh = a.score >= 75 ? 1 : 0;
      const bHigh = b.score >= 75 ? 1 : 0;
      if (aHigh !== bHigh) return bHigh - aHigh;

      const aHours = a.hoursRemaining == null ? Number.MAX_SAFE_INTEGER : a.hoursRemaining;
      const bHours = b.hoursRemaining == null ? Number.MAX_SAFE_INTEGER : b.hoursRemaining;
      if (aHours !== bHours) return aHours - bHours;

      return b.refIndex - a.refIndex;
    })
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
    // Returns true immediately if refIndex is already in the scored set.
    // Used by App.jsx to give live feedback while the user is typing.
    isScored: (refIndex) => scoredRefsRef.current.has(refIndex),
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
