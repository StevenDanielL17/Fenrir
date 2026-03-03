// ======================================================================
// useFenrir Hook — ethers.js Contract Interactions
// ======================================================================
// This hook provides the frontend with a clean interface to interact
// with the FenrirScorer smart contract. It handles wallet connection,
// contract instantiation, score fetching, and event listening.
//
// The hook uses simulated (demo) data when no contract is deployed,
// allowing the frontend to function fully during development and
// for the hackathon demonstration.
//
// See BASE_INSTRUCTIONS.md Section 6 for the full UI specification.
// ======================================================================

import { useState, useEffect, useCallback, useRef } from 'react';
import { FENRIR_SCORER_ABI } from '../contracts/FenrirScorerABI';

// -----------------------------------------------------------------------
// Configuration
// -----------------------------------------------------------------------

const RPC_URL = import.meta.env.VITE_RPC_URL || 'https://westend-rpc.polkadot.io';
const SCORER_ADDRESS = import.meta.env.VITE_SCORER_ADDRESS || '';
const CHAIN_ID = import.meta.env.VITE_CHAIN_ID || '420420421';

// -----------------------------------------------------------------------
// Flag Definitions
// -----------------------------------------------------------------------
// These correspond to the bitmask constants in FenrirScorer.sol.
// Each flag maps a bit position to a human-readable label, description,
// and severity level for the UI.

const FLAG_DEFINITIONS = {
  0x01: {
    label: 'New Wallet',
    description: 'Wallet age is below 50,000 blocks (~83 days)',
    severity: 'high',
    icon: '🆕',
  },
  0x02: {
    label: 'Large Request',
    description: 'DOT request exceeds 3x the ecosystem average',
    severity: 'high',
    icon: '💰',
  },
  0x04: {
    label: 'No Track History',
    description: 'Proposer has no previously approved proposals',
    severity: 'moderate',
    icon: '📋',
  },
  0x08: {
    label: 'Content Similarity',
    description: 'Proposal content similar to a previously rejected one',
    severity: 'moderate',
    icon: '📄',
  },
  0x10: {
    label: 'Burst Activity',
    description: 'Multiple proposals submitted in a short time window',
    severity: 'high',
    icon: '⚡',
  },
};

// -----------------------------------------------------------------------
// Simulated Data for Demo Mode
// -----------------------------------------------------------------------
// When no contract is deployed, we use realistic simulated data
// to demonstrate the full UI experience during the hackathon.

