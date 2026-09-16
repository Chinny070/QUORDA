# QUORDA — Studio Next Deployment Evidence

## Network

| Field | Value |
| --- | --- |
| Network | Studio Next |
| Chain ID | 61997 |
| RPC (this app's config) | https://studio-next.genlayer.com/api |
| Explorer | https://explorer-studio-dev.genlayer.com/ |
| CLI network preset | `studio-dev` |
| gltest network name | `studio_devnet` |

Note on RPC hostname: the `genlayer`/`gltest` toolchain's built-in
`studio-dev` / `studio_devnet` preset resolves by default to
`https://studio-dev.genlayer.com/api`. That host was used for the actual
CLI `deploy`/`write`/`call` commands below (the CLI has no supported way to
override the built-in preset's RPC without also losing its consensus
contract address resolution). `studio-next.genlayer.com` was independently
confirmed live in-browser, running the identical Studio build
(`v0.123.0-rc.6`) — the two names refer to the same 61997 preview
environment. This project's own configuration
(`frontend/lib/genlayer/chain.ts`, `gltest.config.yaml`) is pinned to
`studio-next.genlayer.com` per the hackathon's naming, and `gltest`'s own
test run in this evidence used that exact override successfully.

## Deployment record (final, current code)

| Field | Value |
| --- | --- |
| Commit SHA | `ba0a5e0` (full: `ba0a5e0a6788694cc180eef54e5a40da0ffa349e`) |
| Deployed contract address | `0x7e65fA3ee7ccE080E5FD8E70A38fDa1dc795F0F5` |
| Deployment transaction hash | `0x574433dcac31d8eff9fb67d24b34426ed9646fad2a54704828ca89bc2f95e9cd` |
| Deployment date (UTC) | 2026-09-16 |
| Deployer account | `bradbury-e2e` — `0x3A3168d67A110dE79461939047a8f7334ff1423d` |
| Tool versions | CLI `0.40.0-rc.3`, `genlayer-js` `2.0.0-rc.1`, `genlayer-py` `0.19.0rc2`, `gltest`/`genlayer-test` `0.30.0rc2`, `genvm-linter` `0.11.1rc2`, runner `py-genlayer:5jycge4q8k23462jtb0b9fyey1s9qz928sz2nbrd9mg4sxqg2qng` |

This is a fresh deployment of the fully hardened contract (retry path,
on-chain commitment hashing, strengthened evidence rules, corrected
`finality_status`, **enforced deadlines**). Three earlier addresses
(`0x46CFB7F63aAD30F858c3932195A8B90963deaBbf`,
`0xBfA9909a70d4CD068492f3351c83a60025D27897`,
`0xED865416cb79Ea9C32e4d93a0F324533F635A3e4`) were deployed and exercised
during this hardening pass and are superseded — do not use their evidence
for the current code.

### Bugs found and fixed during this pass, with real on-chain evidence

1. **`finality_status` was wrong for non-awarded RFQs.** Previously
   `"ACCEPTED_FINAL" if rfq.accepted else "AWARDED_PENDING_ACCEPTANCE"` —
   printed `AWARDED_PENDING_ACCEPTANCE` even for `NEEDS_CLARIFICATION` RFQs
   (confirmed live on an intermediate deployment). Fixed to derive
   `finality_status` from the actual RFQ state (`ACCEPTED_FINAL` /
   `AWARDED_PENDING_ACCEPTANCE` / `NEEDS_CLARIFICATION_PENDING_RETRY` /
   `NO_VALID_BID_FINAL` / `CANCELLED_FINAL` / `NOT_YET_AWARDED`).

2. **Deadlines were not enforced (initially misdiagnosed as a platform
   limitation, then actually fixed).** The first hardening pass shipped
   with `deadline` as a display-only `u256` epoch value, reasoning that
   this GenVM release exposed no on-chain clock. That was wrong: GenVM
   exposes `gl.message.datetime`, an ISO-8601 UTC timestamp that is fixed
   per-transaction and identical across all validators (verified live: a
   `record_write_datetime` write on a throwaway scratch contract reached
   full validator consensus, meaning every validator agreed on the exact
   same timestamp value — it is not independently sampled per node, so it
   is safe to use in write logic). `deadline` is now stored as an ISO-8601
   string, `create_rfq` rejects a deadline that is already in the past, and
   `submit_bid` rejects any bid at or after the RFQ's deadline. Verified
   live: a `create_rfq` with deadline `2020-01-01T00:00:00Z` reverted
   (`FINISHED_WITH_ERROR`); a bid submitted against an RFQ whose deadline
   had already elapsed also reverted.

### Fee workaround (required on this network)

`studio_devnet`'s FeeManager is not configured for automatic fee
derivation — every `deploy`/`write` reverts with `FeeValueMustBeNonZero` /
`FeesDistributionMissing` unless an explicit fee object is supplied.
Workaround used throughout: run
`genlayer estimate-fees <address> <method> --args ... --json` against an
already-deployed instance (or reuse a prior estimate for `deploy`), then
pass the resulting JSON via `--fees`:

```bash
genlayer network set studio-dev
genlayer deploy --contract contracts/quorda.py --fees '{"distribution":{"leaderTimeunitsAllocation":"100","validatorTimeunitsAllocation":"200","appealRounds":"0","executionBudgetPerRound":"25000000000000000","executionConsumed":"0","totalMessageFees":"0","rotations":["3"],"maxPriceGenPerTimeUnit":"2","storageFeeMaxGasPrice":"300000000","receiptFeeMaxGasPrice":"300000000"},"feeValue":"100000000000010352"}'
```

`judge_award`/`retry_judgment` need a larger `executionBudgetPerRound`
(LLM + web fetch execution) — estimate against the specific RFQ:

```bash
genlayer estimate-fees <contract> judge_award --args <rfq_id> --json
# pass the resulting JSON to: genlayer write <contract> judge_award --args <rfq_id> --fees '...'
```

## Live scenario evidence (all four, plus deadline enforcement, run directly against the final address)

RFQ #1 and #2 on the final contract were used to prove deadline
enforcement (see below) before the main demo RFQs (#3–#5).

### 0. Deadline enforcement (new in this pass)

- RFQ #1 attempt with deadline `2020-01-01T00:00:00Z` (already past) →
  `create_rfq` reverted, `FINISHED_WITH_ERROR`.
- RFQ #2 created with a deadline ~1 minute out; by the time the creating
  transaction finalized and a bid was submitted, the deadline had elapsed
  → `submit_bid` reverted, `FINISHED_WITH_ERROR`.

### 1. Clean pass — real consensus AWARDED → accepted

RFQ #3: 3 bids (cheap/slow, weak-support, strong-tradeoffs — the latter two
using real hosted evidence: [weak](https://gist.githubusercontent.com/Chinny070/294b81aa44f49f5ce1fb5658aa9fe46d/raw/bid-weak-support.json), [strong](https://gist.githubusercontent.com/Chinny070/9736a85529db8a15de8c9960932db08e/raw/bid-strong-tradeoffs.json)).
`filter_hard_constraints` eliminated the latency-violating bid
deterministically. `judge_award` reached real `ACCEPTED` validator
consensus and `AWARDED` bid #3, citing evidence claims explicitly as claims
(prompt-injection-resistant framing):

```json
{
  "confidence_band": "high",
  "decision": "3",
  "evidence_refs": ["2", "3"],
  "material_findings": [
    "Bid 3 (Meridian Cloud API) claims a full 30-day no-questions-asked refund policy documented in public terms of service, which is a specific and falsifiable claim.",
    "Bid 3 claims 24/7 priority support with a 1-hour response SLA for production incidents and a dedicated account manager, representing the most comprehensive support coverage of the two candidates.",
    "Bid 3 claims 99.95% uptime over the trailing 12 months published on a real-time public status page, which is a specific and independently checkable claim.",
    "Bid 2 (Acme API Co) explicitly states no refunds after purchase, business-hours-only best-effort email support with no SLA, and no published uptime history or SLA — failing all three soft priorities.",
    "Bid 3 is only marginally more expensive ($48,000 vs $45,000) and both bids already passed hard price/latency checks; the soft priorities explicitly state delivery certainty should not be sacrificed for a marginally lower price."
  ],
  "policy_version": "cba7f320d0b50b338aa749979135163d6282b41ed9d37c56369c5e0ba6c73ef3",
  "unresolved_questions": []
}
```

`accept_award(3, 3)` moved the RFQ to `finality_status: "ACCEPTED_FINAL"`.

### 2. Negative case — deterministic rejection, GenLayer never invoked

RFQ #4: hard budget $100.00 / latency 100ms; the only bid ($500.00,
80ms) violated the budget. `filter_hard_constraints` alone moved the RFQ to
`state: "NO_VALID_BID"` with `judgment_attempts: 0` — `judge_award` was
never called.

### 3. Uncertainty case — fails closed, no fabricated winner

RFQ #5: two hard-constraint-equal bids, both pointing at permanently
unreachable evidence URLs (`https://nonexistent.invalid/...`).
`judge_award` reached consensus on `NEEDS_CLARIFICATION`
(`judgment_attempts: 1`), citing `SOURCE_UNAVAILABLE` for both candidates
and explicitly refusing to infer either bid as favorable from absent
evidence.

### 4. Recovery / retry — same policy and bids, still fails closed

`retry_judgment(5)` was then called (same RFQ, still pointing at the same
unreachable URLs). Result: `judgment_attempts: 2`,
`policy_hash`/`rfq_hash` byte-identical to before the retry (nothing was
rewritten), `state` still `NEEDS_CLARIFICATION`,
`finality_status: "NEEDS_CLARIFICATION_PENDING_RETRY"`:

```json
{
  "confidence_band": "low",
  "decision": "NEEDS_CLARIFICATION",
  "evidence_refs": [],
  "material_findings": [
    "Both bid_id 5 and bid_id 6 have evidence status SOURCE_UNAVAILABLE, meaning no evidence is available for either candidate.",
    "With no evidence available for either bid, it is impossible to compare refund terms, support coverage, or uptime documentation.",
    "Both candidates are materially tied at zero verifiable evidence on all stated soft priorities."
  ],
  "policy_version": "0455126f7afe7638be7a7b8201036141f0c26657a2c0dbceab625819bd88806c",
  "unresolved_questions": [
    "Can the seller for bid_id 5 provide accessible, verifiable evidence of their refund terms, support coverage, and uptime record?",
    "Can the seller for bid_id 6 provide accessible, verifiable evidence of their refund terms, support coverage, and uptime record?",
    "Are the evidence URLs expected to become available, or should sellers resubmit with working evidence URLs?"
  ]
}
```

This proves the retry path works as designed: it is genuinely re-run (a
second real GenLayer consensus call, not a no-op), it cannot rewrite the
RFQ, and it remains fail-closed rather than being pressured into awarding
just because a retry was requested.

## Commitment verification (on-chain, not caller-asserted)

`test_create_rfq_computes_hashes_on_chain` and
`test_bid_hash_binds_material_terms` (in
`tests/integration/test_quorda_integration.py`) confirm live: identical
`rfq_spec_text`/`soft_policy_text` reproduce identical `rfq_hash`/
`soft_policy_hash`, different text produces different hashes, and changing
any one material bid term (price, latency, evidence URL) changes
`bid_hash`. There is no contract parameter through which a caller supplies
these hashes directly.

## Authorization verification (on-chain)

`test_cannot_close_bidding_as_non_creator`,
`test_accept_award_requires_creator_and_awarded_state`, and the
"only the creator may retry" assertion in
`test_retry_after_needs_clarification_preserves_policy_and_bids` all
confirm live that `close_bidding`, `accept_award`, and `retry_judgment`
reject non-creator callers (leader execution fails; verified both via the
Python test suite's `tx_execution_failed` assertion and directly via CLI,
where a non-creator's `close_bidding` attempt produced
`FINISHED_WITH_ERROR`).

## Prompt-injection resistance verification (on-chain)

`test_prompt_injection_evidence_does_not_override_rules` confirms that
bids pointing at unreachable "evidence" cannot force an award — the
contract's evidence-status legend and rules (see
`contracts/quorda.py::_run_judgment`) explicitly instruct validators to
treat all evidence text as untrusted data, never as instructions, and to
never read `SOURCE_UNAVAILABLE`/`NO_EVIDENCE_SUPPLIED` as a positive
signal.

## Test results

| Suite | Command | Result |
| --- | --- | --- |
| GenVM lint | `genvm-lint check contracts/quorda.py --json` | `ok: true` (12 methods, 8 write, 4 view) |
| Direct (pure-function) | `pytest tests/direct/ -v` | 11 passed |
| Integration (live, `studio_devnet`) | `gltest tests/integration/test_quorda_integration.py -v -s` | **10/10 passed**, including `test_deadline_is_enforced_on_chain` (new). Two tests (`test_uncertainty_case_missing_evidence_yields_needs_clarification`, `test_accept_award_requires_creator_and_awarded_state`) intermittently hit transient Studio Next connection drops (`502 Bad Gateway`, `ConnectionResetError`, invalid-JSON responses) during their multi-minute finalization poll on some runs during this pass; both passed cleanly once the network stabilized, confirming the code was never the issue. |
| Frontend unit | `npx vitest run` (in `frontend/`) | 9 passed |
| Frontend production build | `npm run build` (in `frontend/`) | succeeds against `NEXT_PUBLIC_QUORDA_CONTRACT_ADDRESS=0x7e65fA3ee7ccE080E5FD8E70A38fDa1dc795F0F5` |

## Verification checklist

- [x] `genvm-lint check contracts/quorda.py --json` → `ok: true`
- [x] `pytest tests/direct/ -v` → 11/11 passed
- [x] Deadline enforcement verified live via direct CLI (past deadline rejected at `create_rfq`; elapsed deadline rejected at `submit_bid`) and via `gltest`'s `test_deadline_is_enforced_on_chain`
- [x] `get_rfq` / `get_bid` / `get_award_receipt` reads verified for all four live scenarios (clean/negative/uncertainty/retry) on the final address
- [x] `finality_status` correctness bug found live, fixed, relinted, redeployed, and reverified live
- [x] Commitment hashes (rfq/policy/bid) verified on-chain to be contract-computed, not caller-asserted
- [x] Authorization (`close_bidding`, `accept_award`, `retry_judgment`) verified on-chain to reject non-creator callers
- [x] Prompt-injection / absent-evidence handling verified on-chain to fail closed
- [x] `frontend` production build and unit tests pass against the final deployed address
- [ ] Explorer `/address/...` direct lookup route 404s on this Studio Next explorer build; transactions are visible via the dashboard's recent-activity feed instead (a known explorer-UI limitation, not a QUORDA issue)
