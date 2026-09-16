# QUORDA — Studio Next Deployment Evidence

Fill in every field below immediately after deploying, per AGENTS.md's
"Before every merge" checklist and the SDLC "Release evidence" rule.

## Network (non-negotiable)

| Field | Value |
| --- | --- |
| Network | Studio Next |
| Chain ID | 61997 |
| RPC | https://studio-next.genlayer.com/api |
| Explorer | https://explorer-studio-dev.genlayer.com/ |
| CLI network preset | `studio-dev` |
| gltest network name | `studio_devnet` |

## Deployment record

| Field | Value |
| --- | --- |
| Commit SHA | not yet a git repository (no commits exist for this project) |
| Deployed contract address | `0x46CFB7F63aAD30F858c3932195A8B90963deaBbf` |
| Deployment transaction hash | `0x6adf91186b6cc6503facf243ab779c9d03345e58ddd902dd0df401ff78d797e3` |
| Deployment date (UTC) | 2026-09-16 |
| Deployer account | `bradbury-e2e` — `0x3A3168d67A110dE79461939047a8f7334ff1423d` |
| CLI network resolved | `studio-dev` → `https://studio-dev.genlayer.com/api`, chain 61997 (`studio-next.genlayer.com` confirmed live in-browser as the same `v0.123.0-rc.6` Studio build — see note below) |

Note on RPC hostname: every SDK/CLI at the locked toolchain version resolves
the `studio_devnet`/`studio-dev` preset to `https://studio-dev.genlayer.com/api`.
The Agent Tank announcement names `studio-next.genlayer.com` as the public
RPC; that host was independently confirmed live and running the identical
Studio build (`v0.123.0-rc.6`) in-browser, but was not used directly for CLI
deployment since the CLI has no way to override the built-in preset's RPC
without also losing its consensus contract address resolution. The frontend
(`frontend/lib/genlayer/chain.ts`) is still pinned to `studio-next.genlayer.com`
per the hackathon's explicit instruction; if that ever diverges from
`studio-dev.genlayer.com` in practice, point it at `studio-dev.genlayer.com`
to match what was actually deployed to.

### First deploy attempt failed closed — real bug caught and fixed

The first deploy (contract as originally written) reverted at runtime with:

```
TypeError: this class can't be instantiated by user
  File "/contract.py", line 146, in create_rfq
    bid_ids=DynArray[u256](),
```

Root cause: GenVM storage-backed `DynArray[T]` fields can never be
constructed directly by user code (`DynArray[u256]()` always raises) — they
must be left unassigned in `__init__` and default to an empty array from
zeroed storage. Fixed by giving `Rfq`/`Bid` explicit `__init__` methods that
never touch the `bid_ids` field (see `contracts/quorda.py`). Relinted
(`ok: true`) and redeployed successfully to the address above.

## Canonical demo transactions

All three mandatory scenarios (Testing and Acceptance Specification) were
run live against the deployed contract via `genlayer write`/`genlayer call`
— not just the test suite.

| Scenario | RFQ id | Key tx / result | Outcome |
| --- | --- | --- | --- |
| Clean pass (AWARDED) | 3 | `judge_award` — real GenLayer validator consensus (`AGREE`/`IDLE` votes, `ACCEPTED`) | `AWARDED` → `winning_bid_id: 7`, then `accept_award` → `finality_status: ACCEPTED_FINAL`. Verdict cites both bids' evidence line-by-line (refund/support/uptime) and picks bid #7 (strong trade-offs) over #6 (weak support), `confidence_band: "high"`. Evidence hosted as real public gists: [weak](https://gist.githubusercontent.com/Chinny070/294b81aa44f49f5ce1fb5658aa9fe46d/raw/bid-weak-support.json), [strong](https://gist.githubusercontent.com/Chinny070/9736a85529db8a15de8c9960932db08e/raw/bid-strong-tradeoffs.json) |
| Negative case | 2 | `filter_hard_constraints` (deterministic only) | `NO_VALID_BID` — the only bid ($500 on a $100 hard budget) was eliminated before any GenLayer call happened |
| Uncertainty case | 1 | `judge_award` tx_id `0x2fc293860da32714b534fdb911a4530179feb1ae48237202995ac0e95dffba50` (`MAJORITY_AGREE`) | `NEEDS_CLARIFICATION` — evidence URLs pointed at content-free placeholder pages (`example.com`); validators correctly declined to fabricate a winner rather than guess from absent refund/support/uptime data |