const DEMO_PROPOSALS = [
  {
    refIndex: 847,
    title: 'Treasury Request — Marketing Expansion Q2 2026',
    proposer: '5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty',
    requestedDOT: 42000,
    track: 'Big Spender',
    trackId: 34,
    status: 'ongoing',
    submittedAt: 19847000,
    score: 82,
    flags: 0x07, // New wallet + Large request + No history
    verdict: 'HIGH RISK',
    scoredAtBlock: 19847201,
  },
  {
    refIndex: 845,
    title: 'Infrastructure — RPC Node Optimisation',
    proposer: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
    requestedDOT: 1200,
    track: 'Medium Spender',
    trackId: 33,
    status: 'ongoing',
    submittedAt: 19846500,
    score: 18,
    flags: 0x00, // No flags
    verdict: 'MINIMAL RISK',
    scoredAtBlock: 19846800,
  },
  {
    refIndex: 843,
    title: 'Development — Governance Analytics Dashboard',
    proposer: '5FLSigC9HGRKVhB9FiEo4Y3koPsNmBmLJbpXg2mp1hXcS59Y',
    requestedDOT: 8500,
    track: 'Medium Spender',
    trackId: 33,
    status: 'ongoing',
    submittedAt: 19845200,
    score: 35,
    flags: 0x04, // No track history
    verdict: 'LOW RISK',
    scoredAtBlock: 19845500,
  },
  {
    refIndex: 841,
    title: 'Treasury Request — Bridge Security Audit',
    proposer: '5DAAnrj7VHTznn2AWBemMuyBwZWs6FNFjdyVXUeYum3PTXFy',
    requestedDOT: 85000,
    track: 'Big Spender',
    trackId: 34,
    status: 'ongoing',
    submittedAt: 19844000,
    score: 91,
    flags: 0x07, // New wallet + Large request + No history
    verdict: 'HIGH RISK',
    scoredAtBlock: 19844300,
  },
  {
    refIndex: 839,
    title: 'Community — Polkadot Meetup Sponsorship APAC',
    proposer: '5HGjWAeFDfFCWPsjFQdVV2Msvz2XtMktvgocEZcCj68kUMaw',
    requestedDOT: 3000,
    track: 'Small Spender',
    trackId: 32,
    status: 'ongoing',
    submittedAt: 19843000,
    score: 12,
    flags: 0x00, // No flags
    verdict: 'MINIMAL RISK',
    scoredAtBlock: 19843200,
  },
  {
    refIndex: 837,
    title: 'Marketing — Influencer Campaign Batch 3',
    proposer: '5CiPPseXPECbkjWCa6MnjNokrgYjMqmKndv2rSneWj2QP2Cz',
    requestedDOT: 65000,
    track: 'Big Spender',
    trackId: 34,
    status: 'ongoing',
    submittedAt: 19842000,
    score: 68,
    flags: 0x06, // Large request + No history
    verdict: 'MODERATE RISK',
    scoredAtBlock: 19842400,
  },
  {
    refIndex: 835,
    title: 'Development — Substrate Runtime Templates',
    proposer: '5GNJqTPyNqANBkUVMN1LPPrxXnFouWA2MRQg3gKrUYgw6J9d',
    requestedDOT: 2500,
    track: 'Small Spender',
    trackId: 32,
    status: 'ongoing',
    submittedAt: 19841000,
    score: 8,
    flags: 0x00,
    verdict: 'MINIMAL RISK',
    scoredAtBlock: 19841300,
  },
  {
    refIndex: 833,
    title: 'Treasury Request — Cross-chain Liquidity Pool',
    proposer: '5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty',
    requestedDOT: 38000,
    track: 'Big Spender',
    trackId: 34,
    status: 'ongoing',
    submittedAt: 19840000,
    score: 78,
    flags: 0x13, // New wallet + Large request + Burst activity
    verdict: 'HIGH RISK',
    scoredAtBlock: 19840200,
  },
  {
    refIndex: 831,
    title: 'Infrastructure — Archive Node Cluster Expansion',
    proposer: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
    requestedDOT: 4500,
    track: 'Medium Spender',
    trackId: 33,
    status: 'ongoing',
    submittedAt: 19839000,
    score: 22,
    flags: 0x00,
    verdict: 'MINIMAL RISK',
    scoredAtBlock: 19839400,
  },
  {
    refIndex: 829,
    title: 'Treasury Request — Anonymous DAO Proposal',
    proposer: '5DAAnrj7VHTznn2AWBemMuyBwZWs6FNFjdyVXUeYum3PTXFy',
    requestedDOT: 120000,
    track: 'Big Spender',
    trackId: 34,
    status: 'ongoing',
    submittedAt: 19838000,
    score: 96,
    flags: 0x17, // All flags except content similarity
    verdict: 'HIGH RISK',
    scoredAtBlock: 19838300,
  },
];

// -----------------------------------------------------------------------
// Utility Functions
// -----------------------------------------------------------------------

/**
 * Decode a flag bitmask into an array of flag objects.
 */
export function decodeFlags(flagBitmask) {
  const activeFlags = [];

  for (const [bit, definition] of Object.entries(FLAG_DEFINITIONS)) {
    const bitValue = parseInt(bit);
    if (flagBitmask & bitValue) {
      activeFlags.push({
        bit: bitValue,
        ...definition,
      });
    }
  }

  return activeFlags;
}

/**
 * Determine the risk level class name from a score.
 */
export function getRiskLevel(score) {
  if (score >= 75) return 'high';
  if (score >= 50) return 'moderate';
  if (score >= 25) return 'low';
  return 'minimal';
}

/**
 * Get the verdict string from a score.
 */
