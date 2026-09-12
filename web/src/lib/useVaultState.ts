"use client";

import { useCallback, useEffect, useState } from "react";
import { CONTRACT_ADDRESS, getReadClient } from "@/lib/genlayer";

export type VaultState = {
  owner: string;
  prize_pool: bigint;
  attempt_fee: bigint;
  attempt_count: number;
  is_open: boolean;
  winner: string;
  last_attempt_time: string;
  guard_prompt_hash: string;
  timeout_seconds: number;
};

export type Attempt = {
  sender: string;
  message: string;
  verdict: boolean;
  reason: string;
  fee_paid: bigint;
  timestamp: string;
};

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export function isConfigured(): boolean {
  return CONTRACT_ADDRESS.length > 0;
}

export function useVaultState(pollMs = 8000) {
  const [state, setState] = useState<VaultState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!isConfigured()) {
      setError("NEXT_PUBLIC_CONTRACT_ADDRESS is not set.");
      setLoading(false);
      return;
    }
    try {
      const client = getReadClient();
      const raw = (await client.readContract({
        address: CONTRACT_ADDRESS as `0x${string}`,
        functionName: "get_state",
        args: [],
      })) as VaultState;
      setState(raw);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to read vault state.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, pollMs);
    return () => clearInterval(id);
  }, [refresh, pollMs]);

  return { state, error, loading, refresh, hasWinner: state?.winner !== undefined && state.winner !== ZERO_ADDRESS };
}

export async function fetchAttempts(offset: number, limit: number): Promise<Attempt[]> {
  const client = getReadClient();
  const raw = (await client.readContract({
    address: CONTRACT_ADDRESS as `0x${string}`,
    functionName: "get_attempts",
    args: [offset, limit],
  })) as Attempt[];
  return raw;
}

export async function fetchGuardPrompt(): Promise<string> {
  const client = getReadClient();
  return (await client.readContract({
    address: CONTRACT_ADDRESS as `0x${string}`,
    functionName: "get_guard_prompt",
    args: [],
  })) as string;
}