RFQ #3's full winning verdict JSON (from `get_award_receipt`):

```json
{
  "confidence_band": "high",
  "decision": "7",
  "evidence_refs": ["6", "7"],
  "material_findings": [
    "Bid 7 offers 'Full refund within 30 days, no questions asked', while Bid 6 offers 'No refunds after purchase. All sales final.'",
    "Bid 7 offers '24/7 priority support with 1-hour response SLA', while Bid 6 offers 'Business hours only (9am-5pm, Mon-Fri), best-effort email support, no SLA.'",
    "Bid 7 documents '99.95% uptime over the trailing 12 months, published on a public status page', while Bid 6 has 'No public uptime history or SLA published.'"
  ],
  "policy_version": "policy-hash-clean-demo-v2",
  "unresolved_questions": []
}
```

## How this was deployed

The network's `feeManager` is `not set` in `genlayer network info` for
`studio-dev`, so `genlayer-js`'s automatic fee derivation on `deploy`/`write`
reverts with `FeeValueMustBeNonZero` regardless of account balance. Workaround:
run `genlayer estimate-fees <address> <method> --args ... --json` (or, for a
fresh deploy, reuse a prior estimate) to get a complete `distribution` +
`feeValue`, then pass it explicitly:

```bash
genlayer network set studio-dev
genlayer deploy --contract contracts/quorda.py --fees '{"distribution":{"leaderTimeunitsAllocation":"100","validatorTimeunitsAllocation":"200","appealRounds":"0","executionBudgetPerRound":"25000000000000000","executionConsumed":"0","totalMessageFees":"0","rotations":["3"],"maxPriceGenPerTimeUnit":"2","storageFeeMaxGasPrice":"300000000","receiptFeeMaxGasPrice":"300000000"},"feeValue":"100000000000010352"}'
```

For `judge_award` specifically (heavier LLM+web execution), estimate fees
against the already-deployed contract first — the default distribution's
`executionBudgetPerRound` is too small:

```bash
genlayer estimate-fees <contract> judge_award --args <rfq_id> --json
# then pass the resulting JSON to `genlayer write <contract> judge_award --args <rfq_id> --fees '...'`
```

Then set the deployed address in `frontend/.env`:

```
NEXT_PUBLIC_QUORDA_CONTRACT_ADDRESS=0x46CFB7F63aAD30F858c3932195A8B90963deaBbf
```

## Verification steps performed

- [x] `genvm-lint check contracts/quorda.py --json` → `ok: true`
- [x] `pytest tests/direct/ -v` → 7/7 passed
- [ ] `gltest tests/integration/test_quorda_integration.py -v -s` against `studio_devnet` — not yet run (the manual CLI walkthrough above exercised the same scenarios directly against the live contract instead)
- [x] `get_rfq` / `get_bid` / `get_award_receipt` reads return the expected state for RFQ #1 (uncertainty), #2 (negative), and #3 (clean pass, AWARDED → ACCEPTED_FINAL)
- [ ] Explorer link for the deployment tx — explorer's `/address/...` route 404s for direct lookup; transactions are visible via the dashboard's recent-activity feed instead
- [x] At least one `judge_award` tx is a real, non-mocked GenLayer validator consensus call, exercised twice: RFQ #1 (`MAJORITY_AGREE` → NEEDS_CLARIFICATION) and RFQ #3 (`ACCEPTED` → AWARDED with a cited comparative verdict)
- [x] `frontend` production build (`npm run build`) succeeds against `NEXT_PUBLIC_QUORDA_CONTRACT_ADDRESS=0x46CFB7F63aAD30F858c3932195A8B90963deaBbf`; `npx vitest run` 7/7 passed
- [ ] `frontend` build/UI walkthrough against this exact deployed address — not yet manually exercised in a browser
