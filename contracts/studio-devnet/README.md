# Wizard's Coin on Studio Devnet

A port of [`../vault.py`](../vault.py) to GenVM v0.3's Python API, deployed to GenLayer's Studio Devnet (chain id `61997`) to satisfy a submission requirement for a deployment on that network. **The real, live app stays on Bradbury** - see the project root README. This is not a second production deployment; it exists so the same guard prompt and contract logic can be independently verified on Studio Devnet too.

- **Address:** [`0xa8C7763CCeBFff684B74127412d6f33a7813A9da`](https://explorer-studio-dev.genlayer.com/address/0xa8C7763CCeBFff684B74127412d6f33a7813A9da) on GenLayer Studio Devnet (chain id `61997`)
- **Guard prompt hash:** `73ae6f1a24741a0bd4ef47c7032bab51083db3d40d6ebcdec0c6a908aab4fc57` - identical to the Bradbury deployment's, confirmed via `get_state().guard_prompt_hash` on-chain. Same guardian, same rule, different network.

## Why a separate file, not a flag on the real contract

GenVM v0.3 (what Studio Devnet runs) is a breaking-change major version from v0.2 (what Bradbury runs):

- `from genlayer import *` → `import genlayer as gl` + `from genlayer.types import *`
- `class Vault(gl.Contract)` → `class Vault(gl.contract.Contract)`
- `@allow_storage` → `@gl.storage.allow`
- `DynArray[...]` → `gl.storage.DynArray[...]`
- `gl.message_raw['datetime']` → `gl.message.raw['datetime']`
- `u256(0)` / `u32(...)` constructor calls → plain Python ints (the types still exist for annotations, just not as callable wrappers)
- Deploying/writing now requires an explicit non-zero `fees.distribution`/`feeValue` (`client.estimateTransactionFees({})` supplies sensible defaults) - omitting it reverts with `FeeValueMustBeNonZero`

None of this is optional syntax preference; a v0.2-style contract deployed as-is against Studio Devnet fails at the runner-loading stage before any Python code runs (`invalid_contract runner malformed`/`runner absent`, depending on the RPC path). Keeping this as a separate file rather than branching the real `vault.py` avoids maintaining two live API surfaces in one source file for a network that isn't the actual production target.

## Also: a genuine registry gap, reported and resolved

The `py-genlayer` runner hash that works on Bradbury and stable Studio (`studionet`, chain 61999) is not available on Studio Devnet's registry at all - confirmed directly via `gen_getContractSchemaForCode` (`invalid_contract runner absent`), and confirmed it wasn't just a stale-hash problem by downloading GenLayer's own latest public release (`genvm-manager` `v0.6.0-rc5`) and testing the one non-legacy `py-genlayer` package it contains - same result. Reported upstream: [genlayerlabs/genvm-manager#42](https://github.com/genlayerlabs/genvm-manager/issues/42). A GenLayer engineer confirmed the correct current hash (`py-genlayer:5jycge4q8k23462jtb0b9fyey1s9qz928sz2nbrd9mg4sxqg2qng`) directly on the issue - combined with the v0.3 API port above, that's what made this deployment succeed.

## Development

```bash
npm install
# DEPLOYER_PRIVATE_KEY in .env (gitignored, never commit a private key)
npm run deploy
```
