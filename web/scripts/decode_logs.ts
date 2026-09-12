import { createPublicClient, http, decodeEventLog } from "viem";
import { testnetBradbury } from "genlayer-js/chains";

const CONSENSUS = "0x0112Bf6e83497965A5fdD6Dad1E447a6E004271D" as `0x${string}`;

// Usage: npx tsx scripts/decode_logs.ts <txId> <fromBlock> <toBlock>
// fromBlock/toBlock: get them from the explorer's transaction detail JSON
// (starting_block_number, plus a couple hundred blocks of headroom).
async function main() {
  const TXID = process.argv[2];
  const fromBlock = BigInt(process.argv[3] ?? "0");
  const toBlock = BigInt(process.argv[4] ?? String(fromBlock + 300n));
  if (!TXID) throw new Error("Usage: tsx decode_logs.ts <txId> <fromBlock> [toBlock]");

  const client = createPublicClient({
    chain: { ...testnetBradbury, rpcUrls: testnetBradbury.rpcUrls } as any,
    transport: http("https://rpc-bradbury.genlayer.com"),
  });

  const abi = (testnetBradbury as any).consensusMainContract.abi;

  const logs = await client.getLogs({
    address: CONSENSUS,
    fromBlock,
    toBlock,
  });

  for (const log of logs) {
    const raw = JSON.stringify(log, (_k, v) => (typeof v === "bigint" ? v.toString() : v)).toLowerCase();
    if (!raw.includes(TXID.slice(2).toLowerCase())) continue;
    try {
      const decoded = decodeEventLog({ abi, data: log.data, topics: log.topics }) as any;
      console.log(`block ${log.blockNumber} | ${decoded.eventName} |`, decoded.args);
    } catch (e) {
      console.log(`block ${log.blockNumber} | UNDECODABLE | topic0=${log.topics[0]}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
