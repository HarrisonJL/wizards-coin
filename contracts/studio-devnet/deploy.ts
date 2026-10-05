// Deploys vault.py (GenVM v0.3-ported) to GenLayer's Studio Devnet (chain
// 61997) via genlayer-js 2.0.0-rc.1. This deployment exists so the same guard
// prompt and contract logic can be independently verified on Studio Devnet
// too - the real, live app stays on Bradbury (see ../vault.py and the root
// README).
//
// Usage: npx tsx deploy.ts      (DEPLOYER_PRIVATE_KEY in .env, gitignored)
import { readFileSync } from "node:fs";
import { client, fees, waitDecided, EXPLORER } from "./lib";

async function main() {
  const c = client();
  console.log(`Deploying as ${c.account.address}`);
  const code = readFileSync("vault.py", "utf-8");
  const BASE_FEE = 1n * 10n ** 18n;
  const FEE_MULTIPLIER_BPS = 10078;
  const MAX_FEE = 100n * 10n ** 18n;
  const CREATOR_BPS = 3000;
  const TIMEOUT_SECONDS = 7 * 24 * 60 * 60;
  const hash = await c.deployContract({
    code,
    args: [BASE_FEE, FEE_MULTIPLIER_BPS, MAX_FEE, CREATOR_BPS, TIMEOUT_SECONDS],
    fees: await fees(c),
  });
  console.log(`Deploy tx: ${hash}`);
  const tx = await waitDecided(c, hash);
  console.log(`Result: ${tx.txExecutionResultName ?? tx.result_name}`);
  console.log(`Contract address: ${tx.to_address ?? tx.recipient}`);
  console.log(`${EXPLORER}/tx/${hash}`);
  process.exit(0);
}
main().catch((e) => {
  console.error(e?.shortMessage ?? e?.message ?? e);
  process.exit(1);
});
