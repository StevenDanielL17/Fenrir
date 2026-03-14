// ======================================================================
// Fenrir Dashboard — Main Application
// "Intelligence Terminal" redesign per FrontendDesign.md
// ======================================================================

import React, { useState, useEffect } from "react";
import { useFenrir } from "./hooks/useFenrir";
import ProposalCard from "./components/ProposalCard";
import ScoreDisplay from "./components/ScoreDisplay";
import FlagBreakdown from "./components/FlagBreakdown";
import SkeletonCard from "./components/SkeletonCard";
import StatsBanner from "./components/StatsBanner";
import { UrgentAlert } from "./components/UrgentAlert";
import { Preloader } from "./components/Preloader";
import { Hero } from "./components/Hero";
import fenrirLogo from "./assets/fenrir_logo.png";

export default function App() {
  const {
    stats, scores, loading, error, isDemoMode,
    selected, filter, search,
    setFilter, setSearch, setSelected,
    scoreProposal, isScored, retry,
  } = useFenrir();

  const [preloaderDone, setPreloaderDone] = useState(false);
  const [view, setView] = useState("feed");
  const [scoreInput, setScoreInput] = useState("");
  const [scoring, setScoring] = useState(false);
  const [scoreDone, setScoredDone] = useState(false);
  const [scoreError, setScoreError] = useState("");

  // Listen for the urgent-alert "Review now" click to open detail view
  useEffect(() => {
    const handler = (e) => setSelected(e.detail);
    window.addEventListener("fenrir:select-proposal", handler);
    return () => window.removeEventListener("fenrir:select-proposal", handler);
  }, [setSelected]);

  // Handle scoring
  const handleScore = async (refIndex) => {
    const idx = refIndex || parseInt(scoreInput, 10);
    if (isNaN(idx) || idx <= 0) return;
    setScoring(true);
    setScoredDone(false);
    setScoreError("");
    try {
      const result = await scoreProposal(idx);
      if (result?.alreadyScored) {
        setScoreError("REF #" + idx + " is already scored.");
        setTimeout(() => setScoreError(""), 3000);
      } else {
        setScoredDone(true);
        setScoreInput("");
        setTimeout(() => setScoredDone(false), 2000);
      }
    } catch (e) {
      setScoreError(e.message || "Scoring failed");
      setTimeout(() => setScoreError(""), 4000);
    } finally {
      setScoring(false);
    }
  };

  // DOT protected = sum of requestedDOT for high risk proposals
  const dotProtected = scores
    .filter(p => p.score >= 75)
    .reduce((sum, p) => sum + Number(p.requestedDOT || 0), 0);

  // -----------------------------------------------------------------------
  // Preloader — blocks render for 2.2s on first visit
  // -----------------------------------------------------------------------
  if (!preloaderDone) {
    return <Preloader onComplete={() => setPreloaderDone(true)} />;
  }

  // -----------------------------------------------------------------------
  // Detail View
  // -----------------------------------------------------------------------
  if (selected) {
    return (
      <div>
        <Nav view={view} setView={setView} setSelected={setSelected} isDemoMode={isDemoMode} />
        <StatsBanner stats={stats} dotProtected={dotProtected} />
        <div className="main" style={{ gridTemplateColumns: "1fr" }}>
          <div className="detail-view">
            <button className="back-btn" onClick={() => { setSelected(null); setView("feed"); }}>
              ← Back to proposals
            </button>
            <div className="detail-ref">REF #{selected.refIndex}</div>
            <h1 className="detail-title">
              {selected.title || `Referendum #${selected.refIndex}`}
            </h1>

            <div className="detail-section">
              <ScoreDisplay score={selected.score} verdict={selected.verdict} />
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
                {selected.hoursRemaining != null && (
                  <div>
                    <div className="detail-field-label">Time Remaining</div>
                    <div className="detail-field-value"
                      style={selected.isClosingSoon ? { color: "var(--risk-high)" } : {}}
                    >
                      {selected.hoursRemaining}h
                    </div>
                  </div>
                )}
              </div>
            </div>

            <button
              className={`score-btn ${scoreDone ? "done" : ""}`}
              disabled={scoring || scoreDone || isScored(selected.refIndex)}
              onClick={() => handleScore(selected.refIndex)}
            >
              {isScored(selected.refIndex)
                ? "Already scored"
                : scoreDone ? "Scored ✓"
                : scoring ? "Scoring..."
                : "Score this proposal"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // Stats Story View
  // -----------------------------------------------------------------------
  if (view === "stats") {
    const totalDOT = scores.reduce((sum, p) => sum + Number(p.requestedDOT || 0), 0);
    const highRiskDOT = scores.filter(p => p.score >= 75).reduce((sum, p) => sum + Number(p.requestedDOT || 0), 0);
    const highRiskCount = stats.highRisk;
    const totalCount = stats.total;

    const fmtDOT = (n) => {
      if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
      if (n >= 1_000)     return `${(n / 1_000).toFixed(0)}K`;
      return n.toLocaleString("en-GB");
    };

    const narrative = totalCount === 0
      ? "Fenrir has not scored any proposals yet. Once the auto-scorer is running, this page will tell the story."
      : `Fenrir has reviewed ${totalCount} proposal${totalCount !== 1 ? "s" : ""} worth ${fmtDOT(totalDOT)} DOT in treasury requests. ${highRiskCount} ${highRiskCount !== 1 ? "were" : "was"} flagged HIGH RISK — representing ${fmtDOT(highRiskDOT)} DOT in questionable spending.`;

    return (
      <div>
        <Nav view={view} setView={setView} setSelected={setSelected} isDemoMode={isDemoMode} />
        <StatsBanner stats={stats} dotProtected={dotProtected} />
        <div className="main" style={{ gridTemplateColumns: "1fr", maxWidth: 900 }}>
          {/* Narrative paragraph */}
          <div style={{
            background: "var(--bg-surface)",
            border: "1px solid var(--bg-border)",
            borderRadius: 10,
            padding: "48px 56px",
            marginBottom: 28,
            textAlign: "center",
          }}>
            <p style={{
              fontFamily: "var(--font-display)",
              fontSize: "clamp(18px, 2.5vw, 24px)",
              fontWeight: 600,
              color: "var(--text-primary)",
              lineHeight: 1.6,
              maxWidth: 680,
              margin: "0 auto",
            }}>
              {narrative}
            </p>
            {totalCount > 0 && highRiskCount > 0 && (
              <p style={{
                fontFamily: "var(--font-mono)",
                fontSize: 12,
                color: "var(--text-muted)",
                marginTop: 20,
                letterSpacing: "0.04em",
              }}>
                {Math.round((highRiskCount / totalCount) * 100)}% of all proposals scored exceeded the HIGH RISK threshold.
              </p>
            )}
          </div>

          {/* Stat cards */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: 14,
          }}>
            {[
              { label: "Total Reviewed", value: totalCount, sub: "proposals scored by Fenrir" },
              { label: "High Risk Flagged", value: highRiskCount, sub: totalCount > 0 ? `${Math.round((highRiskCount / totalCount) * 100)}% of total` : "—", color: "var(--risk-high)" },
              { label: "Treasury Reviewed", value: `${fmtDOT(totalDOT)} DOT`, sub: "total treasury requests analysed" },
              { label: "Questionable Spend", value: `${fmtDOT(highRiskDOT)} DOT`, sub: "in high-risk proposals", color: "var(--risk-high)" },
            ].map(({ label, value, sub, color }) => (
              <div className="stat-card" key={label}>
                <div className="stat-card-label">{label}</div>
                <div className="stat-card-value" style={color ? { color } : {}}>{value}</div>
                <div className="stat-card-sub">{sub}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // Main View — Hero + Feed + Sidebar
  // -----------------------------------------------------------------------
  return (
    <div>
      <Nav view={view} setView={setView} setSelected={setSelected} isDemoMode={isDemoMode} />

      {/* Cinematic hero — full viewport, GSAP stagger */}
      <Hero stats={stats} dotProtected={dotProtected} />

      <StatsBanner stats={stats} dotProtected={dotProtected} />

      <div className="main">

        {/* Left column — Feed */}
        <div>
          {error && (
            <div className="error-state">
              {error}
              <button onClick={retry}>Retry</button>
            </div>
          )}

          {/* Urgent alert */}
          <UrgentAlert scores={scores} />

          {/* Filter + search bar */}
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
              style={{ marginLeft: "auto" }}
            />
          </div>

          {/* Score input — live already-scored detection */}
          <div style={{ marginBottom: 20 }}>
            {(() => {
              const parsedRef = parseInt(scoreInput, 10);
              const alreadyScored = scoreInput && !isNaN(parsedRef) && isScored(parsedRef);
              return (
                <>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input
                      type="number"
                      className="search-input"
                      placeholder="Enter ref # to score"
                      value={scoreInput}
                      onChange={e => { setScoreInput(e.target.value); setScoreError(""); }}
                      onKeyDown={e => e.key === "Enter" && !alreadyScored && handleScore()}
                      style={{
                        width: 170, marginLeft: 0,
                        borderColor: alreadyScored ? "var(--risk-minimal)" : undefined,
                      }}
                      min="1"
                      id="score-ref-input"
                    />
                    <button
                      className={`score-btn ${scoreDone ? "done" : ""}`}
                      disabled={scoring || !scoreInput || alreadyScored}
                      onClick={() => handleScore()}
                      id="score-btn"
                      style={alreadyScored ? { opacity: 0.5, cursor: "not-allowed" } : undefined}
                      title={!scoreInput ? "Type a referendum number first" : alreadyScored ? `REF #${parsedRef} is already scored` : ""}
                    >
                      {alreadyScored ? "Already scored" : scoreDone ? "Scored ✓" : scoring ? "Scoring..." : "Score"}
                    </button>
                  </div>
                  {!scoreInput && (
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", marginTop: 6, letterSpacing: "0.04em" }}>
                      Type a referendum number, then click Score
                    </div>
                  )}
                  {alreadyScored && (
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--risk-minimal)", marginTop: 6, letterSpacing: "0.04em" }}>
                      ✓ REF #{parsedRef} has already been scored
                    </div>
                  )}
                  {scoreError && !alreadyScored && (
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--risk-high)", marginTop: 6 }}>
                      {scoreError}
                    </div>
                  )}
                </>
              );
            })()}
          </div>

          {/* Feed */}
          {loading ? (
            <>
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </>
          ) : scores.length === 0 ? (
            <div className="empty-state">
              <img src={fenrirLogo} alt="Fenrir Logo" style={{ width: 140, height: 140, marginBottom: 20, borderRadius: "50%", opacity: 0.9, filter: "drop-shadow(0 0 20px rgba(14, 165, 233, 0.4))" }} />
              <p>
                {filter !== "all" || search
                  ? "No proposals match your filter."
                  : "No proposals scored yet."}
              </p>
              <p style={{ marginTop: 8, fontSize: 12, color: "var(--text-muted)" }}>
                Fenrir is watching. Be the first to score a proposal.
              </p>
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

        {/* Right column — Sidebar */}
        <div className="sidebar">
          {[
            { label: "Total Scored",    value: stats.total,    sub: "proposals analysed" },
            { label: "High Risk Found", value: stats.highRisk, sub: stats.total > 0 ? `${((stats.highRisk / stats.total) * 100).toFixed(0)}% of total` : "—", color: "var(--risk-high)" },
            {
              label: "DOT Protected",
              value: dotProtected >= 1000 ? `${(dotProtected / 1000).toFixed(0)}K` : dotProtected.toLocaleString("en-GB"),
              sub: "flagged high-risk spend",
            },
            {
              label: "Mode",
              value: isDemoMode ? "Demo" : "Live",
              sub: isDemoMode ? "Set VITE_SCORER_ADDRESS for live" : "Reading from chain",
              valueSize: 20,
            },
          ].map(({ label, value, sub, color, valueSize }) => (
            <div className="stat-card" key={label}>
              <div className="stat-card-label">{label}</div>
              <div className="stat-card-value" style={{ ...(color ? { color } : {}), ...(valueSize ? { fontSize: valueSize } : {}) }}>{value}</div>
              <div className="stat-card-sub">{sub}</div>
            </div>
          ))}
        </div>
      </div>

      <footer style={{
        textAlign: "center",
        padding: "32px 24px",
        fontFamily: "var(--font-mono)",
        fontSize: 10,
        color: "var(--text-muted)",
        letterSpacing: "0.1em",
        borderTop: "1px solid var(--bg-border)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
      }}>
        <img src={fenrirLogo} alt="Fenrir Logo" style={{ width: 24, height: 24, borderRadius: "50%", opacity: 0.8 }} />
        FENRIR — POLKADOT SOLIDITY HACKATHON 2026 — TRACK 2: PVM SMART CONTRACTS
      </footer>
    </div>
  );
}

// -----------------------------------------------------------------------
// Nav — fixed top bar
// -----------------------------------------------------------------------
function Nav({ view, setView, setSelected, isDemoMode }) {
  return (
    <nav className="nav">
      <div className="nav-brand" onClick={() => { setSelected(null); setView("feed"); }} style={{ gap: 12 }}>
        <img src={fenrirLogo} alt="Fenrir" style={{ width: 44, height: 44, borderRadius: "50%", filter: "drop-shadow(0 0 10px rgba(14, 165, 233, 0.5))" }} />
        <span style={{ fontSize: 18, color: "var(--text-primary)" }}>fenrir</span>
      </div>
      <div className="nav-links">
        <button
          className={`nav-btn ${view === "feed" && !false ? "active" : ""}`}
          onClick={() => { setSelected(null); setView("feed"); }}
        >
          Proposals
        </button>
        <button
          className={`nav-btn ${view === "stats" ? "active" : ""}`}
          onClick={() => { setSelected(null); setView("stats"); }}
        >
          Stats
        </button>
      </div>
      {isDemoMode && <span className="nav-badge">DEMO MODE</span>}
    </nav>
  );
}
