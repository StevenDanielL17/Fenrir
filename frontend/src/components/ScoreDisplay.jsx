// frontend/src/components/ScoreDisplay.jsx
// Phase 4 per FrontendDesign.md
// SVG ring that animates stroke on mount. GSAP count-up number inside.

import { useEffect, useRef } from "react";
import gsap from "gsap";

function riskColor(score) {
  if (score >= 75) return "#e05252";
  if (score >= 50) return "#d97706";
  if (score >= 25) return "#ca8a04";
  return "#16a34a";
}

export default function ScoreDisplay({ score, verdict }) {
  const numRef = useRef();
  const barRef = useRef();
  const rc = riskColor(score);
  const circumference = 2 * Math.PI * 90;

  useEffect(() => {
    // Count-up animation
    gsap.fromTo(
      { v: 0 },
      {
        v: score,
        duration: 1.2,
        ease: "power3.out",
        onUpdate: function () {
          if (numRef.current)
            numRef.current.textContent = Math.round(this.targets()[0].v);
        },
      },
    );

    // SVG ring fill animation
    gsap.fromTo(
      barRef.current,
      { strokeDasharray: `0 ${circumference}` },
      {
        strokeDasharray: `${(circumference * score) / 100} ${circumference}`,
        duration: 1.2,
        ease: "power3.out",
      },
    );
  }, [score, circumference]);

  return (
    <div style={{ textAlign: "center", padding: "40px 0 32px" }}>
      <div style={{ display: "inline-block", position: "relative" }}>
        <svg width="200" height="200" viewBox="0 0 200 200">
          {/* Track */}
          <circle cx="100" cy="100" r="90"
            fill="none" stroke="#1c2030" strokeWidth="2" />
          {/* Animated fill */}
          <circle
            ref={barRef}
            cx="100" cy="100" r="90"
            fill="none"
            stroke={rc}
            strokeWidth="2"
            strokeDasharray={`0 ${circumference}`}
            strokeLinecap="round"
            transform="rotate(-90 100 100)"
          />
        </svg>

        {/* Score number + verdict inside ring */}
        <div style={{
          position: "absolute", inset: 0,
          display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
        }}>
          <div
            ref={numRef}
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 64, fontWeight: 800,
              color: rc, lineHeight: 1,
            }}
          >
            0
          </div>
          <div style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            color: rc,
            letterSpacing: "0.2em",
            marginTop: 6,
            textTransform: "uppercase",
          }}>
            {verdict}
          </div>
        </div>
      </div>
    </div>
  );
}
