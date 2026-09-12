import type { Ref } from "react";

export type PixelColors = Record<string, string>;

export function pixelDims(grid: string[], cols: number, size: number) {
  return { cols, rows: grid.length, height: Math.round((size * grid.length) / cols) };
}

export function pixelRects(grid: string[], colors: PixelColors) {
  return grid.flatMap((row, y) =>
    row.split("").map((ch, x) => {
      const fill = colors[ch];
      if (!fill) return null;
      return <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={fill} />;
    })
  );
}

export function PixelGrid({
  grid,
  colors,
  cols,
  size = 64,
  className = "",
  svgRef,
  style,
  label,
}: {
  grid: string[];
  colors: PixelColors;
  cols: number;
  size?: number;
  className?: string;
  svgRef?: Ref<SVGSVGElement>;
  style?: React.CSSProperties;
  label?: string;
}) {
  const { height } = pixelDims(grid, cols, size);
  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${cols} ${grid.length}`}
      width={size}
      height={height}
      shapeRendering="crispEdges"
      className={className}
      style={style}
      role={label ? "img" : undefined}
      aria-label={label}
    >
      {pixelRects(grid, colors)}
    </svg>
  );
}
