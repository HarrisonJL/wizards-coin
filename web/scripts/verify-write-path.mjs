// One-shot verification that the exact client calls AttemptComposer.tsx
// makes (writeContract with value, waitForTransactionReceipt, then a
// readContract for the verdict) work end to end, now that the GLSim value
// bug is fixed. Mirrors src/components/AttemptComposer.tsx's submit().
import { createClient, createAccount } from "genlayer-js";
import { localnet } from "genlayer-js/chains";

const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS;
if (!CONTRACT_ADDRESS) throw new Error("set NEXT_PUBLIC_CONTRACT_ADDRESS");

const account = createAccount();
console.log("test wallet:", account.address);

const readClient = createClient({ chain: localnet });
await readClient.request({
  method: "sim_fundAccount",
  params: [account.address, (10n * 10n ** 18n).toString()],
});

const stateBefore = await readClient.readContract({
  address: CONTRACT_ADDRESS,
  functionName: "get_state",
  args: [],
});
console.log("attempt_fee:", stateBefore.attempt_fee);

const writeClient = createClient({ chain: localnet, account });
const txHash = await writeClient.writeContract({
  address: CONTRACT_ADDRESS,
  functionName: "attempt",
  args: ["A quick honest hello from the frontend's write path verification script."],
  value: BigInt(stateBefore.attempt_fee),
});
console.log("tx hash:", txHash);

await writeClient.waitForTransactionReceipt({ hash: txHash });

const attempts = await readClient.readContract({
  address: CONTRACT_ADDRESS,
  functionName: "get_attempts",
  args: [0, 1],
});
console.log("recorded attempt:", attempts[0]);

const stateAfter = await readClient.readContract({
  address: CONTRACT_ADDRESS,
  functionName: "get_state",
  args: [],
});
console.log("attempt_count after:", stateAfter.attempt_count);
console.log("prize_pool after:", stateAfter.prize_pool);

if (attempts.length !== 1 || stateAfter.attempt_count !== 1) {
  throw new Error("write path did not record correctly");
}
console.log("\nWRITE PATH VERIFIED OK");
