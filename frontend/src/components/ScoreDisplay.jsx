// ======================================================================
// ScoreDisplay Component
// ======================================================================
// Renders the circular risk score gauge with animated fill and
// colour-coded verdict text. Available in two sizes: the compact
// version for proposal cards and the large version for the detail view.
//
// The score ring uses an SVG circle with stroke-dasharray animation
// to create a smooth, premium-feeling gauge effect.
//
// See BASE_INSTRUCTIONS.md Section 6 for the UI specification.
// ======================================================================

import React, { useEffect, useState } from 'react';
import { getRiskLevel, getVerdict } from '../hooks/useFenrir';

/**
 * ScoreDisplay — Animated circular risk score visualisation.
 *
 * @param {Object} props
 * @param {number} props.score - Risk score from 0 to 100.
 * @param {boolean} [props.large=false] - Whether to render the large variant.
 * @param {boolean} [props.showVerdict=true] - Whether to show the verdict text.
 * @param {boolean} [props.showLabel=true] - Whether to show the "RISK SCORE" label.
 */
export default function ScoreDisplay({
  score,
  large = false,
  showVerdict = true,
  showLabel = true,
}) {
  const [animatedOffset, setAnimatedOffset] = useState(0);
  const riskLevel = getRiskLevel(score);
  const verdict = getVerdict(score);

  // SVG circle parameters
  const size = large ? 140 : 72;
  const strokeWidth = large ? 8 : 5;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  // Animate the stroke-dashoffset on mount and when score changes
  useEffect(() => {
    // Brief delay for the entrance animation
    const timer = setTimeout(() => {
      const offset = circumference - (score / 100) * circumference;
      setAnimatedOffset(offset);
    }, 100);

    return () => clearTimeout(timer);
  }, [score, circumference]);

  const containerClass = large ? 'large-score-ring' : 'score-ring';
  const numberClass = large ? 'large-score-number' : 'score-number';

  return (
    <div className="score-display">
      {/* Circular score ring */}
      <div className={containerClass}>
        <svg viewBox={`0 0 ${size} ${size}`}>
          {/* Background circle */}
          <circle
            className="score-ring-bg"
            cx={size / 2}
            cy={size / 2}
            r={radius}
          />
          {/* Animated fill circle */}
          <circle
            className={`score-ring-fill risk-${riskLevel}`}
            cx={size / 2}
            cy={size / 2}
            r={radius}
            strokeDasharray={circumference}
            strokeDashoffset={animatedOffset}
            style={{
              transition: 'stroke-dashoffset 1.2s ease-out, stroke 0.5s ease',
            }}
          />
        </svg>
        {/* Score number in the centre */}
        <span className={`${numberClass} risk-${riskLevel}`}>
          {score}
        </span>
      </div>

      {/* Score information alongside the ring */}
      {(showVerdict || showLabel) && (
        <div className="score-info">
          {showLabel && (
            <span className="score-label">Risk Score</span>
          )}
          {showVerdict && (
            <span className={`score-verdict risk-${riskLevel}`}>
              {verdict}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
