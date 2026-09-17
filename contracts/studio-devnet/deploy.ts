// Deploys vault.py (GenVM v0.3-ported) to GenLayer Studio Devnet (chain
// 61997) via genlayer-js@2.0.0-rc.1 - a separate SDK major version from the
// rest of this project, kept isolated in this folder's own package.json
// rather than bumping web/'s dependency, since v0.3/v2.0 changed enough
// (fee-distribution requirement, gl.contract.Contract, gl.storage.*,
// gl.message.raw) that mixing it into the Bradbury-facing app isn't worth
// the risk. This deployment exists to satisfy a hackathon submission
// requirement for a Studio Devnet deployment - the real, live app stays on
// Bradbury (see ../vault.py and the root README).
//
// Usage: npx tsx deploy.ts
// Requires DEPLOYER_PRIVATE_KEY in .env (gitignored). Never commit a key.
import { readFileSync } from "node:fs";
import { createClient, createAccount } from "genlayer-js";
import { studioDevnet } from "genlayer-js/chains";
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env" });

async function main() {
  const rawKey = process.env.DEPLOYER_PRIVATE_KEY!;
  const account = createAccount((rawKey.startsWith("0x") ? rawKey : `0x${rawKey}`) as `0x${string}`);
  const client = createClient({ chain: studioDevnet as any, account });
  console.log(`Deploying as ${account.address} on ${studioDevnet.name} (chain id ${studioDevnet.id})`);

  const code = readFileSync("vault.py", "utf-8");
  const estimate = await client.estimateTransactionFees({});

  const BASE_FEE = 1n * 10n ** 18n;
  const FEE_MULTIPLIER_BPS = 10078;
  const MAX_FEE = 100n * 10n ** 18n;
  const CREATOR_BPS = 3000;
  const TIMEOUT_SECONDS = 7 * 24 * 60 * 60;

  const deployTxHash = await client.deployContract({
    account,
    code,
    args: [BASE_FEE, FEE_MULTIPLIER_BPS, MAX_FEE, CREATOR_BPS, TIMEOUT_SECONDS],
    fees: { distribution: estimate.distribution, feeValue: estimate.feeValue },
  } as any);
  console.log(`Submitted ${deployTxHash} - waiting for finality...`);
  const receipt: any = await client.waitForTransactionReceipt({ hash: deployTxHash as any });
  console.log("txExecutionResultName:", receipt.txExecutionResultName);
  console.log("recipient:", receipt.recipient);
  console.log("leader_receipt result:", JSON.stringify(receipt.consensus_data?.leader_receipt?.[0]?.result));
  console.log("leader_receipt stderr:", receipt.consensus_data?.leader_receipt?.[0]?.genvm_result?.stderr);
}
main().catch((e) => { console.error(e.message); process.exit(1); });
