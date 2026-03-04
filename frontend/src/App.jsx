// ======================================================================
// Fenrir Dashboard — Main Application
// Three views: Feed, Detail, Stats. That's the whole product.
// Follows Design.md §9: No dark/light toggle, no hero section,
// no onboarding modal, no social sharing.
// ======================================================================

import React, { useState } from "react";
import { useFenrir } from "./hooks/useFenrir";
import { getRiskLevel, FLAGS } from "./constants/contracts";
import ProposalCard from "./components/ProposalCard";
import ScoreDisplay from "./components/ScoreDisplay";
import FlagBreakdown from "./components/FlagBreakdown";
import SkeletonCard from "./components/SkeletonCard";
import StatsBanner from "./components/StatsBanner";

export default function App() {
  const {
    stats, scores, loading, error, isDemoMode,
    selected, filter, search,
    setFilter, setSearch, setSelected,
    scoreProposal, retry,
  } = useFenrir();

  const [view, setView] = useState("feed");
  const [scoreInput, setScoreInput] = useState("");
  const [scoring, setScoring] = useState(false);
  const [scoreDone, setScoredDone] = useState(false);

  // Handle scoring
  const handleScore = async (refIndex) => {
    const idx = refIndex || parseInt(scoreInput, 10);
    if (isNaN(idx) || idx <= 0) return;
    setScoring(true);
    setScoredDone(false);
    try {
      await scoreProposal(idx);
      setScoredDone(true);
      setScoreInput("");
      setTimeout(() => setScoredDone(false), 2000);
    } catch (e) {
      alert(e.message || "Scoring failed");
    } finally {
      setScoring(false);
    }
  };

  // DOT protected = sum of requestedDOT for high risk proposals
  const dotProtected = scores
    .filter(p => p.score >= 75)
    .reduce((sum, p) => sum + Number(p.requestedDOT || 0), 0);

  // -----------------------------------------------------------------------
  // Detail View
  // -----------------------------------------------------------------------
  if (selected) {
    return (
      <div>
        <Header view={view} setView={setView} isDemoMode={isDemoMode} />
        <div className="main">
          <div className="detail-view">
            <button className="back-btn" onClick={() => setSelected(null)}>
              ← Back to proposals
            </button>
            <div className="detail-ref">REF #{selected.refIndex}</div>
            <h1 className="detail-title">Referendum #{selected.refIndex}</h1>

            <div className="detail-section">
              <ScoreDisplay score={selected.score} />
            </div>

            <div className="detail-section">
              <FlagBreakdown flags={selected.flags} />
            </div>

            <div className="detail-section">
              <div className="detail-grid">
                <div>
                  <div className="detail-field-label">Requested</div>
                  <div className="detail-field-value">
                    {Number(selected.requestedDOT).toLocaleString("en-GB")} DOT
                  </div>
                </div>
                <div>
                  <div className="detail-field-label">Verdict</div>
                  <div className="detail-field-value">{selected.verdict}</div>
                </div>
              </div>
            </div>

            <button
              className={`score-btn ${scoreDone ? "done" : ""}`}
              disabled={scoring || scoreDone}
              onClick={() => handleScore(selected.refIndex)}
            >
              {scoreDone ? "Scored ✓" : scoring ? "Scoring..." : "Score this proposal"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // Main View (Feed + Sidebar)
  // -----------------------------------------------------------------------
  return (
    <div>
      <Header view={view} setView={setView} isDemoMode={isDemoMode} />

      <StatsBanner stats={stats} dotProtected={dotProtected} />

      <div className="main">
        {error && (
          <div className="error-state">
            {error}
            <button onClick={retry}>Retry</button>
          </div>
        )}

        <div className="layout">
          {/* Left column — Feed */}
          <div>
            {/* Filter bar */}
            <div className="filter-bar">
              {["all", "high", "moderate", "low", "minimal"].map(f => (
                <button
                  key={f}
                  className={`filter-btn ${filter === f ? "active" : ""}`}
                  onClick={() => setFilter(f)}
                >
                  {f === "all" ? "All" :
                   f === "high" ? "High Risk" :
                   f === "moderate" ? "Moderate" :
                   f === "low" ? "Low Risk" : "Minimal"}
                </button>
              ))}
              <input
                type="text"
                className="search-input"
                placeholder="Ref #..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                id="search-input"
              />
            </div>

            {/* Score input */}
            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              <input
                type="number"
                className="search-input"
                placeholder="Ref # to score"
                value={scoreInput}
                onChange={e => setScoreInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleScore()}
                style={{ width: 140, marginLeft: 0 }}
                min="1"
                id="score-ref-input"
              />
              <button
                className={`score-btn ${scoreDone ? "done" : ""}`}
                disabled={scoring || !scoreInput}
                onClick={() => handleScore()}
                id="score-btn"
              >
                {scoreDone ? "Scored ✓" : scoring ? "Scoring..." : "Score this proposal"}
              </button>
            </div>

            {/* Feed */}
            {loading ? (
              <>
                <SkeletonCard />
                <SkeletonCard />
                <SkeletonCard />
                <SkeletonCard />
                <SkeletonCard />
              </>
            ) : scores.length === 0 ? (
              <div className="empty-state">
                <div className="wolf">🐺</div>
                <p>
                  {filter !== "all" || search
                    ? "No proposals match your filter."
                    : "No proposals scored yet."}
                </p>
                <p style={{ marginTop: 8, fontSize: 13 }}>
                  Fenrir is watching. Be the first to score a proposal.
                </p>
                <a href="https://polkassembly.io" target="_blank" rel="noopener noreferrer">
                  Browse OpenGov →
                </a>
              </div>
            ) : (
              scores.map(p => (
                <ProposalCard
                  key={p.refIndex}
                  proposal={p}
                  onSelect={setSelected}
                />
              ))
            )}
          </div>

          {/* Right column — Sidebar Stats */}
          <div className="sidebar-stats">
            <div className="stat-card">
              <div className="stat-card-label">Total Scored</div>
              <div className="stat-card-value">{stats.total}</div>
              <div className="stat-card-sub">proposals analysed</div>
            </div>
            <div className="stat-card">
              <div className="stat-card-label">High Risk Found</div>
              <div className="stat-card-value" style={{ color: "var(--risk-high)" }}>
                {stats.highRisk}
              </div>
              <div className="stat-card-sub">
                {stats.total > 0
                  ? `${((stats.highRisk / stats.total) * 100).toFixed(0)}% of total`
                  : "—"}
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-card-label">DOT Protected</div>
              <div className="stat-card-value">
                {dotProtected >= 1000
                  ? `${(dotProtected / 1000).toFixed(0)}K`
                  : dotProtected.toLocaleString("en-GB")}
              </div>
              <div className="stat-card-sub">flagged high-risk spend</div>
            </div>
            <div className="stat-card">
              <div className="stat-card-label">Mode</div>
              <div className="stat-card-value" style={{ fontSize: 18 }}>
                {isDemoMode ? "Demo" : "Live"}
              </div>
              <div className="stat-card-sub">
                {isDemoMode ? "Set VITE_SCORER_ADDRESS for live" : "Reading from chain"}
              </div>
            </div>
          </div>
        </div>
      </div>

      <footer style={{
        textAlign: "center",
        padding: "24px",
        fontSize: 12,
        color: "var(--text-muted)"
      }}>
        🐺 Fenrir — Polkadot Solidity Hackathon 2026 — Track 2: PVM Smart Contracts
      </footer>
    </div>
  );
}

// -----------------------------------------------------------------------
// Header
// -----------------------------------------------------------------------
function Header({ view, setView, isDemoMode }) {
  return (
    <header className="header">
      <div className="header-brand">
        <span className="wolf">🐺</span>
        <span className="name">fenrir</span>
      </div>
      <div className="header-nav">
        <button
          className={view === "feed" ? "active" : ""}
          onClick={() => setView("feed")}
        >
          Proposals
        </button>
        <button
          className={view === "stats" ? "active" : ""}
          onClick={() => setView("stats")}
        >
          Stats
        </button>
      </div>
      {isDemoMode && (
        <span style={{
          fontSize: 11, color: "var(--text-muted)",
          fontFamily: "var(--font-mono)", letterSpacing: 1,
        }}>
          DEMO MODE
        </span>
      )}
    </header>
  );
}
