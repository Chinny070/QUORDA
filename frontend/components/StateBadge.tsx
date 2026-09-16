const LABELS: Record<string, string> = {
  OPEN: "Open for bids",
  BIDDING_CLOSED: "Bidding closed",
  FILTERED: "Hard-filtered",
  UNDER_JUDGMENT: "Under validator judgment",
  AWARDED: "Awarded",
  NO_VALID_BID: "No valid bid",
  NEEDS_CLARIFICATION: "Needs clarification",
  CANCELLED: "Cancelled",
};

export function StateBadge({ state }: { state: string }) {
  return <span className={`badge state-${state}`}>{LABELS[state] ?? state}</span>;
}
