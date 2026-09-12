"""
Phase 2: fires the full attack corpus (tests/attacks/*.txt) at a live,
Gemini-backed GLSim deployment in "unbreakable" mode and records what
happens. Writes a markdown report to tests/attacks/RESULTS.md.

    # terminal 1
    python scripts/run_glsim.py --llm-provider gemini:gemini-3.6-flash

    # terminal 2
    python -m pytest tests/run_attacks.py -v -s

Every attempt fires 4 real Gemini calls (leader + 3 validators). Gemini's
free tier is capped at 15 requests/minute, so attempts are paced ~20s apart
(4 calls / 20s = 12/min, under the cap) - without pacing, a 429 resolves to
a safe denial that's indistinguishable from a real one, which would make
this corpus meaningless. A full run takes roughly 10-15 minutes.

Not part of the automated test suite (hits a real API, takes real wall-clock
time) - run by hand, and after any change to the guard prompt.
"""

import time
from pathlib import Path

from gltest import get_contract_factory, get_default_account, get_accounts, get_gl_client

ONE_GEN = 10**18
ATTACKS_DIR = Path(__file__).parent / "attacks"
RESULTS_PATH = ATTACKS_DIR / "RESULTS.md"
PACE_SECONDS = 20


def load_attacks() -> list[tuple[str, str]]:
    files = sorted(ATTACKS_DIR.glob("*.txt"))
    return [(f.stem, f.read_text().strip()) for f in files]


def test_run_attack_corpus():
    attacks = load_attacks()
    assert len(attacks) >= 25, f"expected 25+ attack files, found {len(attacks)}"

    factory = get_contract_factory(contract_file_path="vault.py")
    owner = get_default_account()
    attacker = get_accounts()[1]
    client = get_gl_client()

    vault = factory.deploy(
        args=[ONE_GEN, 10078, 100 * ONE_GEN, 3000, 7 * 24 * 60 * 60],
        account=owner,
    )
    address = vault.address
    print("Deployed at:", address)

    client.provider.make_request(
        method="sim_fundAccount", params=[attacker.address, 10000 * ONE_GEN]
    )

    def state():
        return client.read_contract(address, "get_state", args=[])

    rows: list[dict] = []

    for i, (name, message) in enumerate(attacks):
        if i > 0:
            time.sleep(PACE_SECONDS)

        fee = state()["attempt_fee"]
        count_before = state()["attempt_count"]
        print(f"\n[{i + 1}/{len(attacks)}] {name} (fee={fee / ONE_GEN:.4f} GEN)")

        try:
            tx_hash = client.write_contract(
                address, "attempt", account=attacker, value=fee, args=[message]
            )
            client.wait_for_transaction_receipt(tx_hash)
        except Exception as exc:  # noqa: BLE001 - recording failures, not raising
            rows.append(
                {
                    "name": name,
                    "verdict": None,
                    "reason": f"transaction error: {exc}",
                    "recorded": False,
                }
            )
            print("  -> transaction error:", exc)
            continue

        current = state()
        if current["attempt_count"] == count_before:
            # Consensus didn't reach a recordable outcome (e.g. rolled back).
            rows.append(
                {
                    "name": name,
                    "verdict": None,
                    "reason": "no attempt recorded (rolled back / consensus not reached)",
                    "recorded": False,
                }
            )
            print("  -> not recorded (rolled back)")
            continue

        latest = client.read_contract(address, "get_attempts", args=[0, 1])[0]
        rows.append(
            {
                "name": name,
                "verdict": latest["verdict"],
                "reason": latest["reason"],
                "recorded": True,
            }
        )
        print(f"  -> verdict={latest['verdict']}")

        if latest["verdict"]:
            print("  !! RELEASED - stopping early, vault is now closed !!")
            break

    lines = [
        "# Attack corpus results",
        "",
        f"Guard prompt hash: `{state()['guard_prompt_hash']}`",
        "",
        "| # | Attack | Recorded | Verdict | Reason |",
        "|---|--------|----------|---------|--------|",
    ]
    for i, row in enumerate(rows):
        verdict = "—" if row["verdict"] is None else ("RELEASED" if row["verdict"] else "denied")
        lines.append(
            f"| {i + 1} | {row['name']} | {row['recorded']} | {verdict} | {row['reason']} |"
        )
    RESULTS_PATH.write_text("\n".join(lines) + "\n")
    print(f"\nWrote {RESULTS_PATH}")

    releases = [r for r in rows if r["verdict"] is True]
    unrecorded = [r for r in rows if not r["recorded"]]
    print(f"\n{len(rows)}/{len(attacks)} attacks fired, {len(releases)} released, {len(unrecorded)} not recorded")

    assert not releases, f"guard prompt was bypassed by: {[r['name'] for r in releases]}"
