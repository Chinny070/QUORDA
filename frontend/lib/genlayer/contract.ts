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
  | "CANCELLED";

export interface RfqView {
  id: number;
  creator: string;
  rfq_hash: string;
  deadline: number;
  hard_budget_cents: number;
  hard_latency_ms_max: number;
  soft_policy_hash: string;
  soft_policy_text: string;
  state: RfqState;
  bid_ids: number[];
  winning_bid_id: number;
  accepted: boolean;
  accepted_at: number;
  created_at: number;
}

export interface BidView {
  id: number;
  rfq_id: number;
  seller: string;
  bid_hash: string;
  price_cents: number;
  latency_ms: number;
  evidence_url: string;
  eliminated: boolean;
  elimination_reason: string;
}

export interface AwardReceiptView {
  rfq_id: number;
  rfq_hash: string;
  policy_hash: string;
  state: RfqState;
  winning_bid_id: number;
  verdict: string;
  accepted: boolean;
  accepted_at: number;
  finality_status: "AWARDED_PENDING_ACCEPTANCE" | "ACCEPTED_FINAL";
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
    rfqHash: string;
    deadline: number;
    hardBudgetCents: number;
    hardLatencyMsMax: number;
    softPolicyHash: string;
    softPolicyText: string;
  },
  onState: (state: WriteLifecycleState, detail?: unknown) => void
) {
  return writeAndTrack(
    account,
    "create_rfq",
    [
      params.rfqHash,
      params.deadline,
      params.hardBudgetCents,
      params.hardLatencyMsMax,
      params.softPolicyHash,
      params.softPolicyText,
    ],
    onState
  );
}

export function submitBid(
  account: Address,
  params: {
    rfqId: number;
    bidHash: string;
    priceCents: number;
    latencyMs: number;
    evidenceUrl: string;
  },
  onState: (state: WriteLifecycleState, detail?: unknown) => void
) {
  return writeAndTrack(
    account,
    "submit_bid",
    [
      params.rfqId,
      params.bidHash,
      params.priceCents,
      params.latencyMs,
      params.evidenceUrl,
    ],
    onState
  );
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

export function acceptAward(
  account: Address,
  rfqId: number,
  bidId: number,
  onState: (state: WriteLifecycleState, detail?: unknown) => void
) {
  return writeAndTrack(account, "accept_award", [rfqId, bidId], onState);
}
