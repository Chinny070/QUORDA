/**
 * QUORDA agent client for buyer and seller agents.
 *
 * This SDK talks directly to the deployed Intelligent Contract. It accepts an
 * EIP-1193 provider supplied by the agent runtime, never reads a private key,
 * and sends writes through fee estimation, signing, consensus and finality.
 */
import { createClient } from "genlayer-js";
import { keccak256, toBytes } from "viem";
import { quordaChain, QUORDA_CHAIN_ID } from "./genlayer/chain";
import type { Address, EthereumProvider } from "./genlayer/client";
import { QUORDA_CONTRACT_ADDRESS, type WriteLifecycleState } from "./genlayer/contract";

export type AgentWriteUpdate = (state: WriteLifecycleState, detail?: unknown) => void;

export interface QuordaAgentOptions {
  account: Address;
  provider: EthereumProvider;
  contractAddress?: Address;
}

export interface CreateRfqOptions {
  rfqSpecText: string;
  deadline: string;
  hardBudgetCents: number;
  hardLatencyMsMax: number;
  softPolicyText: string;
  criteriaJson: string;
  sealedBids: boolean;
  minimumAcceptedWins: number;
  revealPeriodSeconds: number;
}

export interface BidTerms {
  priceCents: number;
  latencyMs: number;
  evidenceUrl: string;
  salt: string;
}

export function sealedBidPreimage(rfqId: number, seller: Address, terms: BidTerms): string {
  return [
    String(rfqId),
    seller.toLowerCase(),
    String(terms.priceCents),
    String(terms.latencyMs),
    terms.evidenceUrl,
    terms.salt.toLowerCase(),
  ].join("|");
}

export function createSealedBidSecret(
  rfqId: number,
  seller: Address,
  terms: Omit<BidTerms, "salt">,
): BidTerms & { commitmentHash: `0x${string}` } {
  const random = crypto.getRandomValues(new Uint8Array(32));
  const salt = Array.from(random, (value) => value.toString(16).padStart(2, "0")).join("");
  const completeTerms: BidTerms = { ...terms, salt };
  return {
    ...completeTerms,
    commitmentHash: keccak256(toBytes(sealedBidPreimage(rfqId, seller, completeTerms))),
  };
}

export async function assertStudioNextChain(provider: EthereumProvider): Promise<void> {
  const chainHex = await provider.request({ method: "eth_chainId" }) as string;
  const chainId = Number.parseInt(chainHex, 16);
  if (chainId !== QUORDA_CHAIN_ID) {
    throw new Error(`Agent wallet is on chain ${chainId}; QUORDA requires Studio Next (${QUORDA_CHAIN_ID}).`);
  }
}

export function createQuordaAgent(options: QuordaAgentOptions) {
  const address = options.contractAddress ?? QUORDA_CONTRACT_ADDRESS;
  if (!address) throw new Error("Set a QUORDA contract address before creating the agent client.");
  const client = createClient({ chain: quordaChain, account: options.account, provider: options.provider });

  async function ensureStudioNext() {
    await assertStudioNextChain(options.provider);
  }

  async function read(functionName: string, args: (string | number | boolean)[] = []) {
    await ensureStudioNext();
    return client.readContract({ address, functionName, args: args as never[] });
  }

  async function write(
    functionName: string,
    args: (string | number | boolean)[],
    onState: AgentWriteUpdate = () => undefined,
  ) {
    try {
      await ensureStudioNext();
      onState("estimating-fees");
      const call = { address, functionName, args: args as never[] };
      const estimate = await client.estimateTransactionFeesForWrite(call);
      onState("awaiting-wallet-approval");
      const txHash = await client.writeContract({
        ...call,
        fees: { distribution: estimate.distribution, feeValue: estimate.feeValue },
      }) as string;
      onState("submitted", { txHash });
      onState("pending-consensus");
      const hash = txHash as never;
      const decision = await client.waitForDecision({ hash });
      onState("decided", decision);
      const finality = await client.waitForFinalization({ hash });
      onState("finalized", finality);
      return { txHash, decision, finality };
    } catch (error) {
      onState("failed", error);
      throw error;
    }
  }

  return {
    account: options.account,
    contractAddress: address,
    readRfq: (id: number) => read("get_rfq", [id]),
    readBid: (id: number) => read("get_bid", [id]),
    readReceipt: (id: number) => read("get_award_receipt", [id]),
    readSellerReputation: (seller: Address) => read("get_seller_reputation", [seller]),
    listRfqIds: () => read("list_rfq_ids"),
    createRfq: (rfq: CreateRfqOptions, onState?: AgentWriteUpdate) => write(
      "create_rfq_with_options",
      [rfq.rfqSpecText, rfq.deadline, rfq.hardBudgetCents, rfq.hardLatencyMsMax,
        rfq.softPolicyText, rfq.criteriaJson, rfq.sealedBids, rfq.minimumAcceptedWins,
        rfq.revealPeriodSeconds],
      onState,
    ),
    submitBid: (rfqId: number, priceCents: number, latencyMs: number, evidenceUrl: string, onState?: AgentWriteUpdate) =>
      write("submit_bid", [rfqId, priceCents, latencyMs, evidenceUrl], onState),
    commitBid: (rfqId: number, commitmentHash: string, onState?: AgentWriteUpdate) =>
      write("commit_bid", [rfqId, commitmentHash], onState),
    revealBid: (rfqId: number, commitmentId: number, terms: BidTerms, onState?: AgentWriteUpdate) =>
      write("reveal_bid", [rfqId, commitmentId, terms.priceCents, terms.latencyMs, terms.evidenceUrl, terms.salt], onState),
    closeBidding: (rfqId: number, onState?: AgentWriteUpdate) => write("close_bidding", [rfqId], onState),
    filterHardConstraints: (rfqId: number, onState?: AgentWriteUpdate) => write("filter_hard_constraints", [rfqId], onState),
    judgeAward: (rfqId: number, onState?: AgentWriteUpdate) => write("judge_award", [rfqId], onState),
    retryJudgment: (rfqId: number, onState?: AgentWriteUpdate) => write("retry_judgment", [rfqId], onState),
    openAppeal: (rfqId: number, bidId: number, reason: string, onState?: AgentWriteUpdate) => write("open_appeal", [rfqId, bidId, reason], onState),
    resolveAppeal: (rfqId: number, onState?: AgentWriteUpdate) => write("resolve_appeal", [rfqId], onState),
    acceptAward: (rfqId: number, bidId: number, onState?: AgentWriteUpdate) => write("accept_award", [rfqId, bidId], onState),
  };
}
