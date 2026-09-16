# QUORDA — Architecture

```
Buyer/Seller agent (browser, injected wallet)
        |
        v
QUORDA frontend (Next.js + genlayer-js)
        |
        +---- deterministic reads (get_rfq/get_bid/get_award_receipt) ----+
        |                                                                  |
        v                                                                  |
QuordaContract (contracts/quorda.py, GenVM)                                |
  create_rfq / submit_bid / close_bidding                                  |
  filter_hard_constraints   <- fully deterministic, no LLM                 |
        |                                                                  |
        v                                                                  |
  judge_award                                                              |
    - leader_judge(): gl.nondet.web.get() fetches each surviving bid's     |
      public evidence URL; gl.nondet.exec_prompt() asks the model for a    |
      bounded JSON verdict                                                 |
    - gl.eq_principle.prompt_comparative(leader_judge, principle):         |
      independent validators re-run leader_judge() and must converge on   |
      the same 'decision' field (Optimistic Democracy consensus)           |
        |                                                                  |
        v                                                                  |
  AWARDED | NO_VALID_BID | NEEDS_CLARIFICATION  (state + verdict persisted)|
        |                                                                  |
        v                                                                  |
  accept_award -> get_award_receipt  ---------------------------------------+
        |
        v
  Portable receipt (policy hash, verdict, finality) for downstream
  purchase/contract-formation adapters (not built for the hackathon MVP)
```

## Component responsibilities

- **Frontend** (`frontend/`): composes requests, hashes local artefacts with
  Web Crypto (`lib/hash.ts`), drives the injected wallet, calls
  `genlayer-js`'s `readContract`/`writeContract`/`estimateTransactionFeesForWrite`
  /`waitForDecision`/`waitForFinalization`, and displays only chain-sourced
  state (`lib/genlayer/contract.ts`).
- **Deterministic contract logic**: identity/authorization (`gl.message.sender_address`
  checks), state-transition guards, hash storage, and the hard
  price/latency filter (`filter_hard_constraints`) — all plain Python, no
  GenVM non-determinism.
- **GenLayer non-deterministic logic**: isolated entirely inside
  `judge_award`'s `leader_judge()` closure, wrapped by
  `gl.eq_principle.prompt_comparative`. This is the only place the contract
  calls `gl.nondet.*`.
- **Evidence sources**: each bid's `evidence_url` — a public URL every
  validator independently fetches; unreachable sources become
  `"SOURCE_UNAVAILABLE"` in the prompt rather than silently vanishing.
- **Adapters**: none required for the hackathon core demo (per ADR-002/003 in
  the Master Compendium); optional A2A/ERC-8004/x402/AP2 integration is
  future roadmap, not built here.

## Why this satisfies "deterministic before non-deterministic"

`filter_hard_constraints` runs to completion and commits state (`FILTERED`
or `NO_VALID_BID`) *before* `judge_award` can even be called — the contract's
state guard (`if rfq.state != ST_FILTERED: raise ...`) makes it structurally
impossible for a bid that violated a hard constraint to reach the LLM.
