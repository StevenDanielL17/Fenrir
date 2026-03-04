import React from "react";
import { FLAGS, getRiskLevel } from "../constants/contracts";

/**
 * FlagBreakdown — Shows ALL 5 flags, triggered and non-triggered.
 * Triggered flags use risk-appropriate colour.
 * Non-triggered flags use minimal green as reassurances.
 * Follows Design.md §4.4 exactly.
 */
export default function FlagBreakdown({ flags }) {
  const allFlags = [
    { key: "NEW_WALLET",    active: flags.newWallet },
    { key: "LARGE_REQUEST", active: flags.largeRequest },
    { key: "NO_HISTORY",    active: flags.noHistory },
    { key: "LOW_APPROVAL",  active: flags.lowApproval },
    { key: "BURST",         active: flags.burst },
  ];

  return (
    <div>
      <div className="flag-section-label">Why This Score</div>
      {allFlags.map(({ key, active }) => {
        const def = FLAGS[key];
        return (
          <div className="flag-item" key={key}>
            <span className="flag-icon">
              {active ? "🔴" : "🟢"}
            </span>
            <div>
              <div className="flag-label" style={{
                color: active ? "var(--risk-high)" : "var(--risk-minimal)"
              }}>
                {active ? def.label : `${def.label} — clear`}
              </div>
              <div className="flag-desc">
                {active
                  ? def.desc
                  : `This flag did not trigger. ${def.label} is within acceptable range.`}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
