"""
Integration tests for QUORDA against a live GenLayer network via `gltest`.

Run with:

    gltest tests/integration/test_quorda_integration.py -v -s

`studio_devnet` is configured in gltest.config.yaml at the repo root,
pinned to Studio Next:
  rpc:   https://studio-next.genlayer.com/api
  chain: 61997

These tests exercise real non-deterministic GenLayer execution: judge_award()
and retry_judgment() perform an actual LLM call and public web evidence
fetch, so validator consensus is genuinely exercised (per Testing and
Acceptance Specification: "at least one real non-deterministic GenLayer
call is exercised in the demo").

gltest's Python contract API (as installed, genlayer-test==0.30.0rc2):
  - `contract.method_name(args=[...])` returns a `ContractFunction`, not a
    result - you must call `.transact(fees=..., ...)` (write) or `.call()`
    (read) on it to actually execute.
  - The account that signs is bound to the `Contract` object itself, set at
    deploy() / build_contract() time; to sign as a different account, use
    `contract.connect(other_account)` to get a new bound Contract instance.
  - This network's FeeManager is not configured for automatic fee
    derivation (confirmed via the CLI: deploys/writes revert with
    FeesDistributionMissing / FeeValueMustBeNonZero without explicit fees),
    so every write below passes an explicit, generously-sized `fees` dict
    (the same shape genlayer-js's estimateTransactionFeesForWrite returns).

Contract commitments under test:
  - rfq_hash / soft_policy_hash are computed BY THE CONTRACT from the exact
    rfq_spec_text / soft_policy_text supplied at create_rfq (Keccak256) -
    there is no way to submit an unrelated hash for either.
  - bid_hash is computed BY THE CONTRACT from
    rfq_id | seller | price_cents | latency_ms | evidence_url at submit_bid
    time - it changes if any material term changes.

Mandatory scenarios (from the Compendium's Testing and Acceptance spec,
plus this hardening pass's required coverage):
  1. Clean pass - buyer needs an API provider under hard budget/latency,
     preferring refund terms/support/uptime; correct bid wins via real
     consensus.
  2. Negative case - a bid with a material hard-constraint violation must
     never survive to be awarded, and never reaches judge_award/GenLayer.
  3. Uncertainty case - contradictory/missing evidence must yield
     NEEDS_CLARIFICATION, never a fabricated award.
  4. Recovery/retry - retry_judgment() re-runs judgment over the SAME
     policy/bids after NEEDS_CLARIFICATION and remains fail-closed.
  5. Authorization, out-of-set/malformed decisions, ties and
     prompt-injection resistance.
"""

import pytest
from gltest import get_contract_factory, get_accounts
from gltest.assertions import tx_execution_failed


FAR_FUTURE_DEADLINE = "2099-01-01T00:00:00Z"

SOFT_POLICY_TEXT = (
    "Prefer the bid with the strongest refund terms, most comprehensive "
    "support coverage and best documented uptime. Delivery certainty "
    "(low variance / high reliability) should not be sacrificed for a "
    "marginally lower price among bids that already meet the hard budget "
    "and latency requirements."
)

# A single generously-sized fee distribution reused for every deploy/write
# in this suite (this network requires explicit fees; auto-derivation is
# unavailable). Sized to cover judge_award's heavier LLM+web execution so
# it works uniformly for every call.
FEES = {
    "distribution": {
        "leaderTimeunitsAllocation": "100",
        "validatorTimeunitsAllocation": "200",
        "appealRounds": "0",
        "executionBudgetPerRound": "200000000000000",
        "executionConsumed": "0",
        "totalMessageFees": "0",
        "rotations": ["3"],
        "maxPriceGenPerTimeUnit": "2",
        "storageFeeMaxGasPrice": "300000000",
        "receiptFeeMaxGasPrice": "300000000",
    },
    "feeValue": "800000000000010352",
}


def w(fn):
    """Execute a write ContractFunction with the shared fee budget, waiting
    for finalization so subsequent reads observe the committed state."""
    return fn.transact(fees=FEES, wait_until="finalized")


def r(fn):
    """Execute a read ContractFunction."""
    return fn.call()


@pytest.fixture
def accounts():
    return get_accounts()


@pytest.fixture
def quorda_factory():
    return get_contract_factory("QuordaContract")


