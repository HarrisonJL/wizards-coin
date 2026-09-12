import type { Ref } from "react";
import { pixelRects } from "@/components/pixel/PixelGrid";

const SHACKLE_GRID = ["...SSSSSS...", "...S....S...", "...S....S...", "...S....S..."];

const BODY_GRID = [
  "..LLLLLLLL..",
  "..LLLLLLLL..",
  "..LLLKKLLL..",
  "..LLLKKLLL..",
  "..LLLLKLLL..",
  "..LLLLLLLL..",
  "..llllllll..",
];

const COLORS: Record<string, string> = {
  S: "#b8c0cc",
  L: "#e3b93f",
  l: "#a5811f",
  K: "#1a1420",
};

export const PADLOCK_COLS = 12;
export const PADLOCK_ROWS = SHACKLE_GRID.length + BODY_GRID.length;
export const PADLOCK_HINGE = { x: 9, y: SHACKLE_GRID.length };

export default function PixelPadlock({
  size = 48,
  shackleRef,
  tintRef,
  className = "",
}: {
  size?: number;
  shackleRef?: Ref<SVGGElement>;
  tintRef?: Ref<SVGRectElement>;
  className?: string;
}) {
  const height = Math.round((size * PADLOCK_ROWS) / PADLOCK_COLS);
  return (
    <svg
      viewBox={`0 0 ${PADLOCK_COLS} ${PADLOCK_ROWS}`}
      width={size}
      height={height}
      shapeRendering="crispEdges"
      className={className}
      role="img"
      aria-label="Padlock guarding the prompt"
    >
      <g ref={shackleRef}>{pixelRects(SHACKLE_GRID, COLORS)}</g>
      <g transform={`translate(0 ${SHACKLE_GRID.length})`}>{pixelRects(BODY_GRID, COLORS)}</g>
      <rect
        ref={tintRef}
        x={0}
        y={0}
        width={PADLOCK_COLS}
        height={PADLOCK_ROWS}
        fill="#ff5fa2"
        opacity={0}
      />
    </svg>
  );
}
