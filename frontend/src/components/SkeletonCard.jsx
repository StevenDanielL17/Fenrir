import React from "react";

export default function SkeletonCard() {
  return (
    <div className="skeleton-card" style={{ marginBottom: 12 }}>
      <div className="skeleton" style={{ height: 11, width: "30%", marginBottom: 14 }} />
      <div className="skeleton" style={{ height: 18, width: "75%", marginBottom: 8 }} />
      <div className="skeleton" style={{ height: 13, width: "45%", marginBottom: 14 }} />
      <div className="skeleton" style={{ height: 2,  width: "100%", marginBottom: 14 }} />
      <div style={{ display: "flex", gap: 8 }}>
        <div className="skeleton" style={{ height: 20, width: 90, borderRadius: 3 }} />
        <div className="skeleton" style={{ height: 20, width: 110, borderRadius: 3 }} />
      </div>
    </div>
  );
}
