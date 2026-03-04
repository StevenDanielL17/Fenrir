import React from "react";

/**
 * StatsBanner — Single-line stats strip at the top of the proposals page.
 * Shows: total scored, high risk count, DOT protected.
 * Follows Design.md §4.5.
 */
export default function StatsBanner({ stats, dotProtected }) {
  return (
    <div className="stats-banner" id="stats-banner">
      <strong>{stats.total}</strong> proposals scored · {" "}
      <strong>{stats.highRisk}</strong> high risk · {" "}
      <strong>{dotProtected.toLocaleString("en-GB")}</strong> DOT protected
    </div>
  );
}
