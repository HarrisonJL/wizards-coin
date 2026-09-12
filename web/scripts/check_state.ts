import { createClient } from "genlayer-js";
import { testnetBradbury } from "genlayer-js/chains";

const ADDRESS = "0xF0A0188599C9f9d797bceEaeeE2E451E0Eb4aFBC";

async function main() {
  const client = createClient({ chain: testnetBradbury });
  const state = await client.readContract({
    address: ADDRESS,
    functionName: "get_state",
    args: [],
  });
  console.log("state:", JSON.stringify(state, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
