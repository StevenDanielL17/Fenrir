// frontend/src/components/Preloader.jsx
// Phase 1 per FrontendDesign.md
// Duration 2.2s. Progress bar + counter. Exits by sliding up.

import { useEffect, useRef } from "react";
import gsap from "gsap";

import fenrirLogo from "../assets/fenrir_logo.png";

export function Preloader({ onComplete }) {
  const containerRef = useRef();
  const progressRef  = useRef();
  const counterRef   = useRef();
  const wolfRef      = useRef();

  useEffect(() => {
    const tl = gsap.timeline({ onComplete });

    tl.fromTo(
      wolfRef.current,
      { opacity: 0, scale: 0.8 },
      { opacity: 1, scale: 1, duration: 0.6, ease: "power3.out" },
    )
      .to(
        { val: 0 },
        {
          val: 100,
          duration: 1.2,
          ease: "power2.inOut",
          onUpdate: function () {
            if (counterRef.current)
              counterRef.current.textContent = String(
                Math.round(this.targets()[0].val),
              ).padStart(3, "0");
          },
        },
        0.3,
      )
      .fromTo(
        progressRef.current,
        { scaleX: 0 },
        {
          scaleX: 1,
          duration: 1.2,
          ease: "power2.inOut",
          transformOrigin: "left",
        },
        0.3,
      )
      .to(
        containerRef.current,
        { yPercent: -100, duration: 0.7, ease: "power3.inOut" },
        1.5,
      );

    return () => tl.kill();
  }, [onComplete]);

  return (
    <div
      ref={containerRef}
      className="preloader"
    >
      <img 
        ref={wolfRef} 
        src={fenrirLogo} 
        alt="Fenrir Logo" 
        style={{ width: 100, height: 100, borderRadius: "50%", filter: "drop-shadow(0 0 16px rgba(14, 165, 233, 0.4))" }} 
      />

      <div style={{
        fontFamily: "var(--font-display)",
        fontSize: 14,
        letterSpacing: "0.45em",
        color: "var(--accent)",
        fontWeight: 700,
      }}>
        FENRIR
      </div>

      {/* Progress track */}
      <div style={{
        width: 200,
        height: 1,
        background: "#252a38",
        position: "relative",
        overflow: "hidden",
      }}>
        <div
          ref={progressRef}
          style={{
            position: "absolute",
            inset: 0,
            background: "var(--accent)",
          }}
        />
      </div>

      {/* Counter */}
      <div
        ref={counterRef}
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 12,
          color: "var(--text-muted)",
          letterSpacing: "0.1em",
        }}
      >
        000
      </div>
    </div>
  );
}
