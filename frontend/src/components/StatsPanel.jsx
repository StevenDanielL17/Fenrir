// ======================================================================
// StatsPanel Component
// ======================================================================
// Displays aggregate scoring metrics at the top of the dashboard.
// Shows total proposals scored, risk distribution, total DOT flagged,
// and a visual distribution bar with a legend.
//
// This panel gives voters an immediate overview of Fenrir's impact
// on the ecosystem — a key talking point for the hackathon demo.
//
// See BASE_INSTRUCTIONS.md Section 6 for the UI specification.
// ======================================================================

import React from 'react';
import { formatDOT } from '../hooks/useFenrir';

/**
 * StatsPanel — Aggregate scoring metrics dashboard.
 *
 * @param {Object} props
 * @param {Object} props.stats - Statistics object from useFenrir().
 */
export default function StatsPanel({ stats }) {
  const {
    totalScored,
    highRisk,
    moderateRisk,
    lowRisk,
    minimalRisk,
    totalDOTFlagged,
  } = stats;

  // Compute distribution percentages for the visual bar
  const total = totalScored || 1; // Avoid division by zero
  const highPct = (highRisk / total) * 100;
  const moderatePct = (moderateRisk / total) * 100;
  const lowPct = (lowRisk / total) * 100;
  const minimalPct = (minimalRisk / total) * 100;

  return (
    <div className="animate-in">
      {/* Top-level metric cards */}
      <div className="stats-grid">
        {/* Total scored */}
        <div className="stat-card accent-purple animate-in animate-in-delay-1">
          <div className="stat-label">Total Scored</div>
          <div className="stat-value highlight-purple">{totalScored}</div>
          <div className="stat-subtitle">proposals analysed</div>
        </div>

        {/* High risk count */}
        <div className="stat-card accent-red animate-in animate-in-delay-2">
          <div className="stat-label">High Risk</div>
          <div className="stat-value highlight-red">{highRisk}</div>
          <div className="stat-subtitle">
            {totalScored > 0
              ? `${((highRisk / totalScored) * 100).toFixed(0)}% of total`
              : 'no proposals yet'}
          </div>
        </div>

        {/* DOT flagged */}
        <div className="stat-card accent-amber animate-in animate-in-delay-3">
          <div className="stat-label">DOT Flagged</div>
          <div className="stat-value highlight-amber">
            {totalDOTFlagged >= 1000
              ? `${(totalDOTFlagged / 1000).toFixed(0)}K`
              : totalDOTFlagged.toLocaleString('en-GB')}
          </div>
          <div className="stat-subtitle">{formatDOT(totalDOTFlagged)} total</div>
        </div>

        {/* Clean proposals */}
        <div className="stat-card accent-green animate-in animate-in-delay-4">
          <div className="stat-label">Clean Proposals</div>
          <div className="stat-value highlight-green">{minimalRisk + lowRisk}</div>
          <div className="stat-subtitle">
            {totalScored > 0
              ? `${(((minimalRisk + lowRisk) / totalScored) * 100).toFixed(0)}% passed cleanly`
              : 'no proposals yet'}
          </div>
        </div>
      </div>

      {/* Risk distribution bar */}
      <div className="stat-card animate-in animate-in-delay-2" style={{ marginBottom: 'var(--space-xl)' }}>
        <div className="stat-label">Risk Distribution</div>

        <div className="distribution-bar">
          {highPct > 0 && (
            <div
              className="distribution-segment high"
              style={{ width: `${highPct}%` }}
              title={`High Risk: ${highRisk} (${highPct.toFixed(0)}%)`}
            />
          )}
          {moderatePct > 0 && (
            <div
              className="distribution-segment moderate"
              style={{ width: `${moderatePct}%` }}
              title={`Moderate Risk: ${moderateRisk} (${moderatePct.toFixed(0)}%)`}
            />
          )}
          {lowPct > 0 && (
            <div
              className="distribution-segment low"
              style={{ width: `${lowPct}%` }}
              title={`Low Risk: ${lowRisk} (${lowPct.toFixed(0)}%)`}
            />
          )}
          {minimalPct > 0 && (
            <div
              className="distribution-segment minimal"
              style={{ width: `${minimalPct}%` }}
              title={`Minimal Risk: ${minimalRisk} (${minimalPct.toFixed(0)}%)`}
            />
          )}
        </div>

        {/* Legend */}
        <div className="distribution-legend">
          <div className="legend-item">
            <span className="legend-dot high" />
            High ({highRisk})
          </div>
          <div className="legend-item">
            <span className="legend-dot moderate" />
            Moderate ({moderateRisk})
          </div>
          <div className="legend-item">
            <span className="legend-dot low" />
            Low ({lowRisk})
          </div>
          <div className="legend-item">
            <span className="legend-dot minimal" />
            Minimal ({minimalRisk})
          </div>
        </div>
      </div>
    </div>
  );
}
