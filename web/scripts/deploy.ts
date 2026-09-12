// Deploys contracts/vault.py to GenLayer testnet (Bradbury by default) via
// genlayer-js, seeds the pool, prints the address, and writes it into
// .env.local so the frontend picks it up immediately.
//
// Usage:
//   DEPLOYER_PRIVATE_KEY=0x... npx tsx scripts/deploy.ts
//
// Requires a funded Bradbury account - see scripts/fund.md at the project
// root for how to get testnet GEN from the faucet. Never commit a private
// key; DEPLOYER_PRIVATE_KEY should live in web/.env (gitignored), not
// .env.local (which only holds public NEXT_PUBLIC_* values).
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient, createAccount } from "genlayer-js";
import { localnet, testnetBradbury } from "genlayer-js/chains";
import "dotenv/config";

function safeJson(value: unknown): string {
  return JSON.stringify(value, (_key, v) => (typeof v === "bigint" ? v.toString() : v), 2);
}

// Not importing a TransactionStatus enum here - confirmed neither
// TransactionStatus nor isSuccessful are part of genlayer-js 1.1.8's actual
// public export surface (grepped the installed package directly), despite
// some docs/examples referencing them. Using the raw string value instead,
// taken from the real enum definition in the installed SDK.
const FINALIZED = "FINALIZED";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONTRACTS_DIR = join(__dirname, "..", "..", "contracts");
const ENV_LOCAL_PATH = join(__dirname, "..", ".env.local");

const CHAIN_NAME = process.env.DEPLOY_CHAIN ?? "bradbury";
const chain = CHAIN_NAME === "localnet" ? localnet : testnetBradbury;

const BASE_FEE = BigInt(process.env.BASE_FEE_WEI ?? String(1n * 10n ** 18n));
const FEE_MULTIPLIER_BPS = Number(process.env.FEE_MULTIPLIER_BPS ?? "10078"); // +0.78% per attempt
const MAX_FEE = BigInt(process.env.MAX_FEE_WEI ?? String(100n * 10n ** 18n));
const CREATOR_BPS = Number(process.env.CREATOR_BPS ?? "3000"); // 30%, mirrors Freysa's 70/30
const TIMEOUT_SECONDS = Number(process.env.TIMEOUT_SECONDS ?? String(7 * 24 * 60 * 60));
const SEED_AMOUNT = BigInt(process.env.SEED_WEI ?? String(20n * 10n ** 18n));

// Real consensus (commit-reveal across a real validator committee, plus a
// separate, undocumented-length finality/appeal window after "Accepted")
// takes far longer than genlayer-js's defaults assume - confirmed directly
// against Bradbury: one deploy took ~37 minutes from submission to
// FINALIZED. localnet/GLSim is near-instant, so only wait this long for a
// real network.
const IS_LOCAL = CHAIN_NAME === "localnet";
const WAIT_OPTS = IS_LOCAL
  ? {}
  : { status: FINALIZED as any, interval: 15000, retries: 240 }; // up to 60 min

