import React from "react";

/**
 * SkeletonCard — Shimmer loading placeholder.
 * Shown during initial data fetch instead of a spinner.
 * Follows Design.md §5.1.
 */
export default function SkeletonCard() {
  return (
    <div className="skeleton-card">
      <div className="skeleton-line wide" />
      <div className="skeleton-line medium" />
      <div className="skeleton-line short" />
      <div className="skeleton-line bar" />
    </div>
  );
}
