// frontend/src/components/Hero.jsx
// Phase 2 per FrontendDesign.md
// Full-viewport cinematic hero. GSAP stagger entrance.
// Video background with graceful fallback if /bg.webm not present.

import { useEffect, useRef } from "react";
import gsap from "gsap";

export function Hero({ stats, dotProtected }) {
  const linesRef = useRef([]);
  const subRef   = useRef();
  const statsRef = useRef();

  useEffect(() => {
    const tl = gsap.timeline({ delay: 0.2 });

    tl.fromTo(
      linesRef.current,
      { yPercent: 110, opacity: 0 },
      { yPercent: 0, opacity: 1, duration: 1, stagger: 0.12, ease: "power4.out" },
    )
      .fromTo(
        subRef.current,
        { opacity: 0, y: 20 },
        { opacity: 1, y: 0, duration: 0.8, ease: "power3.out" },
        "-=0.5",
      )
      .fromTo(
        Array.from(statsRef.current?.children || []),
        { opacity: 0, y: 30 },
        { opacity: 1, y: 0, stagger: 0.1, duration: 0.6, ease: "power3.out" },
        "-=0.4",
      );

    return () => tl.kill();
  }, []);

  const fmtDOT = (n) => {
    if (!n || isNaN(n)) return "—";
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000)     return `${(n / 1_000).toFixed(0)}K`;
    return String(n);
  };

  const statItems = [
    { value: stats?.total ?? "—",          label: "Proposals Scored" },
    { value: stats?.highRisk ?? "—",       label: "High Risk Flagged" },
    { value: fmtDOT(dotProtected) + " DOT", label: "DOT Protected" },
  ];

  const lines = [
    { text: "FENRIR",                       size: "var(--text-hero)", weight: 800, color: "#e8eaf0", spacing: "-0.02em", lh: 0.85 },
    { text: "The wolf that hunts governance risk.", size: "clamp(18px,2.5vw,32px)", weight: 400, color: "#8b90a0", spacing: "0.01em", lh: 1.3 },
  ];

  return (
    <section style={{
      height: "100vh",
      position: "relative",
      display: "flex",
      alignItems: "center",
      overflow: "hidden",
    }}>
      {/* Video background — gracefully does nothing if /bg.webm missing */}
      <video
        autoPlay muted loop playsInline
        style={{
          position: "absolute", inset: 0,
          width: "100%", height: "100%",
          objectFit: "cover",
          opacity: 0.18,
          filter: "saturate(0)",
        }}
      >
        <source src="/bg.webm" type="video/webm" />
        <source src="/bg.mp4"  type="video/mp4" />
      </video>

      {/* Gradient overlay */}
      <div style={{
        position: "absolute", inset: 0,
        background: "linear-gradient(to bottom, rgba(13,15,18,0.3) 0%, rgba(13,15,18,0.97) 100%)",
      }} />

      {/* Content */}
      <div style={{
        position: "relative", zIndex: 1,
        maxWidth: 1100, margin: "0 auto",
        padding: "0 48px", width: "100%",
      }}>
        {/* Eyebrow */}
        <div style={{
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          color: "var(--accent)",
          letterSpacing: "0.3em",
          textTransform: "uppercase",
          marginBottom: 24,
        }}>
          Polkadot · Risk Intelligence · On-Chain
        </div>

        {/* Animated headline lines */}
        {lines.map(({ text, size, weight, color, spacing, lh }, i) => (
          <div key={i} style={{ overflow: "hidden", lineHeight: lh }}>
            <div
              ref={(el) => (linesRef.current[i] = el)}
              style={{
                fontFamily: "var(--font-display)",
                fontSize: size, fontWeight: weight,
                color, letterSpacing: spacing,
                marginTop: i === 1 ? 16 : 0,
              }}
            >
              {text}
            </div>
          </div>
        ))}

        {/* Subtitle */}
        <p
          ref={subRef}
          style={{
            fontFamily: "var(--font-body)",
            fontSize: 15,
            color: "var(--text-muted)",
            maxWidth: 460,
            lineHeight: 1.7,
            marginTop: 24,
          }}
        >
          On-chain ML inference via PolkaVM scores every proposal before
          you vote. No oracle. No API. Fully trustless.
        </p>

        {/* Stats row */}
        <div
          ref={statsRef}
          style={{
            display: "flex", gap: 48,
            marginTop: 56,
            borderTop: "1px solid var(--bg-border)",
            paddingTop: 32,
            flexWrap: "wrap",
          }}
        >
          {statItems.map(({ value, label }) => (
            <div key={label}>
              <div style={{
                fontFamily: "var(--font-display)",
                fontSize: "clamp(32px,5vw,56px)",
                fontWeight: 800,
                color: "var(--text-primary)",
                lineHeight: 1,
              }}>
                {value}
              </div>
              <div style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                color: "var(--text-muted)",
                letterSpacing: "0.2em",
                marginTop: 8,
                textTransform: "uppercase",
              }}>
                {label}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Scroll indicator */}
      <div style={{
        position: "absolute", bottom: 40,
        left: "50%", transform: "translateX(-50%)",
        display: "flex", flexDirection: "column",
        alignItems: "center", gap: 8,
      }}>
        <span style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10, color: "var(--text-muted)",
          letterSpacing: "0.2em",
        }}>
          SCROLL
        </span>
        <div style={{
          width: 1, height: 40,
          background: "linear-gradient(to bottom, var(--text-muted), transparent)",
          animation: "scrollPulse 2s ease-in-out infinite",
        }} />
      </div>
    </section>
  );
}
