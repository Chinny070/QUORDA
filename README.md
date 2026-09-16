# QUORDA

Neutral procurement clearing for autonomous buyers and sellers.

QUORDA is a neutral clearing layer where a buyer agent publishes an RFQ,
seller agents submit complex offers, and **GenLayer validator consensus**
decides which surviving bid best satisfies the buyer's declared trade-offs
before an award is committed on-chain.

QUORDA decides **who should win before a deal is formed**. It does not hold
funds, run escrow, or govern whether a selected provider later delivers.

## Why GenLayer

Price ceilings and latency ceilings are deterministic — enforced entirely in
Python, before any non-deterministic call happens. The GenLayer-native part
is interpreting non-price priorities and heterogeneous terms — e.g. "best
support coverage without sacrificing delivery certainty" — against public
evidence every validator can independently inspect. See
[contracts/quorda.py](contracts/quorda.py) for the exact boundary.

## Repository layout

```
contracts/quorda.py            The canonical Intelligent Contract
tests/direct/                  Pure-function unit tests (no network)
tests/integration/             gltest suite against Studio Next (studio_devnet)
frontend/                      Next.js + TypeScript app (genlayer-js, injected wallet)
docs/DEPLOYMENT.md             Deployment evidence (address, tx hashes, explorer links)
gltest.config.yaml             Network config, pinned to studio_devnet (61997)
```

## Live deployment

Deployed to Studio Next at `0xED865416cb79Ea9C32e4d93a0F324533F635A3e4`
(chain 61997). All four mandatory scenarios have been run live against it:

- **Clean pass** — real validator consensus AWARDED the bid with the
  strongest refund/support/uptime evidence, then the buyer accepted it to
  `ACCEPTED_FINAL`.
- **Negative case** — an over-budget bid was eliminated deterministically;
  `judge_award` was never invoked (`judgment_attempts: 0`).
- **Uncertainty case** — with unreachable evidence, validators correctly
  returned `NEEDS_CLARIFICATION` instead of guessing.
- **Retry / recovery** — `retry_judgment` re-ran real consensus a second
  time over the byte-identical policy and bid set, still fail-closed.

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for full transaction evidence,
verdict JSON, and the on-chain commitment/authorization/prompt-injection
verification.

## Network (hackathon non-negotiable)

| | |
| --- | --- |
| Network | **Studio Next** |
| Chain ID | **61997** |
| RPC | `https://studio-next.genlayer.com/api` |
| Explorer | `https://explorer-studio-dev.genlayer.com/` |

This project targets Studio Next only. It does not deploy to Studionet
(61999) or any other network. Note: the `genlayer`/`gltest` toolchain's
built-in `studio-dev` / `studio_devnet` preset resolves by default to
`https://studio-dev.genlayer.com/api` — the same `v0.123.0-rc.6` Studio
build, confirmed live in-browser at `studio-next.genlayer.com`. This
project's own configuration (`frontend/lib/genlayer/chain.ts`,
`gltest.config.yaml`) explicitly overrides the RPC to
`studio-next.genlayer.com` per the hackathon's naming.

## Locked toolchain

| Component | Version |
| --- | --- |
| GenLayer CLI | `0.40.0-rc.3` |
| `genlayer-js` | `2.0.0-rc.1` |
| `genlayer-py` | `0.19.0rc2` |
| `genlayer-test` / `gltest` | `0.30.0rc2` |
| `genvm-linter` | `0.11.1rc2` |
| Contract dependency header | `py-genlayer:5jycge4q8k23462jtb0b9fyey1s9qz928sz2nbrd9mg4sxqg2qng` |

## Contract lifecycle

```
OPEN -> BIDDING_CLOSED -> FILTERED -> UNDER_JUDGMENT -> AWARDED
                                    -> NO_VALID_BID
                                    -> NEEDS_CLARIFICATION -> UNDER_JUDGMENT (retry_judgment)
OPEN -> CANCELLED
```

