import type { RfqState } from "./genlayer/contract";

export type LifecycleAction =
  | "close_bidding"
  | "filter_hard_constraints"
  | "judge_award"
  | "retry_judgment"
  | "accept_award"
  | "open_appeal"
  | "resolve_appeal";

/**
 * Single source of truth for which lifecycle action buttons the UI may
 * offer, mirroring contracts/quorda.py's state-transition guards exactly
 * (TRD non-functional requirement: "0 UI actions offered when the contract
 * would reject the transition"). Kept as a pure function so it is testable
 * without rendering React.
 */
export function allowedActions(params: {
  state: RfqState;
  isCreator: boolean;
  bidCount: number;
  accepted: boolean;
  judgmentAttempts: number;
  maxJudgmentAttempts: number;
  hasLosingBid: boolean;
  appealUsed: boolean;
  sealedBids: boolean;
  revealDeadline: string;
  nowMs: number;
}): LifecycleAction[] {
  const { state, isCreator, bidCount, accepted, judgmentAttempts, maxJudgmentAttempts, hasLosingBid, appealUsed, sealedBids, revealDeadline, nowMs } = params;

  const actions: LifecycleAction[] = [];
  if (isCreator) {
    if (state === "OPEN" && bidCount > 0 && (!sealedBids || nowMs >= Date.parse(revealDeadline))) actions.push("close_bidding");
    if (state === "BIDDING_CLOSED") actions.push("filter_hard_constraints");
    if (state === "FILTERED") actions.push("judge_award");
    if (state === "NEEDS_CLARIFICATION" && judgmentAttempts < maxJudgmentAttempts) {
      actions.push("retry_judgment");
    }
    if (state === "AWARDED" && !accepted) actions.push("accept_award");
    if (state === "APPEAL_PENDING") actions.push("resolve_appeal");
  }
  if (state === "AWARDED" && !isCreator && !accepted && hasLosingBid && !appealUsed) actions.push("open_appeal");
  return actions;
}
