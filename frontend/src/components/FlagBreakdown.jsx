// ======================================================================
// FlagBreakdown Component
// ======================================================================
// Renders the explainability flags — the core value proposition of
// Fenrir. Each flag shows *why* a proposal received its score,
// providing transparency for governance voters.
//
// Available in two modes:
//   - Compact: small pill-shaped tags for proposal cards
//   - Detailed: full descriptions for the proposal detail view
//
// See BASE_INSTRUCTIONS.md Section 6 for the UI specification.
// ======================================================================

import React from 'react';

/**
 * FlagBreakdown — Displays risk flags with severity indicators.
 *
 * @param {Object} props
 * @param {Array} props.flags - Array of flag objects from decodeFlags().
 * @param {boolean} [props.detailed=false] - Whether to show detailed descriptions.
 */
export default function FlagBreakdown({ flags, detailed = false }) {
  // If there are no active flags, show a positive indicator
  if (!flags || flags.length === 0) {
    if (detailed) {
      return (
        <div className="flag-detail-list">
          <div className="flag-detail-item">
            <div className="flag-detail-indicator low" />
            <div className="flag-detail-text">
              <strong>No risk flags detected</strong>
              <br />
              This proposal passed all risk checks without triggering any flags.
              The proposer has an established track record and the request
              is within normal parameters.
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="flag-breakdown">
        <span className="flag-tag severity-low">
          <span className="flag-icon">✓</span>
          Clean — no flags
        </span>
      </div>
    );
  }

  // Detailed mode — full descriptions with severity indicators
  if (detailed) {
    return (
      <div className="flag-detail-list">
        {flags.map((flag) => (
          <div key={flag.bit} className="flag-detail-item animate-in">
            <div className={`flag-detail-indicator ${flag.severity}`} />
            <div className="flag-detail-text">
              <strong>{flag.icon} {flag.label}</strong>
              <br />
              {flag.description}
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Compact mode — small pill-shaped tags
  return (
    <div className="flag-breakdown">
      {flags.map((flag) => (
        <span
          key={flag.bit}
          className={`flag-tag severity-${flag.severity}`}
          title={flag.description}
        >
          <span className="flag-icon">{flag.icon}</span>
          {flag.label}
        </span>
      ))}
    </div>
  );
}
