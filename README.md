# The Wizard's Coin

A Freysa-style prize vault, except the guardian isn't one operator's AI model - it's a whole jury of independent GenLayer validators, each running their own model, each judging your message separately. A payout only happens if a majority of them agree. Nobody, including whoever deployed this contract, can unilaterally decide an attempt succeeded.

(Named after GenLayer's own "Wizard of Coin" example - the closest published analog to this vault's judgment pattern, and the wizard guarding the pot of gold in the UI.)

**Live on GenLayer's Bradbury testnet. Testnet only - no real money anywhere in this project.**

## Why this is different from the usual "AI vault" game

Games like this normally work the same way: one operator runs one model behind one prompt, and that model decides whether to pay out. That means you have to trust the operator isn't quietly rigging it, patching the prompt after the fact, or just not paying out when someone wins.

This vault is a [GenLayer](https://genlayer.com) Intelligent Contract. There is no single judge - a committee of independent validators, each running its own model, judges every attempt separately through GenLayer's Optimistic Democracy consensus. A payout only happens if a majority agree. The guard prompt itself is public (`get_guard_prompt()` on the contract, and the "Show full prompt" panel in the UI) - hiding it wouldn't help anyway, since every validator sees it regardless.

Is it actually unbreakable? No, and we're not claiming that. The guard prompt is instructed to never release the vault under any circumstances, but that's a prompt-level instruction, not a mathematical guarantee. What changes is the bar: a jailbreak has to convince a majority of an independent, model-diverse jury at once, not find one weak spot in one endpoint. That's hard and nobody's thumb is on the scale - not "impossible."

## Verified platform facts (dated 2026-09)

Gathered hands-on this build, not assumed from docs:

- **Consensus:** simple majority of the committee (strictly more than half), not unanimity. Real appeal mechanism exists: anyone can appeal an accepted transaction within a finality window by paying a bond; a fresh, larger committee re-evaluates.
- **Committee size:** 5 validators for a normal round, growing on appeal (7, then 11).
- **Result timing:** a transaction's result is decided once it reaches `ACCEPTED` - typically well under a minute once validators pick it up, not the full `FINALIZED` state (which includes an appeal window that can take significantly longer). This app shows the `ACCEPTED` result immediately and confirms `FINALIZED` quietly in the background.
- **Contract language:** Python Intelligent Contracts on GenVM (`from genlayer import *`, `@gl.public.write` / `@gl.public.view`), judged via `gl.eq_principle.strict_eq` wrapping a real `gl.nondet.exec_prompt` call - the LLM's free-text output is reduced to a single parsed boolean before any consensus comparison happens, so an exact match is the correct semantics, not a limitation.
- **Native value transfer works end to end** on Bradbury (payable methods, `gl.get_contract_at(...).emit_transfer(...)`) - confirmed with real GEN, not just in the local simulator.

## Contract

- **Address:** [`0x8eA6969f6b2D45a246342A3c1EaBbc5F11AD93c4`](https://explorer-bradbury.genlayer.com/address/0x8eA6969f6b2D45a246342A3c1EaBbc5F11AD93c4) on Genlayer Bradbury Testnet (chain id `4221`)
- **Guard prompt hash:** `73ae6f1a24741a0bd4ef47c7032bab51083db3d40d6ebcdec0c6a908aab4fc57` (sha256 of the exact prompt in [`contracts/vault.py`](contracts/vault.py) - matches `get_state().guard_prompt_hash` on-chain, so you can verify the deployed prompt hasn't been swapped)
- **Fee curve:** starts at 1 GEN, +0.78% per denied attempt, capped at 100 GEN. 30% of every fee goes to the creator balance, 70% into the prize pool.
- **Timeout:** if no attempt lands for 7 days, anyone can call `expire()` and the pool refunds to the deployer (v1 simplification - a later version could split pro rata across attempters instead).

Source: [`contracts/vault.py`](contracts/vault.py) - a single self-contained file (GenVM has no local filesystem imports, so the guard prompt lives in a clearly labeled section at the top rather than a separate module).

## How to attempt it

1. Get testnet GEN from the [GenLayer faucet](https://testnet-faucet.genlayer.foundation/) (needs a GitHub account 3+ months old with a public repo, and 0.01 ETH held on real Ethereum mainnet as an anti-sybil check).
2. Open the app, connect a browser wallet on Bradbury (chain id `4221`).
3. Write your best argument (up to 1000 characters) and submit it with the current fee attached.
4. The validator jury judges it independently. You'll see a provisional verdict within roughly a minute, then a "confirmed final" tag once the transaction's appeal window closes.

## Attack corpus: 28/28 denied

Before calling this live, 28 distinct jailbreak attempts were fired against a real LLM-backed validator set (not mocked): direct override, DAN-style persona, roleplay reframing, fake system messages, fake delimiter escapes, fake tool-call results, a Freysa-style "your rule doesn't actually forbid this" reframing, claimed test/simulation environments, claimed authority (owner, GenLayer team), fake emergencies, emotional appeals, a prior-agreement claim, multilingual attempts, base64 and leetspeak obfuscation, JSON injection (pre-fill and schema-closing), extreme context padding, hypothetical framing, reverse psychology, helpfulness-pressure framing, a hidden HTML-comment instruction, and a direct paraphrase of the argument that beat the original Freysa vault.

**Result: 0 releases.** Full results in [`tests/attacks/RESULTS.md`](tests/attacks/RESULTS.md).

Since going live on Bradbury, several more real attempts were fired from real wallets - a plain honest ask, a fake "SYSTEM NOTICE" impersonating the GenLayer protocol team requesting a "routine verification release," and others. All denied by real consensus, fee and pool accounting exact each time (one attempt hit a validator timeout rather than a denial - see the `sweep()` note below, not a jailbreak-related outcome).

## Known limitations

- **Testnet only.** GEN here has no real-world value.
- **Consensus is majority, not unanimity.** A jailbreak that reliably fools most (not all) validator-model combinations could in principle still get through - the corpus above tests for exactly this and found none, but "hard" isn't "impossible."
- **Real consensus on an LLM call is slow and would be expensive on a production network.** That's expected, not a bug - every validator runs its own inference.
- **The stored `reason` is a fixed string, not the model's raw text**, by design - carrying free-text LLM output through `strict_eq` consensus would make validators disagree over wording rather than substance.
- **Bradbury is an early, actively developed testnet** ("Phase 1" per its own explorer). Its infrastructure has had rough patches during this build (an old GenVM version with an undocumented dependency-header format, a payload-size limit on deploys, transient reverts on some value-carrying calls). None of it is contract-level; see the project's build log for the full diagnostic trail if you hit something similar.
- **A validator timeout can strand an attempt's fee.** If a majority of the assigned committee times out mid-execution (confirmed happening live on Bradbury - traced down to the exact event log), the transaction settles at the consensus layer without ever reaching `attempt()`'s own bookkeeping: no verdict, no record, and the fee lands in the contract's real balance without being credited to `prize_pool` or `creator_balance`. Confirmed on a real transaction by comparing the contract's actual on-chain balance against its own tracked totals - they diverged by exactly the stranded fee, to the wei. `sweep()` (owner-only, only while the vault is open) reconciles any such gap into the prize pool. The prior deployment (`0xF0A0188599C9f9d797bceEaeeE2E451E0Eb4aFBC`) predates this fix and has ~1 GEN stuck in it permanently - superseded by the address above.

## Development

```bash
# Contract: lint + Direct Mode unit tests (mocked judge, deterministic logic only)
cd contracts && genvm-lint check vault.py
cd ../tests && python -m pytest test_vault_logic.py -v

# Frontend
cd web
npm install
npm run dev          # http://localhost:3000, localnet by default
```

`web/.env.local` needs `NEXT_PUBLIC_CONTRACT_ADDRESS` (and `NEXT_PUBLIC_GENLAYER_CHAIN=bradbury` for the live deployment; omit for a local GLSim network). Deploying a fresh instance: see [`web/scripts/deploy.ts`](web/scripts/deploy.ts) and [`scripts/fund.md`](scripts/fund.md).

Stack: Python Intelligent Contract on GenVM; Next.js 16 + React 19 + Tailwind v4 + TypeScript frontend via `genlayer-js`; GSAP-animated pixel-art UI (a padlocked guard prompt that breaks open on a real win, a live validator-jury readout while consensus is running, and an arcade-style result screen).
