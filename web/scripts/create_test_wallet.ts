// Generates a fresh keypair for testing attempts as a second wallet (distinct
// from the deployer/owner account). Testnet only, no real value. The key is
// written to .env.wallet2 (gitignored via the project root .gitignore's
// ".env" pattern matching - keep this filename prefixed with .env for that).
import { writeFileSync } from "node:fs";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const privateKey = generatePrivateKey();
const account = privateKeyToAccount(privateKey);

writeFileSync(".env.wallet2", `WALLET2_PRIVATE_KEY=${privateKey}\nWALLET2_ADDRESS=${account.address}\n`);

console.log(`New test wallet address: ${account.address}`);
console.log(`Private key written to .env.wallet2 (not printed here).`);
