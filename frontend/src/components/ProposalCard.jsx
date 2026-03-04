import React from "react";
import { FLAGS, getRiskLevel } from "../constants/contracts";

/**
 * ProposalCard — Summary card for the feed.
 * Shows: ref index, score bar + risk label (top right), active flags only.
 * Follows Design.md §4.2 exactly.
 */
export default function ProposalCard({ proposal, onSelect }) {
  const { refIndex, score, verdict, requestedDOT, flags } = proposal;
  const level = getRiskLevel(score).toLowerCase();

  // Only show flags that are TRUE
  const activeFlags = Object.entries(FLAGS)
    .filter(([key]) => {
      const map = { NEW_WALLET: "newWallet", LARGE_REQUEST: "largeRequest", NO_HISTORY: "noHistory", LOW_APPROVAL: "lowApproval", BURST: "burst" };
      return flags[map[key]];
    })
    .map(([, def]) => def);

  const dotFormatted = Number(requestedDOT).toLocaleString("en-GB");

  return (
    <div className="proposal-card" onClick={() => onSelect(proposal)} id={`card-${refIndex}`}>
      <div className="card-top">
        <div>
          <div className="card-ref">REF #{refIndex}</div>
          <div className="card-title">Referendum #{refIndex}</div>
          <div className="card-meta">
            <span>{dotFormatted} DOT</span>
          </div>
        </div>
        <div className="card-score">
          <div className={`card-score-label ${level}`}>{verdict}</div>
          <div className="score-bar">
            <div className={`score-bar-fill ${level}`} style={{ width: `${score}%` }} />
          </div>
        </div>
      </div>

      {activeFlags.length > 0 && (
        <div className="card-flags">
          {activeFlags.map(f => (
            <span className={`flag-chip ${level}`} key={f.label}>⚑ {f.label}</span>
          ))}
        </div>
      )}

      <div className="card-actions">
        <span className="details-link">Details →</span>
      </div>
    </div>
  );
}
