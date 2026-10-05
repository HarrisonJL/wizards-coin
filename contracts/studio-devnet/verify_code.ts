// Confirms the code deployed at <address> is byte-identical to a source file
// (same SHA-256), fetched straight from the chain.
//
// Run inside contracts/studio-devnet:
//   npx tsx verify_code.ts <address> [vault.py]                      # Studio Devnet (default)
//   CHAIN=bradbury npx tsx verify_code.ts <address> ../vault.py      # Bradbury
import * as crypto from "crypto";
import * as fs from "fs";
import { createClient, chains } from "genlayer-js";

async function main() {
  const address = process.argv[2];
  const file = process.argv[3] ?? "vault.py";
  if (!address) throw new Error("usage: verify_code.ts <address> [file]");
  const chain = process.env.CHAIN === "bradbury" ? (chains as any).testnetBradbury : (chains as any).studioDevnet;
  let onchain: any = await createClient({ chain }).getContractCode(address);
  if (typeof onchain !== "string") onchain = Buffer.from(onchain).toString("utf-8");
  const local = fs.readFileSync(file, "utf-8");
  const sha = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
  console.log(`${chain.name}: ${address}`);
  console.log(`  on-chain  sha256 ${sha(onchain)} (${onchain.length} chars)`);
  console.log(`  ${file} sha256 ${sha(local)} (${local.length} chars)`);
  console.log(onchain === local ? "IDENTICAL" : "DIFFERENT");
  process.exit(onchain === local ? 0 : 1);
}
main().catch((e) => {
  console.error(e?.shortMessage ?? e?.message ?? e);
  process.exit(1);
});
