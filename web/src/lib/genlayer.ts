import { createClient } from "genlayer-js";
import { localnet, testnetBradbury } from "genlayer-js/chains";

// Not importing the GenLayerClient type - genlayer-js 1.1.8 uses it in its
// own signatures but doesn't re-export it from the public entry point, and
// createClient()'s own declared signature isn't generic over the chain
// anyway, so deriving the return type directly is both simpler and accurate.
type GenLayerClient = ReturnType<typeof createClient>;

// "bradbury" once deployed there (Phase 4); localnet for dev against
// scripts/run_glsim.py in the meantime. Never silently falls back to a
// contract address that doesn't exist on the selected chain.
const CHAIN_NAME = process.env.NEXT_PUBLIC_GENLAYER_CHAIN ?? "localnet";

export const chain = CHAIN_NAME === "bradbury" ? testnetBradbury : localnet;

export const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS ?? "";

export function getReadClient(): GenLayerClient {
  return createClient({ chain });
}

type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
};

declare global {
  interface Window {
    ethereum?: EthereumProvider;
  }
}

export function getBrowserProvider(): EthereumProvider | null {
  if (typeof window === "undefined") return null;
  return window.ethereum ?? null;
}

export function getWriteClient(account: `0x${string}`): GenLayerClient {
  const provider = getBrowserProvider();
  return createClient({ chain, account, provider: provider ?? undefined });
}

export async function requestWalletAccount(): Promise<`0x${string}` | null> {
  const provider = getBrowserProvider();
  if (!provider) return null;
  const accounts = (await provider.request({
    method: "eth_requestAccounts",
  })) as string[];
  return (accounts[0] as `0x${string}`) ?? null;
}
