import type { RfqState } from "./genlayer/contract";

export type LifecycleAction =
  | "close_bidding"
  | "filter_hard_constraints"
  | "judge_award"
  | "accept_award";

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
}): LifecycleAction[] {
  const { state, isCreator, bidCount, accepted } = params;
  if (!isCreator) return [];

  const actions: LifecycleAction[] = [];
  if (state === "OPEN" && bidCount > 0) actions.push("close_bidding");
  if (state === "BIDDING_CLOSED") actions.push("filter_hard_constraints");
  if (state === "FILTERED") actions.push("judge_award");
  if (state === "AWARDED" && !accepted) actions.push("accept_award");
  return actions;
}
