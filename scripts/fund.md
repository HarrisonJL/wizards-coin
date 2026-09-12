# Getting testnet GEN for deployment

Checked directly against [testnet-faucet.genlayer.foundation](https://testnet-faucet.genlayer.foundation) - this is what it actually requires, not assumed from docs:

- **Sign in with GitHub.** The account must be older than 3 months and have at least 1 public repo.
- **Requires 0.01 ETH on mainnet.** This is an anti-sybil check - you need a wallet that already holds at least 0.01 real ETH to prove ownership. You are not spending this ETH, just proving you hold it, but if you do not already have a wallet with mainnet ETH, this is a real prerequisite to sort out first.
- **100 GEN per claim, once per week.** Rate-limited - plan around this if you expect to need more than one deployment's worth of gas in a given week.
- The page has a network toggle for **Testnet Bradbury** and **Testnet Asimov** - both are live options; this project targets Bradbury (see the main plan for why).
- There's an "Add GenLayer Testnets Chain to Wallet" button on the page to add the network config directly to a browser wallet.

## Steps

1. Go to https://testnet-faucet.genlayer.foundation, select **Testnet Bradbury**, and sign in with GitHub.
2. Connect or paste the wallet address you want funded (this becomes your deployer account).
3. Claim the 100 GEN.
4. Export that account's private key from your wallet (MetaMask: Account details -> Show private key). Treat it like a real secret even though it only holds test funds - put it in `web/.env` as `DEPLOYER_PRIVATE_KEY=0x...`, never in `.env.local` (which only holds public `NEXT_PUBLIC_*` values that ship to the browser) and never committed.
5. Run the deploy script:
   ```
   cd web && npm run deploy
   ```
   This deploys `contracts/vault.py`, seeds the pool with 20 GEN (configurable via `SEED_WEI`), writes the resulting contract address into `web/.env.local`, and prints what to record in the README.

100 GEN covers the deploy + seed (about 20 GEN) with plenty left over for a handful of test attempts - but each `attempt()` call also costs the caller's own gas beyond the escalating fee itself, so don't assume the full 100 GEN stretches indefinitely.
