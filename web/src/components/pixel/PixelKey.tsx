import type { Ref } from "react";
import { pixelRects } from "@/components/pixel/PixelGrid";

const BOW_GRID = ["KK.......", "KKKKK....", "KK......."];
const TEETH_GRID = [".........", "....KKKK.", "....K.K.."];

const COLORS: Record<string, string> = {
  K: "#e3b93f",
};

export const KEY_COLS = 9;
export const KEY_ROWS = 3;

export default function PixelKey({
  size = 36,
  bowRef,
  teethRef,
  className = "",
  style,
}: {
  size?: number;
  bowRef?: Ref<SVGGElement>;
  teethRef?: Ref<SVGGElement>;
  className?: string;
  style?: React.CSSProperties;
}) {
  const height = Math.round((size * KEY_ROWS) / KEY_COLS);
  return (
    <svg
      viewBox={`0 0 ${KEY_COLS} ${KEY_ROWS}`}
      width={size}
      height={height}
      shapeRendering="crispEdges"
      className={className}
      style={style}
      role="img"
      aria-label="Key"
    >
      <g ref={bowRef}>{pixelRects(BOW_GRID, COLORS)}</g>
      <g ref={teethRef}>{pixelRects(TEETH_GRID, COLORS)}</g>
    </svg>
  );
}
