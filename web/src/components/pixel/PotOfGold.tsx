"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { PixelGrid } from "@/components/pixel/PixelGrid";

const GRID = [
  "...CC.CC.CC...",
  ".CcCCcCCcCCcC.",
  "CcCCcCCcCCcCCc",
  ".pCCCCCCCCCCp.",
  "ppPPPPPPPPPPpp",
  ".PPPPPPPPPPPP.",
  "..PPPPPPPPPP..",
  "...PPPPPPPP...",
  "....PPPPPP....",
  ".....PPPP.....",
];

const COLORS: Record<string, string> = {
  C: "#e3b93f",
  c: "#ffe98a",
  D: "#a5811f",
  p: "#4a3a60",
  P: "#2e2440",
};

const COLS = 14;

export default function PotOfGold({
  size = 72,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const sparkleRefs = useRef<(HTMLSpanElement | null)[]>([]);

  useEffect(() => {
    const sparkles = sparkleRefs.current.filter(Boolean) as HTMLSpanElement[];
    if (sparkles.length === 0) return;
    gsap.set(sparkles, { opacity: 0, scale: 0.4 });
    const tl = gsap.timeline({ repeat: -1 });
    sparkles.forEach((s, i) => {
      tl.to(
        s,
        { opacity: 1, scale: 1.15, duration: 0.25, ease: "power1.out" },
        i * 0.9
      ).to(s, { opacity: 0, scale: 0.4, duration: 0.55, ease: "power1.in" }, i * 0.9 + 0.35);
    });
    return () => {
      tl.kill();
    };
  }, []);

  return (
    <div ref={wrapRef} className={`relative inline-block ${className}`}>
      <PixelGrid grid={GRID} colors={COLORS} cols={COLS} size={size} label="A shiny pot of gold" />
      <span
        ref={(el) => {
          sparkleRefs.current[0] = el;
        }}
        className="pointer-events-none absolute text-[color:var(--gold)]"
        style={{ left: "20%", top: "8%", fontSize: size * 0.14, textShadow: "0 0 4px #fff8" }}
      >
        ✦
      </span>
      <span
        ref={(el) => {
          sparkleRefs.current[1] = el;
        }}
        className="pointer-events-none absolute text-white"
        style={{ left: "60%", top: "2%", fontSize: size * 0.1, textShadow: "0 0 4px #fff8" }}
      >
        ✦
      </span>
    </div>
  );
}