async function main() {
  const rawKey = process.env.DEPLOYER_PRIVATE_KEY;
  if (!rawKey) {
    throw new Error(
      "DEPLOYER_PRIVATE_KEY not set. See scripts/fund.md for how to get a funded testnet account."
    );
  }
  // Wallets often export the key without the 0x prefix - normalize either form.
  const privateKey = (rawKey.startsWith("0x") ? rawKey : `0x${rawKey}`) as `0x${string}`;

  const account = createAccount(privateKey);
  console.log(`Deploying as ${account.address} on ${chain.name} (chain id ${chain.id})`);

  const code = readFileSync(join(CONTRACTS_DIR, "vault.py"), "utf-8");
  const client = createClient({ chain, account });

  console.log("Deploying contract...");
  const deployTxHash = await client.deployContract({
    account,
    code,
    args: [BASE_FEE, FEE_MULTIPLIER_BPS, MAX_FEE, CREATOR_BPS, TIMEOUT_SECONDS],
  });
  console.log(`Submitted ${deployTxHash} - waiting for finality (this can take up to an hour on a real network)...`);
  const deployReceipt: any = await client.waitForTransactionReceipt({
    hash: deployTxHash as `0x${string}` & { length: 66 },
    ...WAIT_OPTS,
  });

  if (deployReceipt.txExecutionResultName === "FINISHED_WITH_ERROR") {
    throw new Error(
      `Deploy finalized but execution failed. Check https://explorer-bradbury.genlayer.com/tx/${deployTxHash} ` +
        `and run debugTraceTransaction for the real error. Receipt: ${safeJson(deployReceipt)}`
    );
  }

  const address = deployReceipt.to_address ?? deployReceipt.recipient;
  if (!address) {
    throw new Error(`Deploy did not return a contract address. Receipt: ${safeJson(deployReceipt)}`);
  }
  console.log(`Deployed at: ${address}`);

  if (SEED_AMOUNT > 0n) {
    // A single large-value seed call has been observed to revert at the L1
    // consensus layer on Bradbury with no decodable reason (confirmed via
    // debugTraceTransaction/eth_call - not a calldata, balance, or ABI
    // payability issue), while the identical call with a smaller value or a
    // plain retry goes through cleanly seconds later. It can also finalize
    // as NOT_VOTED/IDLE with zero validator votes. Both look like transient
    // network conditions rather than anything wrong with the transaction
    // itself, so retry a few times - catching thrown errors, not just
    // inspecting the receipt - before giving up.
    let seeded = false;
    let lastError: unknown;
    for (let attempt = 1; attempt <= 3 && !seeded; attempt++) {
      try {
        console.log(`Seeding pool with ${SEED_AMOUNT} wei (attempt ${attempt})...`);
        const seedTxHash = await client.writeContract({
          address: address as `0x${string}`,
          functionName: "seed",
          args: [],
          value: SEED_AMOUNT,
        });
        console.log(`Submitted ${seedTxHash} - waiting for finality...`);
        const seedReceipt: any = await client.waitForTransactionReceipt({ hash: seedTxHash, ...WAIT_OPTS });
        if (seedReceipt.txExecutionResultName === "FINISHED_WITH_ERROR") {
          throw new Error(`Seed transaction finalized but execution failed. Receipt: ${safeJson(seedReceipt)}`);
        }
        if (seedReceipt.txExecutionResultName === "NOT_VOTED") {
          console.log(`Attempt ${attempt} finalized as NOT_VOTED (no validator voted) - retrying.`);
          continue;
        }
        seeded = true;
      } catch (err) {
        lastError = err;
        console.log(`Attempt ${attempt} failed (${err instanceof Error ? err.message : err}) - retrying.`);
      }
    }
    if (!seeded) {
      throw new Error(
        `Seed transaction repeatedly failed or finalized as NOT_VOTED. Last error: ${
          lastError instanceof Error ? lastError.message : lastError
        }. Try scripts/seed_amount.ts with a smaller amount, or seed in a few smaller increments instead of one large call.`
      );
    }
    console.log("Pool seeded.");
  }

  const chainLine = CHAIN_NAME === "localnet" ? "localnet" : "bradbury";
  const existing = existsSync(ENV_LOCAL_PATH) ? readFileSync(ENV_LOCAL_PATH, "utf-8") : "";
  const withoutOldValues = existing
    .split("\n")
    .filter((line) => !line.startsWith("NEXT_PUBLIC_CONTRACT_ADDRESS=") && !line.startsWith("NEXT_PUBLIC_GENLAYER_CHAIN="))
    .join("\n")
    .trim();
  const newContent = [
    withoutOldValues,
    `NEXT_PUBLIC_CONTRACT_ADDRESS=${address}`,
    `NEXT_PUBLIC_GENLAYER_CHAIN=${chainLine}`,
  ]
    .filter(Boolean)
    .join("\n");
  writeFileSync(ENV_LOCAL_PATH, newContent + "\n");
  console.log(`Wrote ${ENV_LOCAL_PATH}`);

  console.log("\nRecord this in the project README under 'Verified platform facts':");
  console.log(`  Contract address: ${address}`);
  console.log(`  Deploy tx: ${deployTxHash}`);
  console.log(`  Network: ${chain.name} (chain id ${chain.id})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
