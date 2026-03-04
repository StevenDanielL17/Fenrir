import React, { useState, useRef, useEffect } from "react";
import { getRiskLevel, RISK_LEVELS } from "../constants/contracts";

/**
 * ScoreDisplay — Large score number + progress bar for detail page.
 * Number counts up from 0 to final value over 600ms on mount.
 */
export default function ScoreDisplay({ score }) {
  const [displayed, setDisplayed] = useState(0);
  const level = getRiskLevel(score);
  const cls = level.toLowerCase();
  const label = RISK_LEVELS[level].label;

  useEffect(() => {
    let frame;
    const start = performance.now();
    const duration = 600;
    const animate = (now) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // Ease-out: fast at start, slow at end
      const eased = 1 - (1 - progress) * (1 - progress);
      setDisplayed(Math.round(eased * score));
      if (progress < 1) frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [score]);

  return (
    <div className="score-display">
      <div className={`score-number ${cls}`}>{displayed}</div>
      <div className={`score-verdict ${cls}`}>{label}</div>
      <div className="score-progress">
        <div
          className={`score-progress-fill ${cls}`}
          style={{ width: `${score}%` }}
        />
      </div>
      <div className="score-fraction">{score}/100</div>
    </div>
  );
}
