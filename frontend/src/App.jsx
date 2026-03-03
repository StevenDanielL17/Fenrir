// ======================================================================
// Fenrir Dashboard — Main Application
// ======================================================================
// The primary entry point for the Fenrir OpenGov Risk Intelligence
// dashboard. Orchestrates the header, stats panel, proposal feed,
// and detail view into a cohesive single-page application.
//
// Features three views:
//   1. Feed — Live proposals with risk scores and flags
//   2. Stats — Aggregate metrics and risk distribution
//   3. Detail — Deep-dive into a specific proposal's risk analysis
//
// See BASE_INSTRUCTIONS.md Section 6 for the full UI specification.
// ======================================================================

import React, { useState } from 'react';
import { useFenrir, formatDOT, shortenAddress, getRiskLevel } from './hooks/useFenrir';
import ProposalCard from './components/ProposalCard';
import ScoreDisplay from './components/ScoreDisplay';
import FlagBreakdown from './components/FlagBreakdown';
import StatsPanel from './components/StatsPanel';

/**
 * App — Root component for the Fenrir Dashboard.
 */
export default function App() {
  const {
    proposals,
    stats,
    selectedProposal,
    loading,
    error,
    scoring,
    isDemoMode,
    filter,
    setFilter,
    searchQuery,
    setSearchQuery,
    scoreProposal,
    selectProposal,
    clearSelection,
    refreshData,
  } = useFenrir();

  const [activeView, setActiveView] = useState('feed'); // 'feed' or 'stats'
  const [scoreInput, setScoreInput] = useState('');

  // Handle scoring a new proposal
  const handleScore = async () => {
    const refIndex = parseInt(scoreInput, 10);
    if (isNaN(refIndex) || refIndex <= 0) return;

    await scoreProposal(refIndex);
    setScoreInput('');
  };

  // Render the proposal detail view
  if (selectedProposal) {
    return (
      <div className="app">
        <Header
          isDemoMode={isDemoMode}
          activeView={activeView}
          setActiveView={setActiveView}
          onBack={clearSelection}
        />
        <main className="app-main">
          <ProposalDetail
            proposal={selectedProposal}
            onBack={clearSelection}
          />
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="app">
      <Header
        isDemoMode={isDemoMode}
        activeView={activeView}
        setActiveView={setActiveView}
      />

      <main className="app-main">
        {/* Error display */}
        {error && (
          <div className="stat-card" style={{
            borderColor: 'var(--colour-risk-high)',
            marginBottom: 'var(--space-md)',
          }}>
            <div className="stat-label" style={{ color: 'var(--colour-risk-high)' }}>
              Error
            </div>
            <div style={{ fontSize: '0.875rem', color: 'var(--colour-text-secondary)' }}>
              {error}
            </div>
          </div>
        )}

        {/* Stats View */}
        {activeView === 'stats' && (
          <StatsPanel stats={stats} />
        )}

        {/* Feed View */}
        {activeView === 'feed' && (
          <>
            {/* Stats summary (always visible in feed) */}
            <StatsPanel stats={stats} />

            {/* Controls bar */}
            <div className="controls-bar animate-in">
              {/* Score new proposal */}
              <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
                <input
                  type="number"
                  className="search-input"
                  placeholder="REF #"
                  value={scoreInput}
                  onChange={(e) => setScoreInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleScore()}
                  style={{ width: '100px', minWidth: '100px' }}
                  min="1"
                  id="score-ref-input"
                />
                <button
                  className="score-btn"
                  onClick={handleScore}
                  disabled={scoring || !scoreInput}
                  id="score-btn"
                >
                  {scoring ? (
                    <>
                      <span className="loading-spinner" style={{
                        width: '14px', height: '14px',
                        borderWidth: '2px', marginBottom: 0,
                      }} />
                      Scoring...
                    </>
                  ) : (
                    <>⚡ Score New</>
                  )}
                </button>
              </div>

              {/* Risk level filter */}
              <select
                className="filter-select"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                id="risk-filter"
              >
                <option value="all">All Risk Levels</option>
                <option value="high">🔴 High Risk</option>
                <option value="moderate">🟠 Moderate Risk</option>
                <option value="low">🟡 Low Risk</option>
                <option value="minimal">🟢 Minimal Risk</option>
              </select>

              {/* Search */}
              <input
                type="text"
                className="search-input"
                placeholder="Search proposals..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                id="search-input"
              />

              {/* Refresh */}
              <button
                className="action-btn"
                onClick={refreshData}
                title="Refresh data"
                id="refresh-btn"
              >
                ↻ Refresh
              </button>
            </div>

            {/* Proposal feed */}
            {loading ? (
              <div className="loading-state">
                <div className="loading-spinner" />
                <span>Loading proposals...</span>
              </div>
            ) : proposals.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">🐺</div>
                <div className="empty-state-text">
                  {filter !== 'all' || searchQuery
                    ? 'No proposals match your current filters. Try adjusting your search criteria.'
                    : 'No proposals have been scored yet. Use the "Score New" button to analyse a referendum.'}
                </div>
              </div>
            ) : (
              <div>
                {proposals.map((proposal, index) => (
                  <ProposalCard
                    key={proposal.refIndex}
                    proposal={proposal}
                    onSelect={selectProposal}
                    animationDelay={Math.min(index + 1, 4)}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </main>

      <Footer />
    </div>
  );
}

// ======================================================================
// Header Component
// ======================================================================
function Header({ isDemoMode, activeView, setActiveView, onBack }) {
  return (
    <header className="app-header">
      <div className="header-inner">
        <div className="header-brand">
          <span className="wolf-icon">🐺</span>
          <div>
            <h1>FENRIR</h1>
            <span className="header-subtitle">
              OpenGov Risk Intelligence
              {isDemoMode && (
                <span style={{
                  marginLeft: '8px',
                  padding: '2px 6px',
                  borderRadius: 'var(--radius-full)',
                  background: 'rgba(245, 158, 11, 0.15)',
                  border: '1px solid rgba(245, 158, 11, 0.3)',
                  color: 'var(--colour-risk-moderate)',
                  fontSize: '0.65rem',
                  fontWeight: 600,
                }}>
                  DEMO
                </span>
              )}
            </span>
          </div>
        </div>

        <nav className="header-nav">
          {onBack && (
            <button className="nav-btn" onClick={onBack}>
              ← Back
            </button>
          )}
          <button
            className={`nav-btn ${activeView === 'feed' ? 'active' : ''}`}
            onClick={() => setActiveView('feed')}
            id="nav-feed"
          >
            Live Feed
          </button>
          <button
            className={`nav-btn ${activeView === 'stats' ? 'active' : ''}`}
            onClick={() => setActiveView('stats')}
            id="nav-stats"
          >
            Statistics
          </button>
        </nav>
      </div>
    </header>
  );
}

// ======================================================================
// Proposal Detail Component
// ======================================================================
function ProposalDetail({ proposal, onBack }) {
  const {
    refIndex,
    title,
    proposer,
    requestedDOT,
    track,
    score,
    flags,
    activeFlags,
    scoredAtBlock,
    submittedAt,
    riskLevel,
  } = proposal;

  return (
    <div className="detail-view animate-in">
      {/* Back button */}
      <button className="detail-back-btn" onClick={onBack}>
        ← Back to feed
      </button>

      {/* Header */}
      <div className="detail-header">
        <span className="proposal-ref">REF #{refIndex}</span>
        <h2 style={{ marginTop: 'var(--space-xs)' }}>
          {title || `Referendum #${refIndex}`} — Risk Analysis
        </h2>
      </div>

      {/* Large score display */}
      <div className="detail-section">
        <div className="detail-section-title">Risk Score</div>
        <div className="detail-score-large">
          <ScoreDisplay score={score} large={true} />
        </div>
      </div>

      {/* Why this score? — Flag breakdown */}
      <div className="detail-section">
        <div className="detail-section-title">Why This Score?</div>
        <FlagBreakdown flags={activeFlags} detailed={true} />
      </div>

      {/* Proposer information */}
      <div className="detail-section">
        <div className="detail-section-title">Proposal Details</div>
        <div className="detail-info-grid">
          <div className="detail-info-item">
            <div className="detail-info-label">Proposer</div>
            <div className="detail-info-value">{shortenAddress(proposer)}</div>
          </div>
          <div className="detail-info-item">
            <div className="detail-info-label">Requested Amount</div>
            <div className="detail-info-value">{formatDOT(requestedDOT)}</div>
          </div>
          <div className="detail-info-item">
            <div className="detail-info-label">Track</div>
            <div className="detail-info-value">{track || 'OpenGov'}</div>
          </div>
          <div className="detail-info-item">
            <div className="detail-info-label">Flag Bitmask</div>
            <div className="detail-info-value">
              {flags !== undefined ? `0x${flags.toString(16).padStart(2, '0').toUpperCase()}` : 'N/A'}
            </div>
          </div>
          <div className="detail-info-item">
            <div className="detail-info-label">Submitted At</div>
            <div className="detail-info-value">
              Block {submittedAt ? submittedAt.toLocaleString('en-GB') : 'N/A'}
            </div>
          </div>
          <div className="detail-info-item">
            <div className="detail-info-label">Scored At</div>
            <div className="detail-info-value">
              Block {scoredAtBlock ? scoredAtBlock.toLocaleString('en-GB') : 'N/A'}
            </div>
          </div>
        </div>

        {/* On-chain verification badge */}
        <div className="verified-badge">
          🔗 Scored on-chain — verifiable by any wallet or contract
        </div>
      </div>
    </div>
  );
}

// ======================================================================
// Footer Component
// ======================================================================
function Footer() {
  return (
    <footer className="app-footer">
      <p className="footer-text">
        <strong>🐺 Fenrir</strong> — The wolf that hunts corruption in governance
        <br />
        <span style={{ fontSize: '0.7rem', marginTop: '4px', display: 'inline-block' }}>
          Built for the Polkadot Solidity Hackathon 2026 — Track 2: PVM Smart Contracts
        </span>
      </p>
    </footer>
  );
}
