# Studio Next deployment and verification record

## Required target

| Field | Value |
| --- | --- |
| Network | Studio Next / Studio development preview |
| Chain ID | `61997` |
| RPC | `https://studio-next.genlayer.com/api` |
| Explorer | `https://explorer-studio-dev.genlayer.com/` |
| CLI preset | `studio-dev` |
| gltest network | `studio_devnet` |
| GenLayerJS chain | `studioDevnet` |

No current-code deployment is recorded yet. The address and transaction
previously recorded in this document belonged to the earlier contract and
must not be used as evidence for the current source. Deploy only after all
contract gates pass, and record the exact deployed source commit below.

## Current deployment

| Field | Value |
| --- | --- |
| Contract address | Not deployed for current source |
| Deployment transaction | Not available |
| Deployer | Not verified for current deployment |
| Deployed contract-source commit | Not applicable |
| Deployment date | Not applicable |

## Current verification status

| Gate | Result |
| --- | --- |
| GenVM lint and semantic validation | Pass: `ok: true`, 18 methods (13 writes, 5 views) |
| Direct contract tests | Pass: 18 |
| Frontend unit tests | Pass: 19 across 4 files |
| Frontend production build | Pass |
| Live integration tests for current feature set | Not verified; current attempt was interrupted by Studio Next RPC access/polling failures. Do not count as passing. |
| Live deployment of current source | Not performed |
| Manual browser test against current deployment | Not performed |
| GitHub/Vercel publication of current feature set | Not performed |

The evidence-receipt integration test also exposed an empty verdict in a
live test attempt. The contract was hardened to persist a normalized verdict
record, but this fix has not yet been confirmed by a completed live rerun.
Consequently, consensus, appeal, sealed reveal, retry, and receipt behavior
must not be represented as live-verified for the current source.

## Toolchain observed

| Component | Version/configuration |
| --- | --- |
| Node.js | `v24.14.0` |
| npm | `11.9.0` |
| Python | `3.12.10` |
| GenLayer CLI | `0.40.0-rc.3`; configured preset was switched to `studio-dev` (61997) |
| genlayer-js | `2.0.0-rc.1` |
| genlayer-py | `0.19.0rc2` |
| genlayer-test / gltest | `0.30.0rc2` |
| genvm-linter | `0.11.1rc2` |
| Studio release family | `v0.123 RC` |
| Consensus release family | `v0.6 RC` |
| Contract runner | Pinned `py-genlayer:5jycge4q8k23462jtb0b9fyey1s9qz928sz2nbrd9mg4sxqg2qng`; retained from the already live-tested project and not floated |

## Required live verification before submission

After a fresh deployment of the exact source commit, record its address,
transaction hash and receipt, then run and capture:

1. Clean multi-bid RFQ: hard filter, genuine consensus decision, acceptance.
2. Deterministic hard-constraint rejection with `NO_VALID_BID`.
3. Missing/unavailable/contradictory evidence leading to clarification.
4. Retry on identical RFQ policy, constraints and bid set.
5. One losing-seller appeal and buyer resolution using a second consensus pass.
6. Reputation snapshot and deterministic minimum-reputation filtering.
7. Sealed commitment, hidden terms, deadline-gated reveal, and verified preimage.
8. Evidence fingerprints, weighted criteria, and downloadable receipt fields.
9. Wallet/network/fee/decision/finality lifecycle in the production frontend.

For each, retain the RFQ ID, relevant transaction hashes, final on-chain
state, and (for judgments) the receipt/verdict. Record any testnet/privacy
limitations accurately. Do not reuse the prior deployment's evidence.
