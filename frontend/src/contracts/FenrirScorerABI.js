// ======================================================================
// FenrirScorer Contract ABI
// ======================================================================
// This is a minimal ABI containing only the functions the frontend
// needs to interact with. It is derived from the FenrirScorer.sol
// contract specification in BASE_INSTRUCTIONS.md Section 4.1.

export const FENRIR_SCORER_ABI = [
  // --- Core Scoring ---
  {
    name: 'scoreReferendum',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'refIndex', type: 'uint32' }],
    outputs: [{ name: 'score', type: 'uint8' }],
  },

  // --- Read Functions ---
  {
    name: 'getScore',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'refIndex', type: 'uint32' }],
    outputs: [
      { name: 'score', type: 'uint8' },
      { name: 'verdict', type: 'string' },
      { name: 'activeFlags', type: 'string[]' },
    ],
  },
  {
    name: 'getRawScore',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'refIndex', type: 'uint32' }],
    outputs: [
      { name: 'score', type: 'uint8' },
      { name: 'flags', type: 'uint8' },
      { name: 'scoredAtBlock', type: 'uint256' },
    ],
  },
  {
    name: 'isScored',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'refIndex', type: 'uint32' }],
    outputs: [{ name: 'exists', type: 'bool' }],
  },
  {
    name: 'scores',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: '', type: 'uint32' }],
    outputs: [
      { name: 'score', type: 'uint8' },
      { name: 'flags', type: 'uint8' },
      { name: 'scoredAtBlock', type: 'uint256' },
      { name: 'exists', type: 'bool' },
    ],
  },
  {
    name: 'totalScored',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'baselineAvgDOT',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },

  // --- Events ---
  {
    name: 'ScorePublished',
    type: 'event',
    inputs: [
      { name: 'refIndex', type: 'uint32', indexed: true },
      { name: 'proposer', type: 'address', indexed: true },
      { name: 'score', type: 'uint8', indexed: false },
      { name: 'flags', type: 'uint8', indexed: false },
      { name: 'requestedDOT', type: 'uint256', indexed: false },
    ],
  },
];
