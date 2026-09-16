"""
Integration tests for QUORDA against a live GenLayer network via `gltest`.

Run with:

    gltest tests/integration/test_quorda_integration.py -v -s --network studio_devnet

`studio_devnet` must be configured in gltest's network config (see
gltest.config.yaml at the repo root) pointing at Studio Next:
  rpc:   https://studio-next.genlayer.com/api
  chain: 61997

These tests exercise real non-deterministic GenLayer execution: the
judge_award() consensus call performs an actual LLM call and public web
evidence fetch, so validator consensus is genuinely exercised (per
Testing and Acceptance Specification: "at least one real non-deterministic
GenLayer call is exercised in the demo").

Mandatory scenarios (from the Compendium's Testing and Acceptance spec):
  1. Clean pass - buyer needs an API provider under hard budget/latency,
     preferring refund terms/support/uptime; correct bid wins.
  2. Negative case - a bid with a material hard-constraint violation must
     never survive to be awarded.
  3. Uncertainty case - contradictory/missing evidence must yield
     NEEDS_CLARIFICATION, never a fabricated award.
"""

import pytest
from gltest import get_contract_factory, get_accounts


SOFT_POLICY_TEXT = (
    "Prefer the bid with the strongest refund terms, most comprehensive "
    "support coverage and best documented uptime. Delivery certainty "
    "(low variance / high reliability) should not be sacrificed for a "
    "marginally lower price among bids that already meet the hard budget "
    "and latency requirements."
)


@pytest.fixture
def accounts():
    return get_accounts()


@pytest.fixture
def quorda_factory():
    return get_contract_factory("QuordaContract")


def _deploy(quorda_factory, buyer):
    return quorda_factory.deploy(account=buyer)


def test_clean_pass_awards_best_tradeoff_bid(quorda_factory, accounts):
    buyer, seller_a, seller_b, seller_c = accounts[0], accounts[1], accounts[2], accounts[3]
    contract = _deploy(quorda_factory, buyer)

    rfq_id = contract.create_rfq(
        args=[
            "rfq-hash-clean-demo",
            9999999999,
            50000,  # $500.00 hard budget
            300,  # 300ms hard latency ceiling
            "policy-hash-clean-demo",
            SOFT_POLICY_TEXT,
        ],
        account=buyer,
    )

    # Cheapest, but violates the hard latency ceiling.
    contract.submit_bid(
        args=[rfq_id, "bid-cheap-slow", 15000, 900,
              "https://example.com/quorda-demo/bid-cheap-slow.json"],
        account=seller_a,
    )
    # Passes hard checks but has weak support/refund/uptime evidence.
    contract.submit_bid(
        args=[rfq_id, "bid-weak-support", 45000, 250,
              "https://example.com/quorda-demo/bid-weak-support.json"],
        account=seller_b,
    )
    # Passes hard checks and has the strongest soft-priority evidence.
    contract.submit_bid(
        args=[rfq_id, "bid-strong-tradeoffs", 48000, 220,
              "https://example.com/quorda-demo/bid-strong-tradeoffs.json"],
        account=seller_c,
    )

    contract.close_bidding(args=[rfq_id], account=buyer)
    contract.filter_hard_constraints(args=[rfq_id], account=buyer)

    filtered = contract.get_rfq(args=[rfq_id])
    assert filtered["state"] == "FILTERED"

    contract.judge_award(args=[rfq_id], account=buyer)

    rfq = contract.get_rfq(args=[rfq_id])
    assert rfq["state"] in ("AWARDED", "NEEDS_CLARIFICATION")
    # The cheap-but-slow bid must never be reachable as a winner: it was
    # eliminated deterministically before any GenLayer call happened.
    assert rfq["winning_bid_id"] != 1

    receipt = contract.get_award_receipt(args=[rfq_id])
    assert receipt["policy_hash"] == "policy-hash-clean-demo"
    assert "decision" in receipt["verdict"]


