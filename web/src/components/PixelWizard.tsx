"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { PixelGrid } from "@/components/pixel/PixelGrid";

const GRID = [
  "......HH........",
  "Oo...HhhH......",
  "oO...HhhH......",
  ".T..HHhhHH......",
  ".T..HhSShH......",
  ".T.HHHHHHHH.....",
  ".THHHGGGGHHH....",
  ".T..BBFFBB......",
  ".T.BFFFFFFB.....",
  ".T.BFEFFEFB.....",
  ".T.BFFFFFFB.....",
  ".T..BBBBBB......",
  ".T.BBBBBBBB.....",
  ".T.BBBBBBBB.....",
  ".T.RRRRRRRR.....",
  ".T.rRRRRRRr.....",
  ".T.RGGGGGGR.....",
  ".T.rRRRRRRr.....",
  ".TRRr....rRR....",
  ".T..KK..KK......",
];

const COLORS: Record<string, string> = {
  H: "#4b3b73",
  h: "#7c63b3",
  S: "#ffd75e",
  F: "#f0c199",
  E: "#241a35",
  B: "#f5f5f0",
  R: "#8fd0ec",
  r: "#5da4c9",
  G: "#e3b93f",
  T: "#8a5a34",
  O: "#bdf3ff",
  o: "#55d9ff",
  K: "#241a35",
};

const COLS = 16;

export default function PixelWizard({
  size = 96,
  className = "",
  glow = true,
  float = true,
  fierce = false,
}: {
  size?: number;
  className?: string;
  glow?: boolean;
  float?: boolean;
  fierce?: boolean;
}) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!fierce || !svgRef.current) return;
    const el = svgRef.current;
    gsap.set(el, { transformOrigin: "50% 95%" });
    const tl = gsap.timeline({ repeat: -1, repeatDelay: 2.6, delay: 1 });
    tl.to(el, { rotation: -7, duration: 0.12, ease: "power1.out" })
      .to(el, { rotation: 9, duration: 0.14, ease: "power1.inOut" })
      .to(el, { rotation: -4, duration: 0.12, ease: "power1.inOut" })
      .to(el, { rotation: 0, duration: 0.18, ease: "back.out(2)" });
    return () => {
      tl.kill();
      gsap.set(el, { rotation: 0 });
    };
  }, [fierce]);

  return (
    <PixelGrid
      svgRef={svgRef}
      grid={GRID}
      colors={COLORS}
      cols={COLS}
      size={size}
      className={`${float ? "wizard-float" : ""} ${glow ? "wizard-glow" : ""} ${className}`}
      label="Pixel art wizard guarding the vault"
    />
  );
}
