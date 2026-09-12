const ONE_GEN = 10n ** 18n;

function toBigInt(value: number | bigint | string): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "string") return BigInt(value);
  return BigInt(Math.trunc(value));
}

/** Renders a base-unit GEN amount (u256, 18 decimals) as a human string. */
export function formatGen(value: number | bigint | string, maxDecimals = 4): string {
  const v = toBigInt(value);
  const whole = v / ONE_GEN;
  const frac = v % ONE_GEN;
  if (frac === 0n) return whole.toString();
  const fracStr = frac.toString().padStart(18, "0").slice(0, maxDecimals);
  const trimmed = fracStr.replace(/0+$/, "");
  return trimmed ? `${whole}.${trimmed}` : whole.toString();
}

export function parseGenToBaseUnits(input: string): bigint {
  const trimmed = input.trim();
  if (!trimmed) return 0n;
  const [wholePart, fracPart = ""] = trimmed.split(".");
  const fracPadded = (fracPart + "0".repeat(18)).slice(0, 18);
  const whole = wholePart ? BigInt(wholePart) : 0n;
  const frac = fracPadded ? BigInt(fracPadded) : 0n;
  return whole * ONE_GEN + frac;
}

export function truncateAddress(address: string, chars = 4): string {
  if (!address || address.length < 2 + chars * 2) return address;
  return `${address.slice(0, 2 + chars)}…${address.slice(-chars)}`;
}

export function timeAgo(isoString: string): string {
  const then = new Date(isoString).getTime();
  if (Number.isNaN(then)) return isoString;
  const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