def test_negative_case_hard_violation_never_wins(quorda_factory, accounts):
    buyer, seller_a = accounts[0], accounts[1]
    contract = _deploy(quorda_factory, buyer)

    rfq_id = contract.create_rfq(
        args=[
            "rfq-hash-negative-demo",
            9999999999,
            10000,  # $100.00 hard budget
            100,  # 100ms hard latency ceiling
            "policy-hash-negative-demo",
            SOFT_POLICY_TEXT,
        ],
        account=buyer,
    )

    contract.submit_bid(
        args=[rfq_id, "bid-over-budget", 50000, 80,
              "https://example.com/quorda-demo/bid-over-budget.json"],
        account=seller_a,
    )

    contract.close_bidding(args=[rfq_id], account=buyer)
    contract.filter_hard_constraints(args=[rfq_id], account=buyer)

    rfq = contract.get_rfq(args=[rfq_id])
    assert rfq["state"] == "NO_VALID_BID"

    bid = contract.get_bid(args=[1])
    assert bid["eliminated"] is True
    assert bid["elimination_reason"] == "EXCEEDS_HARD_BUDGET"

    # judge_award must refuse to run judgment over zero surviving bids.
    contract.judge_award(args=[rfq_id], account=buyer)
    rfq_after = contract.get_rfq(args=[rfq_id])
    assert rfq_after["state"] == "NO_VALID_BID"
    assert rfq_after["winning_bid_id"] == 0


def test_uncertainty_case_missing_evidence_yields_needs_clarification(
    quorda_factory, accounts
):
    buyer, seller_a, seller_b = accounts[0], accounts[1], accounts[2]
    contract = _deploy(quorda_factory, buyer)

    rfq_id = contract.create_rfq(
        args=[
            "rfq-hash-uncertain-demo",
            9999999999,
            50000,
            300,
            "policy-hash-uncertain-demo",
            SOFT_POLICY_TEXT,
        ],
        account=buyer,
    )

    # Both bids are hard-constraint-equal and BOTH point at unresolvable
    # evidence URLs, so there is no independently checkable basis to
    # prefer either bid on the stated soft priorities.
    contract.submit_bid(
        args=[rfq_id, "bid-unverifiable-1", 40000, 200,
              "https://nonexistent.invalid/quorda-demo/a.json"],
        account=seller_a,
    )
    contract.submit_bid(
        args=[rfq_id, "bid-unverifiable-2", 40000, 200,
              "https://nonexistent.invalid/quorda-demo/b.json"],
        account=seller_b,
    )

    contract.close_bidding(args=[rfq_id], account=buyer)
    contract.filter_hard_constraints(args=[rfq_id], account=buyer)
    contract.judge_award(args=[rfq_id], account=buyer)

    rfq = contract.get_rfq(args=[rfq_id])
    # Must fail closed rather than hallucinate a winner from absent evidence.
    assert rfq["state"] == "NEEDS_CLARIFICATION"
    assert rfq["winning_bid_id"] == 0


def test_accept_award_requires_creator_and_awarded_state(quorda_factory, accounts):
    buyer, seller_a = accounts[0], accounts[1]
    contract = _deploy(quorda_factory, buyer)

    rfq_id = contract.create_rfq(
        args=[
            "rfq-hash-accept-demo",
            9999999999,
            50000,
            300,
            "policy-hash-accept-demo",
            SOFT_POLICY_TEXT,
        ],
        account=buyer,
    )
    contract.submit_bid(
        args=[rfq_id, "bid-only", 20000, 150,
              "https://example.com/quorda-demo/bid-only.json"],
        account=seller_a,
    )
    contract.close_bidding(args=[rfq_id], account=buyer)
    contract.filter_hard_constraints(args=[rfq_id], account=buyer)
    contract.judge_award(args=[rfq_id], account=buyer)

    rfq = contract.get_rfq(args=[rfq_id])
    assert rfq["state"] == "AWARDED"
    assert rfq["winning_bid_id"] == 1

    contract.accept_award(args=[rfq_id, 1], account=buyer)
    receipt = contract.get_award_receipt(args=[rfq_id])
    assert receipt["accepted"] is True
    assert receipt["finality_status"] == "ACCEPTED_FINAL"
