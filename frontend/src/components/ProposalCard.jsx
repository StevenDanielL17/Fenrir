// frontend/src/components/ProposalCard.jsx
// Phase 3 per FrontendDesign.md
// Left risk accent bar. Hover lift. Thin score bar. Editorial typography.

import React from "react";
import { generateSummary } from "../utils/generateSummary";

const ECOSYSTEM_AVG_DOT = 25000;

function riskColor(score) {
  if (score >= 75) return "#e05252";
  if (score >= 50) return "#d97706";
  if (score >= 25) return "#ca8a04";
  return "#16a34a";
}

const FLAG_LABELS = {
  newWallet:    "New wallet",
  largeRequest: "Oversized request",
  noHistory:    "No proposal history",
  lowApproval:  "Low approval rate",
  burst:        "Rapid submissions",
};

export default function ProposalCard({ proposal, onSelect }) {
  const { refIndex, score, verdict, requestedDOT, flags, hoursRemaining, isClosingSoon, title } = proposal;
  const rc = riskColor(score);

  const activeFlags = Object.entries(flags || {})
    .filter(([, v]) => v)
    .map(([k]) => FLAG_LABELS[k])
    .filter(Boolean);

  const dotFormatted = Number(requestedDOT).toLocaleString("en-GB");
  const summary = generateSummary(score, flags, requestedDOT, ECOSYSTEM_AVG_DOT);

  return (
    <article
      className="proposal-card"
      id={`card-${refIndex}`}
      onClick={() => onSelect(proposal)}
      style={{ borderColor: "#1c2030" }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = rc + "40";
        e.currentTarget.style.transform = "translateY(-2px)";
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = "#1c2030";
        e.currentTarget.style.transform = "translateY(0)";
      }}
    >
      {/* Left risk accent line */}
      <div className="card-risk-bar" style={{ background: rc }} />

      {/* Top row: ref + closing badge | verdict */}
      <div className="card-top-row">
        <div className="card-meta-row">
          <span className="card-ref">REF #{refIndex}</span>
          {isClosingSoon && hoursRemaining != null && (
            <span className="card-closing-badge">{hoursRemaining}h left</span>
          )}
        </div>
        <span className="card-verdict" style={{ color: rc }}>{verdict}</span>
      </div>

      {/* Title */}
      <h3 className="card-title">{title || `Referendum #${refIndex}`}</h3>

      {/* DOT */}
      <div className="card-dot">{dotFormatted} DOT</div>

      {/* One-line summary */}
      <p className="card-summary">{summary}</p>

      {/* Thin score bar */}
      <div className="card-score-bar-track">
        <div className="card-score-bar-fill" style={{ width: `${score}%`, background: rc }} />
      </div>

      {/* Flags */}
      {activeFlags.length > 0 && (
        <div className="card-flags">
          {activeFlags.map(f => (
            <span
              key={f}
              className="flag-chip"
              style={{
                color: rc,
                background: rc + "18",
                borderColor: rc + "28",
              }}
            >
              {f}
            </span>
          ))}
        </div>
      )}

      <div className="card-footer">
        <span className="details-link">Details →</span>
      </div>
    </article>
  );
}
