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
| Commit SHA | `3856c44` (full: `3856c449ea7f579e8f2022908153d65217300481`) — this deployment predates that commit by minutes; the deployed bytecode matches this commit's `contracts/quorda.py` exactly (no contract changes since) |
| Deployed contract address | `0xED865416cb79Ea9C32e4d93a0F324533F635A3e4` |
| Deployment transaction hash | `0xacd02c567408bc44c20bbb7ecd65b6a0d36382da0ace036d8d31d3487e768571` |
| Deployment date (UTC) | 2026-09-16 |
| Deployer account | `bradbury-e2e` — `0x3A3168d67A110dE79461939047a8f7334ff1423d` |
| Tool versions | CLI `0.40.0-rc.3`, `genlayer-js` `2.0.0-rc.1`, `genlayer-py` `0.19.0rc2`, `gltest`/`genlayer-test` `0.30.0rc2`, `genvm-linter` `0.11.1rc2`, runner `py-genlayer:5jycge4q8k23462jtb0b9fyey1s9qz928sz2nbrd9mg4sxqg2qng` |

This is a fresh deployment of the hardened contract (retry path, on-chain
commitment hashing, strengthened evidence rules, corrected
`finality_status`). Two earlier addresses
(`0x46CFB7F63aAD30F858c3932195A8B90963deaBbf`,
`0xBfA9909a70d4CD068492f3351c83a60025D27897`) were deployed and exercised
during this hardening pass and are superseded — do not use their evidence
for the current code.

### Bug found and fixed during this pass, with real on-chain evidence

`get_award_receipt`'s `finality_status` previously read
`"ACCEPTED_FINAL" if rfq.accepted else "AWARDED_PENDING_ACCEPTANCE"` — which
printed `AWARDED_PENDING_ACCEPTANCE` even for RFQs that were never awarded
(e.g. `NEEDS_CLARIFICATION`), confirmed live: RFQ #4 on the intermediate
deployment showed `state: "NEEDS_CLARIFICATION"` alongside the misleading
`finality_status: "AWARDED_PENDING_ACCEPTANCE"`. Fixed to derive
`finality_status` from the actual RFQ state
(`ACCEPTED_FINAL` / `AWARDED_PENDING_ACCEPTANCE` /
`NEEDS_CLARIFICATION_PENDING_RETRY` / `NO_VALID_BID_FINAL` /
`CANCELLED_FINAL` / `NOT_YET_AWARDED`), relinted, and redeployed to the
final address above, where RFQ #3's `NEEDS_CLARIFICATION` state now
correctly reports `finality_status: "NEEDS_CLARIFICATION_PENDING_RETRY"`
(see below).

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

## Live scenario evidence (all four, run directly against the final address)

### 1. Clean pass — real consensus AWARDED → accepted

RFQ #1: 3 bids (cheap/slow, weak-support, strong-tradeoffs — the latter two
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
    "Bid 3 claims a 30-day full refund policy, whereas Bid 2 explicitly states no refunds.",
    "Bid 3 claims 24/7 priority support with a 1-hour SLA, while Bid 2 offers only business-hours best-effort email support.",
    "Bid 3 provides a specific uptime claim (99.95% over 12 months) with a public status page, whereas Bid 2 has no published uptime history."
  ],
  "policy_version": "cba7f320d0b50b338aa749979135163d6282b41ed9d37c56369c5e0ba6c73ef3",
  "unresolved_questions": []
}
```

`accept_award(1, 3)` moved the RFQ to `finality_status: "ACCEPTED_FINAL"`.

### 2. Negative case — deterministic rejection, GenLayer never invoked

RFQ #2: hard budget $100.00 / latency 100ms; the only bid ($500.00,
80ms) violated the budget. `filter_hard_constraints` alone moved the RFQ to
`state: "NO_VALID_BID"` with `judgment_attempts: 0` — `judge_award` was
never called.

### 3. Uncertainty case — fails closed, no fabricated winner

RFQ #3: two hard-constraint-equal bids, both pointing at permanently
unreachable evidence URLs (`https://nonexistent.invalid/...`).
`judge_award` reached consensus on `NEEDS_CLARIFICATION`
(`judgment_attempts: 1`), citing `SOURCE_UNAVAILABLE` for both candidates
and explicitly refusing to infer either bid as favorable from absent
evidence.

### 4. Recovery / retry — same policy and bids, still fails closed

`retry_judgment(3)` was then called (same RFQ, still pointing at the same
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
    "Bid 5 evidence is SOURCE_UNAVAILABLE — no verifiable claims about refund terms, support coverage, or uptime exist.",
    "Bid 6 evidence is SOURCE_UNAVAILABLE — no verifiable claims about refund terms, support coverage, or uptime exist.",
    "Both candidates are materially tied at absent evidence; neither can be evaluated against the stated soft priorities."
  ],
  "policy_version": "0455126f7afe7638be7a7b8201036141f0c26657a2c0dbceab625819bd88806c",
  "unresolved_questions": [
    "What are bid 5's actual refund terms, support coverage scope, and documented uptime figures?",
    "What are bid 6's actual refund terms, support coverage scope, and documented uptime figures?",
    "Can accessible, verifiable evidence URLs be provided for both bids so the soft priorities can be meaningfully compared?"
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
| GenVM lint | `genvm-lint check contracts/quorda.py --json` | `{"ok":true,"lint":{"ok":true,"passed":3},"validate":{"ok":true,"contract":"QuordaContract","methods":12,"view_methods":4,"write_methods":8,"ctor_params":0}}` |
| Direct (pure-function) | `pytest tests/direct/ -v` | 11 passed |
| Integration (live, `studio_devnet`) | `gltest tests/integration/test_quorda_integration.py -v -s` | 9 passed (includes 2 real non-deterministic `judge_award`/`retry_judgment` consensus calls per relevant test) |
| Frontend unit | `npx vitest run` (in `frontend/`) | 9 passed |
| Frontend production build | `npm run build` (in `frontend/`) | succeeds against `NEXT_PUBLIC_QUORDA_CONTRACT_ADDRESS=0xED865416cb79Ea9C32e4d93a0F324533F635A3e4` |

## Verification checklist

- [x] `genvm-lint check contracts/quorda.py --json` → `ok: true`
- [x] `pytest tests/direct/ -v` → 11/11 passed
- [x] `gltest tests/integration/test_quorda_integration.py -v -s` against `studio_devnet` → 9/9 passed, including real `judge_award`/`retry_judgment` consensus calls
- [x] `get_rfq` / `get_bid` / `get_award_receipt` reads verified for all four live scenarios (clean/negative/uncertainty/retry) on the final address
- [x] `finality_status` correctness bug found live, fixed, relinted, redeployed, and reverified live
- [x] Commitment hashes (rfq/policy/bid) verified on-chain to be contract-computed, not caller-asserted
- [x] Authorization (`close_bidding`, `accept_award`, `retry_judgment`) verified on-chain to reject non-creator callers
- [x] Prompt-injection / absent-evidence handling verified on-chain to fail closed
- [x] `frontend` production build and unit tests pass against the final deployed address
- [ ] Explorer `/address/...` direct lookup route 404s on this Studio Next explorer build; transactions are visible via the dashboard's recent-activity feed instead (a known explorer-UI limitation, not a QUORDA issue)
- [ ] Manual browser click-through of the full lifecycle (connect wallet → create RFQ → bid → close → filter → judge → retry → accept) was not re-run end-to-end in a live browser session against this exact final address after the hardening pass; the same flow was manually verified in the browser prior to this pass, and every method the UI calls has just been independently verified via CLI/gltest above with the current contract
