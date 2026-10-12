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

The previously documented deployment at
`0x7e65fA3ee7ccE080E5FD8E70A38fDa1dc795F0F5` predates the seven advanced
features now in this repository and is **not** a deployment of the current
contract source. Do not use it as evidence for these features. Current
Studio Next deployment and integration status is tracked in
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md); that record must be updated only
after a fresh 61997 deployment and receipt verification.

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

1. `create_rfq(rfq_spec_text, deadline, hard_budget_cents, hard_latency_ms_max, soft_policy_text)` — buyer posts hard constraints and soft priorities in full. `rfq_hash` and `soft_policy_hash` are **computed by the contract** (Keccak256 of the exact text stored) — there is no way to submit a hash unrelated to the actual policy. `deadline` is an ISO-8601 UTC string (e.g. `2026-10-01T00:00:00Z`); the contract rejects a deadline already in the past, using `gl.message.datetime` (a real, consensus-safe on-chain clock) as the time source.
2. `submit_bid(rfq_id, price_cents, latency_ms, evidence_url)` — seller submits structured commercial fields and an evidence URL. `bid_hash` is **computed by the contract** from `rfq_id | seller | price_cents | latency_ms | evidence_url`, binding the commitment to every material term and the bidder's identity.
3. `close_bidding` → `filter_hard_constraints` — **deterministic**, no LLM involved. A bid that violates a hard price/latency constraint is eliminated here and can never reach judgment.
4. `judge_award` — the **only** entry point that touches GenLayer's non-deterministic path: an equivalence-principle (`prompt_comparative`) block fetches each surviving bid's public evidence and asks validators to converge on the same winning `bid_id`, or `NEEDS_CLARIFICATION` when evidence is missing/contradictory/tied. Evidence is explicitly framed to validators as untrusted, unverified claims — never instructions — with dedicated rules against prompt injection.
5. `retry_judgment(rfq_id)` — if judgment lands on `NEEDS_CLARIFICATION`, the buyer (only) can retry. It takes no other parameters: the exact same `soft_policy_text` and surviving bid set are re-read from storage, so a retry can never rewrite the policy or bids. Bounded by `MAX_JUDGMENT_ATTEMPTS` (5). Still fail-closed — a retry only reaches `AWARDED` when evidence genuinely supports a winner.
6. `accept_award` — buyer confirms; `get_award_receipt` exposes a portable receipt (policy hash, verdict, judgment attempt count, finality status) downstream systems can reference.

## Advanced procurement features

The advanced create form commits these choices before bids are accepted:

- **One-round seller appeal:** a non-winning, non-eliminated seller may appeal an unaccepted award once. The buyer starts a second GenLayer consensus review against the original policy, criteria, surviving bids, and public evidence. The seller's appeal text is untrusted input and cannot rewrite buyer preferences.
- **Accepted-win reputation:** seller history counts submitted bids, hard eliminations, clarification events, and buyer-accepted wins. An RFQ may set a minimum accepted-win floor; each bid stores the seller's reputation snapshot at submission/commit time. Losses and clarification outcomes do not subtract reputation.
- **Evidence fingerprints:** each available source body fetched at judgment receives a Keccak256 fingerprint in the verdict/receipt. A fingerprint proves which bytes the leader returned for that judgment, not that a seller's claim is true or that the URL will remain available.
- **Weighted criteria:** buyers may specify 2–5 named criteria with integer weights totaling 100. Validators return cited 0–100 criterion ratings; contract code computes weighted totals and awards only a unique highest score. Missing sources, malformed ratings, low confidence, or a tie fail closed to `NEEDS_CLARIFICATION`.
- **Agent SDK:** `frontend/lib/agent-sdk.ts` exposes EIP-1193-based reads and fee-aware writes for buyer/seller agents. It verifies chain 61997 and emits fee-estimation, wallet-approval, submission, consensus, decision, finality, and failure states. It contains no private-key handling or hosted backend.
- **Verifiable receipt export:** RFQ detail pages download JSON containing the chain, contract, policy/criteria/terms commitments, bid records, consensus verdict/history, evidence fingerprints, acceptance state, and locally observed transaction references. Anyone can compare the on-chain fields with the contract reads.
- **Sealed bids:** sellers commit a hash of RFQ ID, seller address, price, latency, evidence URL, and a 32-byte salt. Terms are stored as hidden zero values until the seller reveals during the committed reveal window. The browser can save a local reveal file; sellers must keep a backup because the contract cannot recover a lost salt.

Sealed bids hide bid terms until reveal but do not conceal seller identity or commitment timing, and the current public testnet UI stores reveal secrets in that browser's local storage unless the seller downloads a backup. These are transparent testnet trade-offs, not a claim of production privacy.

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
