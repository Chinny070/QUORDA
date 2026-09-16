# AGENTS.md — QUORDA

You are building QUORDA, not a generic AI/blockchain demo.

## Product contract

QUORDA is a neutral clearing layer where a buyer agent publishes an RFQ,
seller agents submit complex offers, and GenLayer reaches consensus on which
surviving bid best satisfies the buyer's declared trade-offs before an award
is committed.

## Authority boundary

- Deterministic rules: code (`contracts/quorda.py`: `filter_hard_constraints`, all state guards).
- Ambiguous product-specific judgment: the GenLayer Intelligent Contract's
  `judge_award` equivalence-principle block only.
- Consequence: one bid becomes `AWARDED`, the RFQ closes, and downstream
  purchase/contract formation can reference the award receipt
  (`get_award_receipt`).
- Frontend never invents chain truth — every state shown in the UI is read
  from the deployed contract, not computed client-side.

## Do not

- Not a generic procurement SaaS.
- Do not let an LLM evaluate hard numeric constraints (price/latency stay in
  `filter_hard_constraints`, fully deterministic, before `judge_award` runs).
- No escrow dependency.
- Hackathon bids are synthetic/public; privacy architecture is documented
  for production, not implemented here.
- Do not add a native token.
- Do not add a custodial backend.
- Do not use MetaMask Snaps; injected wallet only (`frontend/lib/genlayer/client.ts`).
- Do not present mocked data as live.
- Do not expose private keys or sensitive evidence.
- Do not deploy to Studionet (61999) or any chain other than Studio Next (61997).

## Before every merge

1. `genvm-lint check contracts/quorda.py --json` → must be `ok: true`.
2. `pytest tests/direct/ -v` → all pass.
3. Confirm UI buttons match contract-valid transitions — see
   `frontend/lib/lifecycle.ts::allowedActions` and its tests; this is the
   single source of truth, don't duplicate the logic elsewhere.
4. Re-run the clean, reject and uncertainty fixtures in
   `tests/integration/test_quorda_integration.py` against `studio_devnet`.
5. Update docs (`README.md`, `docs/DEPLOYMENT.md`) when method/state/evidence
   schemas change.
6. Record deployment/test evidence for submission in `docs/DEPLOYMENT.md`.
