import type { Ref } from "react";
import { PixelGrid } from "@/components/pixel/PixelGrid";

const GRID = [".CC.", "C..C", "C..C", "C..C", "C..C", ".CC."];

const COLORS: Record<string, string> = {
  C: "#8a94a8",
};

export default function ChainLink({
  size = 14,
  rotation = 0,
  divRef,
  className = "",
}: {
  size?: number;
  rotation?: number;
  divRef?: Ref<HTMLDivElement>;
  className?: string;
}) {
  return (
    <div
      ref={divRef}
      className={`inline-block ${className}`}
      style={{ transform: `rotate(${rotation}deg)` }}
    >
      <PixelGrid grid={GRID} colors={COLORS} cols={4} size={size} />
    </div>
  );
}