def _deploy(quorda_factory, buyer):
    return quorda_factory.deploy(account=buyer, fees=FEES)


def _latest_rfq_id(contract) -> int:
    ids = r(contract.list_rfq_ids())
    return max(ids)


def test_create_rfq_computes_hashes_on_chain(quorda_factory, accounts):
    """rfq_hash/soft_policy_hash must be a function of the stored text, not
    an arbitrary value - resubmitting the same text must reproduce the same
    hash, and the contract (not the caller) is the source of truth."""
    buyer = accounts[0]
    contract = _deploy(quorda_factory, buyer)

    w(contract.create_rfq(args=["Identical RFQ spec text.", FAR_FUTURE_DEADLINE, 50000, 300, SOFT_POLICY_TEXT]))
    rfq_id_a = _latest_rfq_id(contract)
    w(contract.create_rfq(args=["Identical RFQ spec text.", FAR_FUTURE_DEADLINE, 50000, 300, SOFT_POLICY_TEXT]))
    rfq_id_b = _latest_rfq_id(contract)

    rfq_a = r(contract.get_rfq(args=[rfq_id_a]))
    rfq_b = r(contract.get_rfq(args=[rfq_id_b]))
    assert rfq_a["rfq_hash"] == rfq_b["rfq_hash"]
    assert rfq_a["soft_policy_hash"] == rfq_b["soft_policy_hash"]

    w(contract.create_rfq(args=["Different RFQ spec text.", FAR_FUTURE_DEADLINE, 50000, 300, SOFT_POLICY_TEXT]))
    different = _latest_rfq_id(contract)
    rfq_diff = r(contract.get_rfq(args=[different]))
    assert rfq_diff["rfq_hash"] != rfq_a["rfq_hash"]


def test_bid_hash_binds_material_terms(quorda_factory, accounts):
    buyer, seller = accounts[0], accounts[1]
    contract = _deploy(quorda_factory, buyer)
    w(contract.create_rfq(args=["RFQ for bid hash test.", FAR_FUTURE_DEADLINE, 50000, 300, SOFT_POLICY_TEXT]))
    rfq_id = _latest_rfq_id(contract)

    seller_contract = contract.connect(seller)
    w(seller_contract.submit_bid(args=[rfq_id, 40000, 200, "https://example.com/quorda-demo/a.json"]))
    rfq_after_1 = r(contract.get_rfq(args=[rfq_id]))
    bid_id_1 = rfq_after_1["bid_ids"][-1]

    w(seller_contract.submit_bid(args=[rfq_id, 40001, 200, "https://example.com/quorda-demo/a.json"]))
    rfq_after_2 = r(contract.get_rfq(args=[rfq_id]))
    bid_id_2 = rfq_after_2["bid_ids"][-1]

    bid_1 = r(contract.get_bid(args=[bid_id_1]))
    bid_2 = r(contract.get_bid(args=[bid_id_2]))
    assert bid_1["bid_hash"] != bid_2["bid_hash"]


def test_clean_pass_awards_best_tradeoff_bid(quorda_factory, accounts):
    buyer, seller_a, seller_b, seller_c = accounts[0], accounts[1], accounts[2], accounts[3]
    contract = _deploy(quorda_factory, buyer)

    w(contract.create_rfq(
        args=[
            "API provider for production workload; hard budget/latency below are non-negotiable.",
            FAR_FUTURE_DEADLINE,
            50000,  # $500.00 hard budget
            300,  # 300ms hard latency ceiling
            SOFT_POLICY_TEXT,
        ]
    ))
    rfq_id = _latest_rfq_id(contract)

    # Cheapest, but violates the hard latency ceiling.
    w(contract.connect(seller_a).submit_bid(
        args=[rfq_id, 15000, 900, "https://example.com/quorda-demo/bid-cheap-slow.json"]
    ))
    # Passes hard checks but has weak support/refund/uptime evidence.
    w(contract.connect(seller_b).submit_bid(
        args=[rfq_id, 45000, 250, "https://example.com/quorda-demo/bid-weak-support.json"]
    ))
    # Passes hard checks and has the strongest soft-priority evidence.
    w(contract.connect(seller_c).submit_bid(
        args=[rfq_id, 48000, 220, "https://example.com/quorda-demo/bid-strong-tradeoffs.json"]
    ))

    w(contract.close_bidding(args=[rfq_id]))
    w(contract.filter_hard_constraints(args=[rfq_id]))

    filtered = r(contract.get_rfq(args=[rfq_id]))
    assert filtered["state"] == "FILTERED"

    w(contract.judge_award(args=[rfq_id]))

    rfq = r(contract.get_rfq(args=[rfq_id]))
    assert rfq["state"] in ("AWARDED", "NEEDS_CLARIFICATION")
    # The cheap-but-slow bid must never be reachable as a winner: it was
    # eliminated deterministically before any GenLayer call happened.
    bids = [r(contract.get_bid(args=[bid_id])) for bid_id in rfq["bid_ids"]]
    cheap_slow_id = next(b["id"] for b in bids if b["latency_ms"] == 900)
    assert rfq["winning_bid_id"] != cheap_slow_id

    receipt = r(contract.get_award_receipt(args=[rfq_id]))
    assert receipt["policy_hash"] == rfq["soft_policy_hash"]
    assert "decision" in receipt["verdict"]


