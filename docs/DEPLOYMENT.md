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

The earlier deployment at `0x7e65fA3ee7ccE080E5FD8E70A38fDa1dc795F0F5`
predates the seven-feature contract and is superseded. Do not use its
evidence for the current source.

## Current deployment

| Field | Value |
| --- | --- |
| Contract address | `0x7BAeb6DF4cF5c5201c40e49Be24E13E802595BC5` |
| Deployment transaction | `0x89766e204d7034db1ee43f23a275fb8cb4a5af351343e43fb4cc106a02c00c2b` |
| Deployment outcome | `ACCEPTED` |
| Deployer | `0x3A3168d67A110dE79461939047a8f7334ff1423d` (`bradbury-e2e`) |
| Deployed contract-source commit | `39f5ffd9d1d259140b8fc561acf86e5fdd28edcc` |
| Deployment date | `2026-10-12` |
| Representative RFQ | #1, state `OPEN`, created in accepted tx `0xb0259292e00bcfa4db8d7142f360fc5f6cf494549de83fd3e34f23426b4a549c` |
| Final-address live award RFQ | #2, two bids hard-filtered, genuine consensus award to bid #2, buyer accepted; `finality_status: ACCEPTED_FINAL` |

The deploy transaction finalized with consensus `ACCEPTED`. The deployer
had `29.992422484749920757 GEN` on chain 61997 at preflight. The Studio CLI
used the documented `studio-dev` alias (same 61997 preview environment); the
frontend and gltest config use the hackathon RPC hostname above.

## Current verification status

