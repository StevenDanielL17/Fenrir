// ======================================================================
// ProposalCard Component
// ======================================================================
// Displays a single proposal's summary with its risk score,
// flags, and metadata in a card layout. These cards form the
// main feed of the Fenrir dashboard.
//
// Each card features:
//   - Colour-coded left border indicating risk level
//   - Referendum index and title
//   - Requested DOT amount and governance track
//   - Inline score display with verdict
//   - Compact flag breakdown
//   - Action buttons (Details, Vote)
//
// See BASE_INSTRUCTIONS.md Section 6 for the UI specification.
// ======================================================================

import React from 'react';
import ScoreDisplay from './ScoreDisplay';
import FlagBreakdown from './FlagBreakdown';
import { formatDOT, shortenAddress } from '../hooks/useFenrir';

/**
 * ProposalCard — Summary card for a single governance proposal.
 *
 * @param {Object} props
 * @param {Object} props.proposal - The proposal data object.
 * @param {Function} props.onSelect - Callback when the card is clicked for details.
 * @param {number} [props.animationDelay=0] - Staggered animation delay index.
 */
export default function ProposalCard({ proposal, onSelect, animationDelay = 0 }) {
  const {
    refIndex,
    title,
    proposer,
    requestedDOT,
    track,
    score,
    riskLevel,
    activeFlags,
  } = proposal;

  // Determine the animation delay class for staggered entrance
  const delayClass = animationDelay > 0 && animationDelay <= 4
    ? `animate-in-delay-${animationDelay}`
    : '';

  return (
    <div
      className={`proposal-card risk-${riskLevel} animate-in ${delayClass}`}
      role="article"
      aria-label={`Referendum ${refIndex} — ${title}`}
    >
      {/* Card header: ref index + title */}
      <div className="proposal-header">
        <div>
          <span className="proposal-ref">REF #{refIndex}</span>
          <h3 className="proposal-title">{title || `Referendum #${refIndex}`}</h3>

          {/* Metadata row: DOT amount, track, proposer */}
          <div className="proposal-meta">
            <div className="meta-item">
              <span className="meta-label">Requesting</span>
              <span className="meta-value">{formatDOT(requestedDOT)}</span>
            </div>
            <div className="meta-item">
              <span className="meta-label">Track</span>
              <span className="meta-value">{track || 'OpenGov'}</span>
            </div>
            <div className="meta-item">
              <span className="meta-label">Proposer</span>
              <span className="meta-value mono">{shortenAddress(proposer)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Score section: score ring + bar + flags */}
      <div className="proposal-score-section">
        <ScoreDisplay score={score} />

        {/* Score progress bar */}
        <div className="score-bar-container">
          <div className="score-bar">
            <div
              className={`score-bar-fill risk-${riskLevel}`}
              style={{ width: `${score}%` }}
            />
          </div>
        </div>

        {/* Action buttons */}
        <div className="proposal-actions">
          <button
            className="action-btn"
            onClick={() => onSelect && onSelect(proposal)}
            aria-label={`View details for Referendum ${refIndex}`}
          >
            Details
          </button>
          <button
            className="action-btn"
            onClick={() => {
              window.open(
                `https://polkadot.polkassembly.io/referenda/${refIndex}`,
                '_blank'
              );
            }}
            aria-label={`Vote on Referendum ${refIndex}`}
          >
            Vote →
          </button>
        </div>
      </div>

      {/* Flag breakdown */}
      <FlagBreakdown flags={activeFlags} />
    </div>
  );
}