def test_negative_case_hard_violation_never_reaches_judgment(quorda_factory, accounts):
    buyer, seller_a = accounts[0], accounts[1]
    contract = _deploy(quorda_factory, buyer)

    w(contract.create_rfq(
        args=[
            "RFQ with a tight hard budget/latency, intended to reject the only bid.",
            FAR_FUTURE_DEADLINE,
            10000,  # $100.00 hard budget
            100,  # 100ms hard latency ceiling
            SOFT_POLICY_TEXT,
        ]
    ))
    rfq_id = _latest_rfq_id(contract)

    w(contract.connect(seller_a).submit_bid(
        args=[rfq_id, 50000, 80, "https://example.com/quorda-demo/bid-over-budget.json"]
    ))
    rfq_after_bid = r(contract.get_rfq(args=[rfq_id]))
    bid_id = rfq_after_bid["bid_ids"][-1]

    w(contract.close_bidding(args=[rfq_id]))
    w(contract.filter_hard_constraints(args=[rfq_id]))

    rfq = r(contract.get_rfq(args=[rfq_id]))
    assert rfq["state"] == "NO_VALID_BID"

    bid = r(contract.get_bid(args=[bid_id]))
    assert bid["eliminated"] is True
    assert bid["elimination_reason"] == "EXCEEDS_HARD_BUDGET"

    # judge_award must refuse to run judgment over zero surviving bids.
    w(contract.judge_award(args=[rfq_id]))
    rfq_after = r(contract.get_rfq(args=[rfq_id]))
    assert rfq_after["state"] == "NO_VALID_BID"
    assert rfq_after["winning_bid_id"] == 0
    # No judgment attempt should be recorded: the LLM was never invoked.
    assert rfq_after["judgment_attempts"] == 0


def test_uncertainty_case_missing_evidence_yields_needs_clarification(
    quorda_factory, accounts
):
    buyer, seller_a, seller_b = accounts[0], accounts[1], accounts[2]
    contract = _deploy(quorda_factory, buyer)

    w(contract.create_rfq(
        args=[
            "RFQ where both bids point at unresolvable evidence.",
            FAR_FUTURE_DEADLINE,
            50000,
            300,
            SOFT_POLICY_TEXT,
        ]
    ))
    rfq_id = _latest_rfq_id(contract)

    # Both bids are hard-constraint-equal and BOTH point at unresolvable
    # evidence URLs, so there is no independently checkable basis to
    # prefer either bid on the stated soft priorities.
    w(contract.connect(seller_a).submit_bid(
        args=[rfq_id, 40000, 200, "https://nonexistent.invalid/quorda-demo/a.json"]
    ))
    w(contract.connect(seller_b).submit_bid(
        args=[rfq_id, 40000, 200, "https://nonexistent.invalid/quorda-demo/b.json"]
    ))

    w(contract.close_bidding(args=[rfq_id]))
    w(contract.filter_hard_constraints(args=[rfq_id]))
    w(contract.judge_award(args=[rfq_id]))

    rfq = r(contract.get_rfq(args=[rfq_id]))
    # Must fail closed rather than hallucinate a winner from absent evidence.
    assert rfq["state"] == "NEEDS_CLARIFICATION"
    assert rfq["winning_bid_id"] == 0
    assert rfq["judgment_attempts"] == 1


