// Seed the live vault with a specific amount (in whole GEN).
// Usage: npx tsx scripts/seed_amount.ts <gen_amount> [address]
// Defaults to NEXT_PUBLIC_CONTRACT_ADDRESS (.env.local) if no address given.
import { createClient, createAccount } from "genlayer-js";
import { testnetBradbury } from "genlayer-js/chains";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });
loadEnv();

function safeJson(value: unknown): string {
  return JSON.stringify(value, (_key, v) => (typeof v === "bigint" ? v.toString() : v), 2);
}

async function main() {
  const genAmountStr = process.argv[2];
  if (!genAmountStr) throw new Error("Usage: tsx seed_amount.ts <gen_amount> [address]");
  const ADDRESS = (process.argv[3] ?? process.env.NEXT_PUBLIC_CONTRACT_ADDRESS) as `0x${string}` | undefined;
  if (!ADDRESS) throw new Error("No address given and NEXT_PUBLIC_CONTRACT_ADDRESS not set.");
  const rawKey = process.env.DEPLOYER_PRIVATE_KEY;
  if (!rawKey) throw new Error("DEPLOYER_PRIVATE_KEY not set.");
  const privateKey = (rawKey.startsWith("0x") ? rawKey : `0x${rawKey}`) as `0x${string}`;
  const account = createAccount(privateKey);
  const client = createClient({ chain: testnetBradbury, account });

  const value = BigInt(Math.round(parseFloat(genAmountStr) * 1e6)) * 1000000000000n; // supports fractional GEN
  console.log(`Seeding ${genAmountStr} GEN (${value} wei) as ${account.address}...`);
  const txHash = await client.writeContract({
    address: ADDRESS,
    functionName: "seed",
    args: [],
    value,
  });
  console.log(`Submitted ${txHash}`);
  const receipt: any = await client.waitForTransactionReceipt({ hash: txHash, interval: 5000, retries: 24 });
  console.log("status_name:", receipt.status_name, "txExecutionResultName:", receipt.txExecutionResultName);
  if (receipt.txExecutionResultName !== "FINISHED_WITH_RETURN") {
    console.log("Full receipt:", safeJson(receipt));
  }
}

main().catch((err) => {
  console.error("FAILED:", err?.message ?? err);
  process.exit(1);
});
