// Fires a real attempt() against the live vault from the test wallet
// (.env.wallet2), mirroring exactly what AttemptComposer.tsx does in the
// browser. Usage: npx tsx scripts/attempt_as.ts "<message>"
import { createClient, createAccount } from "genlayer-js";
import { testnetBradbury } from "genlayer-js/chains";
import "dotenv/config";
import { config as loadWallet2 } from "dotenv";

loadWallet2({ path: ".env.wallet2" });

const ADDRESS = "0xF0A0188599C9f9d797bceEaeeE2E451E0Eb4aFBC" as `0x${string}`;

function safeJson(value: unknown): string {
  return JSON.stringify(value, (_key, v) => (typeof v === "bigint" ? v.toString() : v), 2);
}

async function main() {
  const message = process.argv[2];
  if (!message) throw new Error('Usage: tsx attempt_as.ts "<message>"');

  const rawKey = process.env.WALLET2_PRIVATE_KEY;
  if (!rawKey) throw new Error("WALLET2_PRIVATE_KEY not set - run create_test_wallet.ts + fund_wallet.ts first.");
  const account = createAccount(rawKey as `0x${string}`);
  const client = createClient({ chain: testnetBradbury, account });

  const stateBefore: any = await client.readContract({ address: ADDRESS, functionName: "get_state", args: [] });
  const fee = BigInt(stateBefore.attempt_fee);
  console.log(`Attempting as ${account.address}. Current fee: ${Number(fee) / 1e18} GEN. is_open=${stateBefore.is_open}`);
  console.log(`Message: ${message}`);

  const txHash = await client.writeContract({
    address: ADDRESS,
    functionName: "attempt",
    args: [message],
    value: fee,
  });
  console.log(`Submitted ${txHash} - waiting for finality (this is real consensus, can take a while)...`);
  const receipt: any = await client.waitForTransactionReceipt({
    hash: txHash,
    status: "FINALIZED" as any,
    interval: 15000,
    retries: 240,
  });
  console.log("status_name:", receipt.status_name, "txExecutionResultName:", receipt.txExecutionResultName);
  if (receipt.txExecutionResultName === "FINISHED_WITH_ERROR") {
    console.log("Full receipt:", safeJson(receipt));
    throw new Error("Attempt finalized but execution failed.");
  }

  const attempts = (await client.readContract({
    address: ADDRESS,
    functionName: "get_attempts",
    args: [0, 1],
  })) as { verdict: boolean; reason: string; sender: string; fee_paid: string }[];
  console.log("\nResult:", safeJson(attempts[0]));

  const stateAfter: any = await client.readContract({ address: ADDRESS, functionName: "get_state", args: [] });
  console.log("\nVault state after:", safeJson(stateAfter));
}

main().catch((err) => {
  console.error("FAILED:", err?.message ?? err);
  process.exit(1);
});