| Gate | Result |
| --- | --- |
| GenVM lint and semantic validation | Pass: `ok: true`, 18 methods (13 writes, 5 views) |
| Direct contract tests | Pass: 18 |
| Frontend unit tests | Pass: 19 across 4 files |
| Frontend production build | Pass |
| Live evidence receipt + consensus test | Pass: 1 test, genuine weighted-criteria judgment on Studio Next |
| Clarification retry + single appeal | Pass: 2 tests, including repeated consensus, immutable policy/bids, and appeal authorization |
| Sealed commit/reveal | Pass: 1 test, hidden terms, correct commitment preimage, timing and reveal |
| Reputation floor | Pass: 1 test, accepted-win snapshot and deterministic filtering |
| Live deployment of current source | Pass: accepted deployment receipt above |
| Deployed schema and smoke reads/writes | Pass: all 18 methods present; RFQ #1 `OPEN`; receipt `NOT_YET_AWARDED`; hashes present |
| Production frontend build | Pass: Vercel deployment `dpl_8wEsNtJWhaqkhektqZZwcSsdhCQp`, `READY`, alias `https://quorda.vercel.app` |
| Manual browser test against current deployment | Partial pass: production workspace reads RFQ #1; RFQ detail shows on-chain state and commitments; advanced form exposes weighted criteria, sealed bids, reputation floor. Wallet signing/action lifecycle not exercised because no injected wallet was available in the test browser. |
| GitHub publication of current feature set | Pass: [`821b889`](https://github.com/Chinny070/QUORDA/commit/821b889359cc9d5b3937e41f69a124f1b9a14aac) pushed to [`Chinny070/QUORDA`](https://github.com/Chinny070/QUORDA) |
| Vercel publication of current feature set | Pass: production alias above |

An earlier live test run uncovered a bad integration assertion/harness that
did not fail immediately on reverted writes. The helper now asserts every
ordinary write, and expected rejections use a separate `wf()` helper. The
receipt test subsequently passed on the deployed source. A sealed-bid test
also exposed a missing `0x` prefix in its test-generated hash and an
insufficient deadline window; both fixture issues were corrected before the
passing rerun. The CLI write smoke test used the simpler `create_rfq`
signature because the CLI parser treats JSON arrays as array values rather
than preserving the `criteria_json` string; the app/SDK path passes that
field as a string. This CLI encoding limitation is not a contract limitation.

Smoke transaction details: `create_rfq` call hash
`0xb0259292e00bcfa4db8d7142f360fc5f6cf494549de83fd3e34f23426b4a549c`
was accepted from the deployer and created RFQ #1. `get_rfq(1)` and
`get_award_receipt(1)` returned `OPEN` / `NOT_YET_AWARDED`; both reads
contained the matching policy/RFQ/criteria/terms hashes. Production browser
reads showed the same RFQ #1 and its commitment details.

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

## Verification scope and remaining checks

The real-consensus feature scenarios listed in the verification table above
passed on Studio Next using fresh test deployments of the exact contract source
commit recorded here. In addition, final-address RFQ #2 completed a real
multi-bid, weighted-criteria judgment and buyer acceptance. The first judgment
attempt finalized with `MAJORITY_DISAGREE`; the contract stayed `FILTERED` with
no winner and zero committed attempts. Re-submitting the same `judge_award`
call with unchanged inputs then reached consensus, awarded bid #2, and the
creator accepted it. This is recovery from a protocol-level disagreement; it
is distinct from the contract's `retry_judgment` transition after
`NEEDS_CLARIFICATION`, which is covered by the live integration suite on a
fresh deployment of this exact source.

Final-address RFQ #2 evidence:

| Action | Transaction / result |
| --- | --- |
| Initial judgment; validator disagreement, no state transition | `0xb63299e819ed6efbb76eb4ed8cc99e88abe13c71db8dd4b796e3c55a875becc1` — `MAJORITY_DISAGREE`; RFQ remained `FILTERED`, no winner |
| Same-input consensus retry | `0x48a3a1775dc11ad3fb28869a1518e50b9b5a4429cb53b8a105e760a0dbdc0c5a` — accepted; state `AWARDED`, winner bid #2 |
| Buyer acceptance | `0x5afebf8cb58e93edf7d0eef80634c42d6aa4381e6494ef4c53475c7a1230e8b8` — accepted; `accepted: true`, receipt `finality_status: ACCEPTED_FINAL` |

The accepted receipt binds policy hash
`6dab02887011a7b83f5548ee02924c5960556928c8cf5b3d8f3f98ec18e07f6a`,
criteria hash `716ee004b7d6c91ab72525ebcba7e6d8f8fa5987573f1791f01915368fbe7360`,
and terms hash `f89375f72490000b50ec5596d4eca4b8cb3de11611b9d3816f4bfd328415b1e3`.
The verdict records evidence statuses as `AVAILABLE_UNVERIFIED` (not a claim of
external truth), fingerprints for both evidence references, material support
and refund findings, and weighted scores. Bid #2 scored 9300 basis points
versus bid #1 at 1600. The receipt is viewable at
`https://explorer-studio-dev.genlayer.com/tx/0x48a3a1775dc11ad3fb28869a1518e50b9b5a4429cb53b8a105e760a0dbdc0c5a`
and the acceptance transaction at
`https://explorer-studio-dev.genlayer.com/tx/0x5afebf8cb58e93edf7d0eef80634c42d6aa4381e6494ef4c53475c7a1230e8b8`.

Still not demonstrated on the final contract address:

1. `NO_VALID_BID` and uncertainty/retry flows as a single audited set of
   transactions on this exact address (they did pass against fresh Studio Next
   test deployments of the same source).
2. Injected-wallet signing and the complete fee/decision/finality UI lifecycle
   in a browser with a real compatible wallet. The manual browser used for the
   production check did not expose an injected wallet.

Do not claim these remaining final-address/browser checks as completed until
their evidence is added below. If contract code changes, redeploy and replace
the deployment record; never attribute the address above to another source
commit. Record each final-address scenario's RFQ ID, transaction hashes,
final state, and (for judgments) receipt/verdict. Testnet bids are synthetic;
privacy and production settlement are outside this deployment's guarantees.

Keep the deployment source commit fixed. If contract code changes, redeploy
and replace the deployment record; never attribute the address above to a
different source commit. For each remaining live scenario, retain the RFQ
ID, transaction hashes, final on-chain state, and (for judgments) the
receipt/verdict. Record testnet/privacy limitations accurately.