1. `create_rfq(rfq_spec_text, deadline, hard_budget_cents, hard_latency_ms_max, soft_policy_text)` — buyer posts hard constraints and soft priorities in full. `rfq_hash` and `soft_policy_hash` are **computed by the contract** (Keccak256 of the exact text stored) — there is no way to submit a hash unrelated to the actual policy.
2. `submit_bid(rfq_id, price_cents, latency_ms, evidence_url)` — seller submits structured commercial fields and an evidence URL. `bid_hash` is **computed by the contract** from `rfq_id | seller | price_cents | latency_ms | evidence_url`, binding the commitment to every material term and the bidder's identity.
3. `close_bidding` → `filter_hard_constraints` — **deterministic**, no LLM involved. A bid that violates a hard price/latency constraint is eliminated here and can never reach judgment.
4. `judge_award` — the **only** entry point that touches GenLayer's non-deterministic path: an equivalence-principle (`prompt_comparative`) block fetches each surviving bid's public evidence and asks validators to converge on the same winning `bid_id`, or `NEEDS_CLARIFICATION` when evidence is missing/contradictory/tied. Evidence is explicitly framed to validators as untrusted, unverified claims — never instructions — with dedicated rules against prompt injection.
5. `retry_judgment(rfq_id)` — if judgment lands on `NEEDS_CLARIFICATION`, the buyer (only) can retry. It takes no other parameters: the exact same `soft_policy_text` and surviving bid set are re-read from storage, so a retry can never rewrite the policy or bids. Bounded by `MAX_JUDGMENT_ATTEMPTS` (5). Still fail-closed — a retry only reaches `AWARDED` when evidence genuinely supports a winner.
6. `accept_award` — buyer confirms; `get_award_receipt` exposes a portable receipt (policy hash, verdict, judgment attempt count, finality status) downstream systems can reference.

## Running it

### Lint + test the contract

```bash
genvm-lint check contracts/quorda.py --json
pytest tests/direct/ -v
gltest tests/integration/test_quorda_integration.py -v -s
```

The integration suite needs funded Studio Next accounts (buyer + 3 sellers +
1 unauthorized "attacker" account for negative-authorization tests) whose
private keys are supplied via a local, gitignored `.env` — see
`.env.example`. This network's FeeManager does not support automatic fee
derivation, so every write in the suite passes an explicit fee budget (see
`FEES` in the test file).

### Deploy to Studio Next

```bash
genlayer network set studio-dev
genlayer deploy --contract contracts/quorda.py --fees '<explicit fee JSON - see docs/DEPLOYMENT.md>'
```

Explicit `--fees` is required: this network's FeeManager isn't configured
for automatic derivation, so a bare `genlayer deploy` reverts with
`FeeValueMustBeNonZero`. Record the resulting address and tx hash in
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

### Run the frontend

```bash
cd frontend
cp .env.example .env   # set NEXT_PUBLIC_QUORDA_CONTRACT_ADDRESS
npm install
npm run dev
```

Connect an injected wallet (no private keys are ever collected by this app),
open **Demo scenarios**, and run the clean/negative/uncertainty cases; use
an RFQ's **Retry judgment** button after `NEEDS_CLARIFICATION` to exercise
recovery. Every write shows honest lifecycle states (estimating fees →
wallet approval → submitted → pending consensus → decided → finalized)
rather than claiming success immediately after submission.

## Known limitations (documented, not hidden)

- This SDK release's contract-authoring surface exposes no verified
  on-chain clock accessor, so an RFQ's `deadline` is buyer-declared metadata
  for display/receipt purposes and is **not enforced** as a contract
  invariant — a bid is never rejected for arriving "after" it. This is a
  disclosed limitation of the current GenVM runtime, not an oversight.
- The hackathon MVP uses public/synthetic bid evidence. Production privacy
  design (encrypted off-chain payloads + on-chain commitments) is documented
  but not implemented for the hackathon build — see the Master Compendium's
  privacy/security section.
- `retry_judgment` is bounded (`MAX_JUDGMENT_ATTEMPTS = 5`) but has no
  cooldown/rate-limit beyond requiring the RFQ creator's signature; a
  determined buyer could spend up to 5 judgment attempts' worth of fees
  chasing a favorable outcome. Each attempt is still independently
  fail-closed, so this bounds cost, not correctness.

## Product boundary

QUORDA decides who should win before a deal is formed. **PRAEST** governs
whether an already-selected service provider later fulfilled its
obligations — a separate, later-stage product.
