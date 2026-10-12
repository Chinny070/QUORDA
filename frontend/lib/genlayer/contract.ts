/**
 * QUORDA contract read/write bindings.
 *
 * Reads never touch the wallet. Writes always go through
 * estimateTransactionFeesForWrite -> writeContract -> waitForDecision
 * so the UI can show truthful lifecycle states (never claim success right
 * after submission - see TRD "Frontend Transaction States").
 */

import { getReadClient, getWalletClient, type Address } from "./client";

export const QUORDA_CONTRACT_ADDRESS = (process.env.NEXT_PUBLIC_QUORDA_CONTRACT_ADDRESS ||
  "") as Address;

export type RfqState =
  | "OPEN"
  | "BIDDING_CLOSED"
  | "FILTERED"
  | "UNDER_JUDGMENT"
  | "AWARDED"
  | "NO_VALID_BID"
  | "NEEDS_CLARIFICATION"
  | "APPEAL_PENDING"
  | "CANCELLED";

export interface RfqView {
  id: number;
  creator: string;
  rfq_spec_text: string;
  /** Computed on-chain by the contract from rfq_spec_text (Keccak256) -
   * never a caller-asserted value. */
  rfq_hash: string;
  deadline: string;
  hard_budget_cents: number;
  hard_latency_ms_max: number;
  /** Computed on-chain by the contract from soft_policy_text (Keccak256) -
   * never a caller-asserted value. */
  soft_policy_hash: string;
  soft_policy_text: string;
  criteria_json: string;
  criteria_hash: string;
  terms_hash: string;
  sealed_bids: boolean;
  minimum_accepted_wins: number;
  reveal_period_seconds: number;
  reveal_deadline: string;
  state: RfqState;
  bid_ids: number[];
  winning_bid_id: number;
  judgment_attempts: number;
  max_judgment_attempts: number;
  accepted: boolean;
  accepted_at: number;
  appeal_used: boolean;
  appeal_bid_id: number;
  appeal_reason: string;
  appeal_result: string;
  created_at: number;
}

export interface BidView {
  id: number;
  rfq_id: number;
  seller: string;
  /** Computed on-chain by the contract from rfq_id|seller|price_cents|
   * latency_ms|evidence_url (Keccak256) - never a caller-asserted value. */
  bid_hash: string;
  price_cents: number;
  latency_ms: number;
  evidence_url: string;
  revealed: boolean;
  seller_wins_at_bid: number;
  eliminated: boolean;
  elimination_reason: string;
}

export interface AwardReceiptView {
  rfq_id: number;
  rfq_hash: string;
  policy_hash: string;
  criteria_hash: string;
  terms_hash: string;
  state: RfqState;
  winning_bid_id: number;
  verdict: string;
  judgment_attempts: number;
  judgment_history: string;
  appeal_used: boolean;
  appeal_bid_id: number;
  appeal_result: string;
  accepted: boolean;
  accepted_at: number;
  finality_status:
    | "ACCEPTED_FINAL"
    | "AWARDED_PENDING_ACCEPTANCE"
    | "AWARD_APPEAL_PENDING"
    | "NEEDS_CLARIFICATION_PENDING_RETRY"
    | "NO_VALID_BID_FINAL"
    | "CANCELLED_FINAL"
    | "NOT_YET_AWARDED";
}

function requireAddress(): Address {
  if (!QUORDA_CONTRACT_ADDRESS) {
    throw new Error(
      "QUORDA contract address is not configured. Set NEXT_PUBLIC_QUORDA_CONTRACT_ADDRESS."
    );
  }
  return QUORDA_CONTRACT_ADDRESS;
}

// ---------------------------------------------------------------------------
// Reads (no wallet signature required)
// ---------------------------------------------------------------------------

export async function readRfq(rfqId: number): Promise<RfqView> {
  const client = getReadClient();
  const result = await client.readContract({
    address: requireAddress(),
    functionName: "get_rfq",
    args: [rfqId],
  });
  return result as unknown as RfqView;
}

export async function readBid(bidId: number): Promise<BidView> {
  const client = getReadClient();
  const result = await client.readContract({
    address: requireAddress(),
    functionName: "get_bid",
    args: [bidId],
  });
  return result as unknown as BidView;
}

export async function readAwardReceipt(rfqId: number): Promise<AwardReceiptView> {
  const client = getReadClient();
  const result = await client.readContract({
    address: requireAddress(),
    functionName: "get_award_receipt",
    args: [rfqId],
  });
  return result as unknown as AwardReceiptView;
}

export async function listRfqIds(): Promise<number[]> {
  const client = getReadClient();
  const result = await client.readContract({
    address: requireAddress(),
    functionName: "list_rfq_ids",
    args: [],
  });
  return result as unknown as number[];
}

// ---------------------------------------------------------------------------
// Writes - fee-aware, wallet-signed
// ---------------------------------------------------------------------------

export type WriteLifecycleState =
  | "estimating-fees"
  | "awaiting-wallet-approval"
  | "submitted"
  | "pending-consensus"
  | "decided"
  | "finalized"
  | "failed";

export interface WriteHandle {
  txHash?: string;
}