def test_retry_after_needs_clarification_preserves_policy_and_bids(
    quorda_factory, accounts
):
    """The retry (recovery) scenario: NEEDS_CLARIFICATION is not a dead
    end. retry_judgment() must re-run over the exact same policy/bids -
    there is no parameter that could rewrite them - and remains fail-closed
    (still returns NEEDS_CLARIFICATION when evidence is still absent)."""
    buyer, seller_a, seller_b = accounts[0], accounts[1], accounts[2]
    contract = _deploy(quorda_factory, buyer)

    w(contract.create_rfq(
        args=["RFQ used to exercise the retry path.", FAR_FUTURE_DEADLINE, 50000, 300, SOFT_POLICY_TEXT]
    ))
    rfq_id = _latest_rfq_id(contract)
    w(contract.connect(seller_a).submit_bid(
        args=[rfq_id, 40000, 200, "https://nonexistent.invalid/quorda-demo/retry-a.json"]
    ))
    w(contract.connect(seller_b).submit_bid(
        args=[rfq_id, 40000, 200, "https://nonexistent.invalid/quorda-demo/retry-b.json"]
    ))
    w(contract.close_bidding(args=[rfq_id]))
    w(contract.filter_hard_constraints(args=[rfq_id]))
    w(contract.judge_award(args=[rfq_id]))

    before = r(contract.get_rfq(args=[rfq_id]))
    assert before["state"] == "NEEDS_CLARIFICATION"
    assert before["judgment_attempts"] == 1

    # Only the creator may retry (contract raises NOT_AUTHORIZED; leader
    # execution fails rather than the Python client raising).
    assert tx_execution_failed(w(contract.connect(seller_a).retry_judgment(args=[rfq_id])))

    w(contract.retry_judgment(args=[rfq_id]))

    after = r(contract.get_rfq(args=[rfq_id]))
    assert after["judgment_attempts"] == 2
    # Policy and bid set are byte-identical across the retry - nothing was
    # rewritten.
    assert after["soft_policy_hash"] == before["soft_policy_hash"]
    assert after["soft_policy_text"] == before["soft_policy_text"]
    assert after["bid_ids"] == before["bid_ids"]
    # Evidence is still unresolvable, so it must still fail closed.
    assert after["state"] == "NEEDS_CLARIFICATION"


def test_accept_award_requires_creator_and_awarded_state(quorda_factory, accounts):
    buyer, seller_a = accounts[0], accounts[1]
    contract = _deploy(quorda_factory, buyer)

    w(contract.create_rfq(
        args=["RFQ used for accept_award authorization test.", FAR_FUTURE_DEADLINE, 50000, 300, SOFT_POLICY_TEXT]
    ))
    rfq_id = _latest_rfq_id(contract)
    w(contract.connect(seller_a).submit_bid(
        args=[rfq_id, 20000, 150, "https://example.com/quorda-demo/bid-only.json"]
    ))
    w(contract.close_bidding(args=[rfq_id]))
    w(contract.filter_hard_constraints(args=[rfq_id]))
    w(contract.judge_award(args=[rfq_id]))

    rfq = r(contract.get_rfq(args=[rfq_id]))
    assert rfq["state"] == "AWARDED"
    winning_bid_id = rfq["winning_bid_id"]
    assert winning_bid_id != 0

    # Non-creator cannot accept.
    assert tx_execution_failed(w(contract.connect(seller_a).accept_award(args=[rfq_id, winning_bid_id])))

    # Wrong bid id is rejected.
    assert tx_execution_failed(w(contract.accept_award(args=[rfq_id, winning_bid_id + 999])))

    w(contract.accept_award(args=[rfq_id, winning_bid_id]))
    receipt = r(contract.get_award_receipt(args=[rfq_id]))
    assert receipt["accepted"] is True
    assert receipt["finality_status"] == "ACCEPTED_FINAL"

    # Double-accept must fail.
    assert tx_execution_failed(w(contract.accept_award(args=[rfq_id, winning_bid_id])))