export function getVerdict(score) {
  if (score >= 75) return 'HIGH RISK';
  if (score >= 50) return 'MODERATE RISK';
  if (score >= 25) return 'LOW RISK';
  return 'MINIMAL RISK';
}

/**
 * Format a DOT amount with commas and the DOT suffix.
 */
export function formatDOT(amount) {
  return new Intl.NumberFormat('en-GB').format(amount) + ' DOT';
}

/**
 * Shorten an address for display (e.g., 5FHne...94ty).
 */
export function shortenAddress(address) {
  if (!address || address.length < 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

// -----------------------------------------------------------------------
// Main Hook
// -----------------------------------------------------------------------

/**
 * useFenrir — React hook for interacting with the FenrirScorer contract.
 *
 * Provides:
 * - proposals: Array of proposal objects with scores and flags
 * - stats: Aggregate statistics (total scored, risk distribution, etc.)
 * - loading: Whether data is currently being fetched
 * - error: Any error that occurred
 * - scoreProposal: Function to trigger scoring of a new proposal
 * - refreshData: Function to manually refresh proposal data
 * - selectedProposal: Currently selected proposal for detail view
 * - selectProposal: Function to select a proposal
 * - clearSelection: Function to clear the selected proposal
 */
export function useFenrir() {
  const [proposals, setProposals] = useState([]);
  const [stats, setStats] = useState({
    totalScored: 0,
    highRisk: 0,
    moderateRisk: 0,
    lowRisk: 0,
    minimalRisk: 0,
    totalDOTFlagged: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [scoring, setScoring] = useState(false);
  const [selectedProposal, setSelectedProposal] = useState(null);
  const [filter, setFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Determine whether we're in demo mode (no contract deployed)
  const isDemoMode = !SCORER_ADDRESS;

  /**
   * Load proposal data — from the contract if available,
   * otherwise from the demo dataset.
   */
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      if (isDemoMode) {
        // Demo mode — use simulated data with a brief delay
        // to simulate network fetching
        await new Promise(resolve => setTimeout(resolve, 800));

        const enrichedProposals = DEMO_PROPOSALS.map(p => ({
          ...p,
          riskLevel: getRiskLevel(p.score),
          activeFlags: decodeFlags(p.flags),
        }));

        setProposals(enrichedProposals);
        computeStats(enrichedProposals);
      } else {
        // Live mode — fetch from contract
        await loadFromContract();
      }
    } catch (err) {
      console.error('Failed to load Fenrir data:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [isDemoMode]);

  /**
   * Fetch data from the deployed FenrirScorer contract.
   * Reads ScorePublished events and enriches with score data.
   */
  const loadFromContract = async () => {
    try {
      // Dynamic import of ethers to avoid issues when not installed
      const { ethers } = await import('ethers');

      const provider = new ethers.JsonRpcProvider(RPC_URL);
      const contract = new ethers.Contract(SCORER_ADDRESS, FENRIR_SCORER_ABI, provider);

      // Fetch total scored count
      const totalScored = await contract.totalScored();

      // Fetch ScorePublished events (last 1000 blocks)
      const currentBlock = await provider.getBlockNumber();
      const fromBlock = Math.max(0, currentBlock - 1000);

      const eventFilter = contract.filters.ScorePublished();
      const events = await contract.queryFilter(eventFilter, fromBlock, currentBlock);

      // Enrich each event with full score data
      const scoredProposals = await Promise.all(
        events.map(async (event) => {
          const { refIndex, proposer, score, flags, requestedDOT } = event.args;

          return {
            refIndex: Number(refIndex),
            proposer,
            score: Number(score),
            flags: Number(flags),
            requestedDOT: Number(ethers.formatEther(requestedDOT)),
            riskLevel: getRiskLevel(Number(score)),
            verdict: getVerdict(Number(score)),
            activeFlags: decodeFlags(Number(flags)),
            scoredAtBlock: event.blockNumber,
            title: `Referendum #${refIndex}`,
            track: 'OpenGov',
          };
        })
      );

      setProposals(scoredProposals.reverse()); // Newest first
      computeStats(scoredProposals);
    } catch (err) {
      console.error('Contract interaction failed:', err);
      throw err;
    }
  };

  /**
   * Compute aggregate statistics from the proposals array.
   */
  const computeStats = (proposalList) => {
    const statsResult = {
      totalScored: proposalList.length,
      highRisk: 0,
      moderateRisk: 0,
      lowRisk: 0,
      minimalRisk: 0,
      totalDOTFlagged: 0,
    };

    proposalList.forEach(p => {
      const level = getRiskLevel(p.score);
      if (level === 'high') {
        statsResult.highRisk++;
        statsResult.totalDOTFlagged += p.requestedDOT;
      } else if (level === 'moderate') {
        statsResult.moderateRisk++;
        statsResult.totalDOTFlagged += p.requestedDOT;
      } else if (level === 'low') {
        statsResult.lowRisk++;
      } else {
        statsResult.minimalRisk++;
      }
    });

    setStats(statsResult);
  };

  /**
   * Score a specific proposal by calling scoreReferendum() on-chain.
   * In demo mode, this simulates the scoring process.
   */
  const scoreProposal = useCallback(async (refIndex) => {
    setScoring(true);
    setError(null);

    try {
      if (isDemoMode) {
        // Demo mode — simulate scoring with a delay
        await new Promise(resolve => setTimeout(resolve, 1500));

        const newScore = Math.floor(Math.random() * 100);
        const newFlags = Math.random() > 0.5 ? 0x03 : 0x04;

        const newProposal = {
          refIndex,
          title: `Referendum #${refIndex}`,
          proposer: '5Demo...' + Math.random().toString(36).slice(2, 6),
          requestedDOT: Math.floor(Math.random() * 50000) + 1000,
          track: 'Medium Spender',
          trackId: 33,
          status: 'ongoing',
          submittedAt: 19850000,
          score: newScore,
          flags: newFlags,
          verdict: getVerdict(newScore),
          riskLevel: getRiskLevel(newScore),
          activeFlags: decodeFlags(newFlags),
          scoredAtBlock: 19850100,
        };

        setProposals(prev => [newProposal, ...prev]);
        computeStats([newProposal, ...proposals]);
      } else {
        // Live mode — call contract
        const { ethers } = await import('ethers');

        if (!window.ethereum) {
          throw new Error('Please connect a Web3 wallet to score proposals');
        }

        const provider = new ethers.BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();
        const contract = new ethers.Contract(SCORER_ADDRESS, FENRIR_SCORER_ABI, signer);

        const tx = await contract.scoreReferendum(refIndex);
        await tx.wait();

        // Refresh data after scoring
        await loadData();
      }
    } catch (err) {
      console.error('Scoring failed:', err);
      setError(err.message);
    } finally {
      setScoring(false);
    }
  }, [isDemoMode, proposals, loadData]);

  /**
   * Select a proposal for the detail view.
   */
  const selectProposal = useCallback((proposal) => {
    setSelectedProposal(proposal);
  }, []);

  /**
   * Clear the selected proposal (return to list view).
   */
  const clearSelection = useCallback(() => {
    setSelectedProposal(null);
  }, []);

  /**
   * Get filtered proposals based on current filter and search.
   */
  const getFilteredProposals = useCallback(() => {
    let filtered = [...proposals];

    // Apply risk level filter
    if (filter !== 'all') {
      filtered = filtered.filter(p => p.riskLevel === filter);
    }

    // Apply search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(p =>
        p.title?.toLowerCase().includes(query) ||
        p.refIndex.toString().includes(query) ||
        p.proposer?.toLowerCase().includes(query)
      );
    }

    return filtered;
  }, [proposals, filter, searchQuery]);

  // Load data on mount
  useEffect(() => {
    loadData();
  }, [loadData]);

  return {
    // Data
    proposals: getFilteredProposals(),
    allProposals: proposals,
    stats,
    selectedProposal,

    // State
    loading,
    error,
    scoring,
    isDemoMode,

    // Filters
    filter,
    setFilter,
    searchQuery,
    setSearchQuery,

    // Actions
    scoreProposal,
    selectProposal,
    clearSelection,
    refreshData: loadData,
  };
}
