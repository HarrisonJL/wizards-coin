import { createClient } from "genlayer-js";
import { testnetBradbury } from "genlayer-js/chains";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });

// Usage: npx tsx scripts/check_state.ts [address]
// Defaults to NEXT_PUBLIC_CONTRACT_ADDRESS (.env.local) - the live deployment.
const ADDRESS = process.argv[2] ?? process.env.NEXT_PUBLIC_CONTRACT_ADDRESS;

async function main() {
  if (!ADDRESS) throw new Error("No address given and NEXT_PUBLIC_CONTRACT_ADDRESS not set.");
  const client = createClient({ chain: testnetBradbury });
  const state = await client.readContract({
    address: ADDRESS as `0x${string}`,
    functionName: "get_state",
    args: [],
  });
  console.log("state:", JSON.stringify(state, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
