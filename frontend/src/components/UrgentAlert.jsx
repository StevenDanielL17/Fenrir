// ======================================================================
// UrgentAlert — Shown at the very top of the feed.
// Only appears when there is a HIGH RISK proposal closing within 24 hours.
// The user does not need to scroll or search — if something is urgent,
// they see it the moment the page loads.
// ======================================================================

import { useState, useEffect } from "react"

export function UrgentAlert({ scores }) {
  const [urgent, setUrgent] = useState(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (!scores || scores.length === 0) return

    // Find the highest risk proposal that is closing soon
    const highRisk = scores
      .filter(s => s.score >= 75 && s.hoursRemaining != null && s.hoursRemaining <= 24)
      .sort((a, b) => b.score - a.score)[0]

    setUrgent(highRisk || null)
  }, [scores])

  if (!urgent || dismissed) return null

  return (
    <div
      id="urgent-alert"
      style={{
        background: "#1A0E0E",
        border: "1px solid #E05252",
        borderRadius: "8px",
        padding: "14px 18px",
        marginBottom: "20px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "12px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
        {/* Pulsing red dot */}
        <span
          style={{
            display: "inline-block",
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: "#E05252",
            flexShrink: 0,
            animation: "pulse 1.5s ease-in-out infinite",
          }}
        />
        <span style={{ color: "#E05252", fontSize: 12, fontWeight: 700, letterSpacing: "1px" }}>
          URGENT
        </span>
        <span style={{ color: "#8B90A0", fontSize: 13 }}>
          REF #{urgent.refIndex} scores {urgent.score}/100 risk
          {urgent.hoursRemaining != null && ` — closes in ${urgent.hoursRemaining}h`}
        </span>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "16px", flexShrink: 0 }}>
        <button
          id={`urgent-review-${urgent.refIndex}`}
          onClick={() => {
            // Dispatch a custom event that App.jsx listens to for selecting a proposal
            window.dispatchEvent(new CustomEvent("fenrir:select-proposal", { detail: urgent }))
          }}
          style={{
            background: "none",
            border: "none",
            color: "#E05252",
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
            padding: 0,
          }}
        >
          Review now →
        </button>

        {/* Dismiss — optional quality of life */}
        <button
          onClick={() => setDismissed(true)}
          style={{
            background: "none",
            border: "none",
            color: "#4a5060",
            fontSize: 16,
            cursor: "pointer",
            padding: 0,
            lineHeight: 1,
          }}
          aria-label="Dismiss alert"
        >
          ×
        </button>
      </div>
    </div>
  )
}
