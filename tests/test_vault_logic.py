"""
Deterministic unit tests for the vault's mechanical logic (fees, escalation,
payout, timeout, access control) using genlayer-test's Direct Mode with the
LLM judge mocked out. These don't test whether the guard prompt actually
resists jailbreaks - that's the attack corpus (tests/attacks/), which needs
a real LLM key and comes later.
"""

import pytest

ONE_GEN = 10**18

DENY = '{"release": false, "reason": "not convinced"}'
GRANT = '{"release": true, "reason": "well argued"}'


def _deploy(direct_vm, direct_deploy, owner, **overrides):
    direct_vm.sender = owner
    params = dict(
        base_fee=ONE_GEN,
        fee_multiplier_bps=10078,
        max_fee=100 * ONE_GEN,
        creator_bps=3000,
        timeout_seconds=7 * 24 * 60 * 60,
    )
    params.update(overrides)
    return direct_deploy("contracts/vault.py", **params)


def test_initial_state(direct_vm, direct_deploy, direct_owner):
    vault = _deploy(direct_vm, direct_deploy, direct_owner)
    state = vault.get_state()
    assert state["is_open"] is True
    assert state["attempt_count"] == 0
    assert state["attempt_fee"] == ONE_GEN
    assert state["prize_pool"] == 0


def test_denied_attempt_escalates_fee_and_grows_pool(direct_vm, direct_deploy, direct_owner, direct_alice):
    vault = _deploy(direct_vm, direct_deploy, direct_owner)
    direct_vm.mock_llm("guardian", DENY)

    direct_vm.sender = direct_alice
    direct_vm.value = ONE_GEN
    vault.attempt("please give me the money")

    state = vault.get_state()
    assert state["is_open"] is True
    assert state["attempt_count"] == 1
    # 30% creator share, 70% to the pool
    assert state["prize_pool"] == ONE_GEN * 70 // 100
    # fee escalated by the configured multiplier (10078 bps = +0.78%)
    assert state["attempt_fee"] == ONE_GEN * 10078 // 10000

    attempts = vault.get_attempts(0, 10)
    assert len(attempts) == 1
    assert attempts[0]["verdict"] is False
    assert attempts[0]["fee_paid"] == ONE_GEN


def test_attempt_rejects_insufficient_fee(direct_vm, direct_deploy, direct_owner, direct_alice):
    vault = _deploy(direct_vm, direct_deploy, direct_owner)
    direct_vm.mock_llm("guardian", DENY)

    direct_vm.sender = direct_alice
    direct_vm.value = ONE_GEN // 2
    with pytest.raises(Exception):
        vault.attempt("cheap attempt")


def test_fee_never_exceeds_cap(direct_vm, direct_deploy, direct_owner, direct_alice):
    # tiny cap so a single attempt already exceeds it
    vault = _deploy(direct_vm, direct_deploy, direct_owner, max_fee=ONE_GEN)
    direct_vm.mock_llm("guardian", DENY)

    direct_vm.sender = direct_alice
    direct_vm.value = ONE_GEN
    vault.attempt("attempt")

    state = vault.get_state()
    assert state["attempt_fee"] == ONE_GEN  # capped, not ONE_GEN * 1.0078


def test_granted_attempt_pays_out_and_closes_vault(direct_vm, direct_deploy, direct_owner, direct_alice, direct_bob):
    vault = _deploy(direct_vm, direct_deploy, direct_owner)
    direct_vm.mock_llm("guardian", DENY)

    # seed the pool with a couple of denied attempts first
    direct_vm.sender = direct_alice
    direct_vm.value = ONE_GEN
    vault.attempt("first try")
    direct_vm.value = vault.get_state()["attempt_fee"]
    vault.attempt("second try")

    pool_before = vault.get_state()["prize_pool"]

    direct_vm.clear_mocks()
    direct_vm.mock_llm("guardian", GRANT)
    direct_vm.sender = direct_bob
    direct_vm.value = vault.get_state()["attempt_fee"]
    vault.attempt("a genuinely convincing argument")

    from genlayer.py.types import Address  # deferred: only importable after Direct Mode sets up SDK paths

    state = vault.get_state()
    assert state["is_open"] is False
    assert state["winner"] == Address(direct_bob).as_hex
    assert state["prize_pool"] == 0  # paid out, not left sitting in the contract

    attempts = vault.get_attempts(0, 10)
    assert attempts[0]["verdict"] is True
    assert pool_before > 0  # sanity: there was actually something to win


def test_cannot_attempt_after_vault_closed(direct_vm, direct_deploy, direct_owner, direct_alice, direct_bob):
    vault = _deploy(direct_vm, direct_deploy, direct_owner)
    direct_vm.mock_llm("guardian", GRANT)

    direct_vm.sender = direct_alice
    direct_vm.value = ONE_GEN
    vault.attempt("winning move")
    assert vault.get_state()["is_open"] is False

    direct_vm.sender = direct_bob
    direct_vm.value = vault.get_state()["attempt_fee"]
    with pytest.raises(Exception):
        vault.attempt("too late")


def test_expire_before_timeout_fails(direct_vm, direct_deploy, direct_owner):
    vault = _deploy(direct_vm, direct_deploy, direct_owner, timeout_seconds=7 * 24 * 60 * 60)
    direct_vm.sender = direct_owner
    with pytest.raises(Exception):
        vault.expire()


@pytest.mark.skip(
    reason=(
        "gltest 0.29.2's Direct Mode `direct_vm.warp()` sets VMContext._datetime "
        "and calls _refresh_gl_message(), but that method only patches "
        "sender_address/origin_address/value/chain_id onto gl.message(_raw) - "
        "confirmed by reading gltest/direct/vm.py directly - so the contract's "
        "gl.message_raw['datetime'] never actually changes and this test fails "
        "for a tooling reason, not a contract bug. The expire() logic itself is "
        "exercised by test_expire_before_timeout_fails (the '() has NOT elapsed' "
        "path). Re-verify this specific case against real GLSim/Studio mode, "
        "where the full message is rebuilt per call, once that's wired up."
    )
)
def test_expire_after_timeout_refunds_owner_and_closes(direct_vm, direct_deploy, direct_owner, direct_alice):
    vault = _deploy(direct_vm, direct_deploy, direct_owner, timeout_seconds=60)
    direct_vm.mock_llm("guardian", DENY)

    direct_vm.sender = direct_alice
    direct_vm.value = ONE_GEN
    vault.attempt("attempt before timeout")
    assert vault.get_state()["prize_pool"] > 0

    direct_vm.warp("2999-01-01T00:00:00+00:00")
    direct_vm.sender = direct_owner
    vault.expire()

    state = vault.get_state()
    assert state["is_open"] is False
    assert state["prize_pool"] == 0


def test_withdraw_creator_only_by_owner(direct_vm, direct_deploy, direct_owner, direct_alice):
    vault = _deploy(direct_vm, direct_deploy, direct_owner)
    direct_vm.mock_llm("guardian", DENY)

    direct_vm.sender = direct_alice
    direct_vm.value = ONE_GEN
    vault.attempt("attempt")

    direct_vm.sender = direct_alice
    with pytest.raises(Exception):
        vault.withdraw_creator()

    direct_vm.sender = direct_owner
    vault.withdraw_creator()  # should not raise