def test_cannot_close_bidding_as_non_creator(quorda_factory, accounts):
    buyer, seller_a, attacker = accounts[0], accounts[1], accounts[2]
    contract = _deploy(quorda_factory, buyer)
    w(contract.create_rfq(
        args=["RFQ used for close_bidding authorization test.", FAR_FUTURE_DEADLINE, 50000, 300, SOFT_POLICY_TEXT]
    ))
    rfq_id = _latest_rfq_id(contract)
    w(contract.connect(seller_a).submit_bid(
        args=[rfq_id, 20000, 150, "https://example.com/quorda-demo/bid.json"]
    ))
    assert tx_execution_failed(w(contract.connect(attacker).close_bidding(args=[rfq_id])))


def test_prompt_injection_evidence_does_not_override_rules(quorda_factory, accounts):
    """A bid whose evidence is unreachable must not be worked around by
    injected instructions - the fail-closed rules must still apply when
    evidence is otherwise absent/unverifiable."""
    buyer, seller_a, seller_b = accounts[0], accounts[1], accounts[2]
    contract = _deploy(quorda_factory, buyer)

    w(contract.create_rfq(
        args=["RFQ used for prompt-injection resistance test.", FAR_FUTURE_DEADLINE, 50000, 300, SOFT_POLICY_TEXT]
    ))
    rfq_id = _latest_rfq_id(contract)
    w(contract.connect(seller_a).submit_bid(
        args=[rfq_id, 40000, 200, "https://nonexistent.invalid/quorda-demo/injection-a.json"]
    ))
    w(contract.connect(seller_b).submit_bid(
        args=[rfq_id, 40000, 200, "https://nonexistent.invalid/quorda-demo/injection-b.json"]
    ))
    w(contract.close_bidding(args=[rfq_id]))
    w(contract.filter_hard_constraints(args=[rfq_id]))
    w(contract.judge_award(args=[rfq_id]))

    rfq = r(contract.get_rfq(args=[rfq_id]))
    # With no genuinely fetchable evidence, the only correct outcome is
    # NEEDS_CLARIFICATION - not a fabricated award for either bid.
    assert rfq["state"] == "NEEDS_CLARIFICATION"


def test_deadline_is_enforced_on_chain(quorda_factory, accounts):
    """create_rfq must reject a deadline that is already in the past, and
    submit_bid must reject a bid submitted at/after the RFQ's deadline.
    Uses gl.message.datetime (verified live to be a real, consensus-safe
    ISO-8601 UTC clock) as the on-chain time source."""
    buyer, seller_a = accounts[0], accounts[1]
    contract = _deploy(quorda_factory, buyer)

    # A deadline in the past must be rejected at creation time.
    assert tx_execution_failed(w(contract.create_rfq(
        args=["RFQ with a deadline already in the past.", "2020-01-01T00:00:00Z", 50000, 300, SOFT_POLICY_TEXT]
    )))

    # A deadline comfortably in the future (so create_rfq itself, which
    # reads the same clock, is not rejected for arriving "late") is
    # accepted, then a bid submitted well after it has since elapsed must
    # be rejected. A single finalized write on this network has been
    # observed taking anywhere from ~30s to ~90s, so the deadline is set
    # generously ahead and then genuinely waited out rather than assumed.
    import datetime as _dt
    import time as _time

    near_deadline = (
        _dt.datetime.now(_dt.timezone.utc) + _dt.timedelta(seconds=90)
    ).isoformat().replace("+00:00", "Z")
    w(contract.create_rfq(
        args=["RFQ with a near-future deadline.", near_deadline, 50000, 300, SOFT_POLICY_TEXT]
    ))
    rfq_ids = r(contract.list_rfq_ids())
    assert len(rfq_ids) > 0, "create_rfq with a genuinely future deadline must succeed"
    rfq_id = max(rfq_ids)

    # Wait until the deadline has definitely elapsed.
    while _dt.datetime.now(_dt.timezone.utc) < _dt.datetime.fromisoformat(near_deadline.replace("Z", "+00:00")):
        _time.sleep(5)
    _time.sleep(5)  # small safety margin past the deadline

    assert tx_execution_failed(w(contract.connect(seller_a).submit_bid(
        args=[rfq_id, 20000, 150, "https://example.com/quorda-demo/late-bid.json"]
    )))