async function writeAndTrack(
  account: Address,
  functionName: string,
  args: (string | number | boolean)[],
  onState: (state: WriteLifecycleState, detail?: unknown) => void
): Promise<{ txHash: string; result: unknown }> {
  // The wallet client is already scoped to `account` (see getWalletClient),
  // so it is not repeated in the per-call args below.
  const client = getWalletClient(account);
  const address = requireAddress();
  const callArgs = { address, functionName, args: args as never[] };

  onState("estimating-fees");
  const estimate = await client.estimateTransactionFeesForWrite(callArgs);

  onState("awaiting-wallet-approval");
  const txHash = (await client.writeContract({
    ...callArgs,
    fees: {
      distribution: estimate.distribution,
      feeValue: estimate.feeValue,
    },
  })) as string;

  onState("submitted", { txHash });

  onState("pending-consensus");
  const hash = txHash as never;
  const decided = await client.waitForDecision({ hash });
  onState("decided", decided);

  const finalized = await client.waitForFinalization({ hash });
  onState("finalized", finalized);

  return { txHash, result: finalized };
}

export function createRfq(
  account: Address,
  params: {
    rfqSpecText: string;
    deadline: string;
    hardBudgetCents: number;
    hardLatencyMsMax: number;
    softPolicyText: string;
  },
  onState: (state: WriteLifecycleState, detail?: unknown) => void
) {
  // rfq_hash and soft_policy_hash are computed on-chain by the contract
  // from these exact texts - the frontend never sends a hash.
  return writeAndTrack(
    account,
    "create_rfq",
    [
      params.rfqSpecText,
      params.deadline,
      params.hardBudgetCents,
      params.hardLatencyMsMax,
      params.softPolicyText,
    ],
    onState
  );
}

export function createRfqWithOptions(
  account: Address,
  params: {
    rfqSpecText: string;
    deadline: string;
    hardBudgetCents: number;
    hardLatencyMsMax: number;
    softPolicyText: string;
    criteriaJson: string;
    sealedBids: boolean;
    minimumAcceptedWins: number;
    revealPeriodSeconds: number;
  },
  onState: (state: WriteLifecycleState, detail?: unknown) => void
) {
  return writeAndTrack(
    account,
    "create_rfq_with_options",
    [params.rfqSpecText, params.deadline, params.hardBudgetCents,
      params.hardLatencyMsMax, params.softPolicyText, params.criteriaJson,
      params.sealedBids, params.minimumAcceptedWins, params.revealPeriodSeconds],
    onState
  );
}

export function submitBid(
  account: Address,
  params: {
    rfqId: number;
    priceCents: number;
    latencyMs: number;
    evidenceUrl: string;
  },
  onState: (state: WriteLifecycleState, detail?: unknown) => void
) {
  // bid_hash is computed on-chain by the contract from
  // rfq_id|seller|price_cents|latency_ms|evidence_url - the frontend never
  // sends a hash.
  return writeAndTrack(
    account,
    "submit_bid",
    [params.rfqId, params.priceCents, params.latencyMs, params.evidenceUrl],
    onState
  );
}

export function commitBid(account: Address, rfqId: number, commitmentHash: string, onState: (state: WriteLifecycleState, detail?: unknown) => void) {
  return writeAndTrack(account, "commit_bid", [rfqId, commitmentHash], onState);
}

export function revealBid(account: Address, rfqId: number, commitmentId: number, params: { priceCents: number; latencyMs: number; evidenceUrl: string; salt: string }, onState: (state: WriteLifecycleState, detail?: unknown) => void) {
  return writeAndTrack(account, "reveal_bid", [rfqId, commitmentId, params.priceCents, params.latencyMs, params.evidenceUrl, params.salt], onState);
}

export function openAppeal(account: Address, rfqId: number, bidId: number, reason: string, onState: (state: WriteLifecycleState, detail?: unknown) => void) {
  return writeAndTrack(account, "open_appeal", [rfqId, bidId, reason], onState);
}

export function resolveAppeal(account: Address, rfqId: number, onState: (state: WriteLifecycleState, detail?: unknown) => void) {
  return writeAndTrack(account, "resolve_appeal", [rfqId], onState);
}

export async function readSellerReputation(seller: Address) {
  const client = getReadClient();
  return client.readContract({
    address: requireAddress(),
    functionName: "get_seller_reputation",
    args: [seller],
  });
}

export function closeBidding(
  account: Address,
  rfqId: number,
  onState: (state: WriteLifecycleState, detail?: unknown) => void
) {
  return writeAndTrack(account, "close_bidding", [rfqId], onState);
}

export function filterHardConstraints(
  account: Address,
  rfqId: number,
  onState: (state: WriteLifecycleState, detail?: unknown) => void
) {
  return writeAndTrack(account, "filter_hard_constraints", [rfqId], onState);
}

export function judgeAward(
  account: Address,
  rfqId: number,
  onState: (state: WriteLifecycleState, detail?: unknown) => void
) {
  return writeAndTrack(account, "judge_award", [rfqId], onState);
}

/** Re-runs judgment after NEEDS_CLARIFICATION over the exact same policy
 * and bid set - no parameters beyond rfqId, so nothing can be rewritten. */
export function retryJudgment(
  account: Address,
  rfqId: number,
  onState: (state: WriteLifecycleState, detail?: unknown) => void
) {
  return writeAndTrack(account, "retry_judgment", [rfqId], onState);
}

export function acceptAward(
  account: Address,
  rfqId: number,
  bidId: number,
  onState: (state: WriteLifecycleState, detail?: unknown) => void
) {
  return writeAndTrack(account, "accept_award", [rfqId, bidId], onState);
}
