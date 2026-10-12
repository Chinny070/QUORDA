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
| Final-address negative RFQ | #3, over-budget bid eliminated deterministically; `NO_VALID_BID`, no winner, zero judgment attempts |
| Final-address uncertainty RFQ | #4, two unavailable evidence URLs; consensus returned `NEEDS_CLARIFICATION`, then parameterless retry remained fail-closed with same policy, constraints and bids |
| Final-address reputation RFQ | #5, seller with one accepted win survived the floor; zero-win seller was eliminated; accepted survivor's count incremented |
| Final-address sealed RFQ | #6, commitment hid terms, bypasses rejected, exact preimage revealed after deadline |
| Final-address appeal RFQ | #7, losing seller opened one appeal; after two protocol disagreements, resolution reached consensus and upheld the original award |

The deploy transaction finalized with consensus `ACCEPTED`. The deployer
had `29.992422484749920757 GEN` on chain 61997 at preflight. The Studio CLI
used the documented `studio-dev` alias (same 61997 preview environment); the
frontend and gltest config use the hackathon RPC hostname above.

## Current verification status

| Gate | Result |
| --- | --- |
| GenVM lint and semantic validation | Pass: `ok: true`, 18 methods (13 writes, 5 views) |
| Direct contract tests | Pass: 18 |
| Frontend unit tests | Pass: 21 across 5 files |
| Frontend production build | Pass |
| Live evidence receipt + consensus test | Pass: 1 test, genuine weighted-criteria judgment on Studio Next |
| Clarification retry + single appeal | Pass: 2 tests, including repeated consensus, immutable policy/bids, and appeal authorization |
| Sealed commit/reveal | Pass: 1 test, hidden terms, correct commitment preimage, timing and reveal |
| Reputation floor | Pass: 1 test, accepted-win snapshot and deterministic filtering |
| Agent API/SDK | Pass: included in 21 frontend unit tests; chain-61997 guard, sealed commitment preimage, fee-aware write lifecycle; no private-key or backend path |
| Receipt export serialization | Pass: 2 focused tests verify Studio Next metadata, contract-read payload, parsed verdict, observed transaction references, and filename. Production RFQ #2 download was clicked and the UI confirmed `Receipt JSON downloaded`; file contents were not independently reopened. |
| Final-address `NO_VALID_BID` + `NEEDS_CLARIFICATION` retry | Pass: RFQs #3 and #4; retry held winner at zero and preserved RFQ/policy/constraints/bid IDs |
| Final-address reputation floor | Pass: RFQ #5; seller A (0 accepted wins) eliminated, seller B (1) survived; after acceptance seller B had 2 accepted wins |
| Final-address sealed commit/reveal | Pass: RFQ #6; hidden terms, open submission and early close rejected, exact commitment revealed after deadline |
| Final-address single appeal round | Pass: RFQ #7; appeal result `UPHELD`, same winner/policy/bids, two judgment-history entries; two earlier resolution submissions finalized undetermined before the successful third |
| Verifiable receipt view/export surface | Pass for on-chain receipt, production UI rendering, and a browser-triggered download. Reopening the downloaded file and comparing every field remains outstanding. |
| Live deployment of current source | Pass: accepted deployment receipt above |
| Deployed schema and smoke reads/writes | Pass: all 18 methods present; RFQ #1 `OPEN`; receipt `NOT_YET_AWARDED`; hashes present |
| Production frontend build | Pass: Vercel deployment `dpl_6nLDwAp9Tjd44akBq8q1thSN6Jh8`, `READY`, alias `https://quorda.vercel.app`, frontend commit `748ba549de4fe5a7757d34388b46ed6126affd4a` |
| Manual browser test against current deployment | Pass for read-only lifecycle/receipt views: production pages for RFQs #2–#4 and #7 showed accepted award, `NO_VALID_BID`, `NEEDS_CLARIFICATION`, upheld appeal, citations, weighted scores and fingerprints. RFQ #2 receipt download returned a success message. No wallet was connected; signing/action lifecycle remains unverified. |
| GitHub publication of current feature set | Pass: contract source commit `39f5ffd9d1d259140b8fc561acf86e5fdd28edcc` and frontend/evidence commit `748ba549de4fe5a7757d34388b46ed6126affd4a` are pushed to [`Chinny070/QUORDA`](https://github.com/Chinny070/QUORDA). |
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

Final-address negative and uncertainty evidence:

| RFQ | Action | Transaction / result |
| --- | --- | --- |
| #3 | Create | `0x89f6b0e13e0570a07c5f8957168759d0c0b5c2beb9752fde009c8f6eae02ab74` |
| #3 | Submit over-budget bid | `0x61248be415323d6b70ad93c614848ab7ee0b989fb01ea21c13cd0c602406f4c6` |
| #3 | Close / hard filter | `0xb32a91b9995648dd0e76e6888ed721b0ed34df45dd76c0e2b5f52b0c185690d3` / `0x053bc2fe031fe6b0dbb9b5da8eecc691d140e3b5a286a68d5a2b335f42ca0c5a`; state `NO_VALID_BID`, winner `0`, judgment attempts `0` |
| #4 | Create | `0x8d72e4a8be3630694d05ac34c68f9ff3ee437d4c34f052363a3819e40cc2afa2` |
| #4 | Submit bids #4 and #5 | `0xb5578c018941e2b5601ae3f0c7b883dc3a0bbd44af836a02eaf780ca6ba42518` / `0x4f95fb8e02240d4d60024dee0869a3f5a58601972648b11fb532a7b0b2086307` |
| #4 | Close / hard filter | `0xbb1edeaa3323f8340774db6a3a86361ba894eba364b5ae18e74fcb227cd4ae92` / `0x604d517c43a92dbd909e617a7c14640f2601ceffe02e4aa321b0b84871d67658` |
| #4 | Genuine consensus judgment | `0x01df5fc4b73f91f3af5b877349bf9862b0494c62ec6d0c7ddf02a04869305a90`; `NEEDS_CLARIFICATION`, no winner |
| #4 | `retry_judgment` | `0x304f326f108486037b01627e5f1b89d1e23fb7e9fb3d8941f47c8416d2266908`; `NEEDS_CLARIFICATION`, attempts `2`, winner `0`; RFQ commitment, policy hash/text, hard constraints, and bid IDs unchanged |

The production pages for RFQs #2, #3, #4, and #7 were opened and manually checked:
the UI showed the accepted award and cited findings/weighted scores/evidence
fingerprints; the deterministic elimination and `NO_VALID_BID`; and
`NEEDS_CLARIFICATION`, `SOURCE_UNAVAILABLE` evidence statuses, receipt, and
retry explanation, plus RFQ #7's upheld appeal, respectively. The sealed-bid
RFQ #6 and reputation RFQ #5 were verified on-chain; their UI pages were not
separately inspected. No wallet was connected in the in-app browser, so
write-signing and the actual wallet approval UI remain unverified.

On 2026-10-12, the production RFQ #2 `Download verifiable receipt JSON` control
was activated in a separate in-app browser. The page confirmed
`Receipt JSON downloaded`. The downloaded file was not reopened and compared
field-by-field with live contract reads.

## Fresh verification on 2026-10-12

After confirming `eth_chainId` returned `0xf22d` (61997), the pinned local
toolchain was used for another pass. With `GENVM_VERSION=v0.6.0-rc6`,
`genvm-lint check contracts/quorda.py --json` returned `ok: true` (18 methods,
5 views, 13 writes). Direct tests passed 18/18; frontend tests passed 21/21;
the production build passed.

The 14-case Studio Next integration suite was re-exercised in targeted runs.
The commitment, clean consensus, uncertainty, clarification retry,
authorization, prompt-injection, deadline, and receipt cases passed. A
hard-rejection test assertion was corrected: `judge_award` is expected to
revert after filtering leaves `NO_VALID_BID`, so it must use the expected-failure
helper. That corrected case passed. The integration fixture now retries
transient failures only for idempotent RPC reads, including `eth_estimateGas`
and `eth_getTransactionCount`; it never automatically resubmits
`eth_sendRawTransaction`.

All 14 integration cases have now passed individually across targeted invocations
against `studio_devnet`, including the later isolated reruns for reputation,
sealed bids, and appeal. This is per-case passing evidence, not one uninterrupted
14-test run: an earlier aggregate run was interrupted by Studio Next transport
failures. Several first attempts failed before returning a transaction hash;
latest/pending nonce queries showed no pending transactions when checked. No
write retry was added because a lost `eth_sendRawTransaction` response can be
ambiguous. The successful final-address RFQ #5, #6, and #7 evidence remains the
independent production-deployment evidence for those three features.

The current Chrome session was not available to the browser automation bridge,
and the Windows browser window could not be activated. Therefore the injected
wallet signing lifecycle and receipt-JSON re-import remain unverified. No
wallet prompt was approved or transaction signed through Rabby.

Final-address reputation, sealed-bid, and appeal transaction evidence:

| RFQ | Action | Transaction / result |
| --- | --- | --- |
| #5 | Create with one accepted-win floor | `0x8be8bccfabd2a6fef01fe4587617850f95f2e12ff55dafbaa7723aec30d5b875` |
| #5 | Seller A / seller B bids | `0xc9ae2830b04cc3b831eaafa28469b36d7c6177b49d0360029b74a70535e3cf94` / `0x8aaf0277a6d06f46e45fb48bf5dda3f85df3baa34a206ee39e2779c661a6a879` |
| #5 | Close / filter | `0x67337834e7924935c06cd01ff2b6fec693c5ff42a5674e3987cc632f45b8bf12` / `0x3a30ba2feb698df928eaaabfa6aa24f712cf535301950d894742519f886ae3a1`; seller A eliminated as `BELOW_REPUTATION_FLOOR`; seller B survived |
| #5 | Deterministic award / acceptance | `0x3fcc2cc0427415185cb823a0f13420062e91cc077237758aa0b35449ceee5a02` / `0xe59e341ca9297d0478aab4b531f03e71152517d6567d618574aff1db32e5244f`; seller B accepted-win count increased from 1 to 2 |
| #6 | Create sealed RFQ / commit bid #8 | `0x3d26da8874f8387e7bf3922c7121fd3f7070012f05f64106c6fc282398936473` / `0x5a4ed84027991615bc942f5269a96687cafbe7f6177ee0a6a3d6ea6f3a339033` |
| #6 | Open-bid bypass / early close (both rejected) | `0xe07427fc468520d2cb9b0805c0cbb4de6d95f0ea28e72bdeaf3802a1e821cd8d` / `0x0531cce6b36542329d6c2f1dee822b5f56a98f3a86de93f734a5b9446d1b68b4` |
| #6 | Reveal after deadline | `0x0d8b40d0b7f7e83da3ca0d73178680c95b48e2097429320fbe3d1b1eb5b2fddc`; stored commitment matched `rfq_id|seller|price|latency|evidence_url|salt`, terms became visible only after reveal |
| #7 | Resolution attempts 1 and 2 | `0x967a7f975610405b2d7b19179a522c08a404b64966da7d53a2967ee986bcf93e` and `0xf05c6960f75bd00fff8d3ccf78201415602903edf538e7e5e0c60686474bfc08`; both finalized `MAJORITY_DISAGREE` without contract-state change |
| #7 | Resolution attempt 3 | `0x0f92d88fd422046400642cdf715e320cf980150a5a8b2e5473e65742a8e17f0e`; consensus `UPHELD`, winner bid #10, judgment history has original judgment + appeal, `AWARDED_PENDING_ACCEPTANCE` |

Still not demonstrated:

1. Injected-wallet signing and the complete fee/decision/finality UI lifecycle
   in a browser with a real compatible wallet. The production UI was manually
   checked in read-only mode; connecting would disclose a wallet address and
   request the wallet's network-switch permission. That action was not taken.
2. Reopening the downloaded JSON and comparing its contents field-by-field
   against live contract reads. The production download interaction and JSON
   serialization tests passed, but this independent file-content comparison
   remains unverified.

Do not claim these remaining final-address/browser checks as completed until
their evidence is added below. If contract code changes, redeploy and replace
the deployment record; never attribute the address above to another source
commit. Record each final-address scenario's RFQ ID, transaction hashes,
final state, and (for judgments) receipt/verdict. Testnet bids are synthetic;
privacy and production settlement are outside this deployment's guarantees.

Keep the deployment source commit fixed. If contract code changes, redeploy
and replace the deployment record; never attribute the address above to a
different source commit. Record testnet/privacy limitations accurately.
