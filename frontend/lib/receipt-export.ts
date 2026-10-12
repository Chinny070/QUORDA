import type { AwardReceiptView, BidView, RfqView } from "./genlayer/contract";
import type { VerdictView } from "./verdict";

export interface ReceiptTransactionReference {
  action: string;
  hash: string;
}

export interface PortableAwardReceiptInput {
  rfq: RfqView;
  bids: BidView[];
  receipt: AwardReceiptView;
  parsedVerdict: VerdictView | null;
  contractAddress: string;
  transactionHashes: ReceiptTransactionReference[];
  exportedAt?: string;
}

/** Build a portable export from contract-read values; never synthesize chain state. */
export function createPortableAwardReceipt(input: PortableAwardReceiptInput) {
  return {
    format: "quorda-verifiable-award-receipt-v1",
    network: {
      name: "GenLayer Studio Next",
      chainId: 61997,
      rpc: "https://studio-next.genlayer.com/api",
      explorer: "https://explorer-studio-dev.genlayer.com/",
    },
    contractAddress: input.contractAddress,
    exportedAt: input.exportedAt ?? new Date().toISOString(),
    rfq: input.rfq,
    bids: input.bids,
    decisionReceipt: { ...input.receipt, parsedVerdict: input.parsedVerdict },
    transactionHashesObservedInThisBrowser: input.transactionHashes,
    verification:
      "RFQ and bid fields are read from the deployed contract. Verify the contract address and chain 61997, then compare these values with get_rfq, get_bid, and get_award_receipt. Evidence fingerprints commit to the content returned at judgment time; they do not guarantee a source's truth or availability.",
  };
}

export function awardReceiptFilename(rfqId: number): string {
  return `quorda-rfq-${rfqId}-award-receipt.json`;
}
