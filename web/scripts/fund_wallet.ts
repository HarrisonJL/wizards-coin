// Sends plain native GEN from the deployer wallet to the test wallet
// (.env.wallet2). Testnet only, no real value - a straightforward value
// transfer, not a contract call, so it doesn't touch the consensus contract
// revert behavior documented elsewhere in this project.
import { createWalletClient, createPublicClient, http, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import "dotenv/config";
import { config as loadWallet2 } from "dotenv";

loadWallet2({ path: ".env.wallet2" });

const bradbury = {
  id: 4221,
  name: "Genlayer Bradbury Testnet",
  nativeCurrency: { name: "GEN Token", symbol: "GEN", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc-bradbury.genlayer.com"] } },
} as const;

async function main() {
  const deployerKey = process.env.DEPLOYER_PRIVATE_KEY;
  const wallet2Address = process.env.WALLET2_ADDRESS as `0x${string}` | undefined;
  if (!deployerKey) throw new Error("DEPLOYER_PRIVATE_KEY not set (.env).");
  if (!wallet2Address) throw new Error("WALLET2_ADDRESS not set - run create_test_wallet.ts first.");

  const amount = process.argv[2] ?? "5";
  const deployer = privateKeyToAccount(
    (deployerKey.startsWith("0x") ? deployerKey : `0x${deployerKey}`) as `0x${string}`
  );

  const publicClient = createPublicClient({ chain: bradbury, transport: http() });
  const walletClient = createWalletClient({ account: deployer, chain: bradbury, transport: http() });

  console.log(`Sending ${amount} GEN from ${deployer.address} to ${wallet2Address}...`);
  const hash = await walletClient.sendTransaction({
    to: wallet2Address,
    value: parseEther(amount),
  });
  console.log(`Submitted ${hash} - waiting for receipt...`);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log("status:", receipt.status);

  const balance = await publicClient.getBalance({ address: wallet2Address });
  console.log(`Wallet 2 balance: ${Number(balance) / 1e18} GEN`);
}

main().catch((err) => {
  console.error("FAILED:", err?.message ?? err);
  process.exit(1);
});
