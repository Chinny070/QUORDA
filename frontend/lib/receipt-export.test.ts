import { describe, expect, it } from "vitest";
import { awardReceiptFilename, createPortableAwardReceipt } from "./receipt-export";
import type { AwardReceiptView, BidView, RfqView } from "./genlayer/contract";

const rfq = {
  id: 2,
  state: "AWARDED",
  rfq_hash: "rfq-hash",
  soft_policy_hash: "policy-hash",
} as RfqView;
const bid = { id: 8, rfq_id: 2, bid_hash: "bid-hash" } as BidView;
const receipt = {
  rfq_id: 2,
  state: "AWARDED",
  policy_hash: "policy-hash",
  verdict: '{"decision":"8"}',
  finality_status: "ACCEPTED_FINAL",
} as AwardReceiptView;

describe("portable award receipt export", () => {
  it("binds exported data to Studio Next and preserves on-chain receipt inputs", () => {
    const parsedVerdict = { decision: "8" } as never;
    const transactionHashes = [{ action: "judge_award", hash: "0xabc" }];
    const exported = createPortableAwardReceipt({
      rfq,
      bids: [bid],
      receipt,
      parsedVerdict,
      contractAddress: "0x1234",
      transactionHashes,
      exportedAt: "2026-10-12T00:00:00.000Z",
    });

    expect(exported.network).toEqual({
      name: "GenLayer Studio Next",
      chainId: 61997,
      rpc: "https://studio-next.genlayer.com/api",
      explorer: "https://explorer-studio-dev.genlayer.com/",
    });
    expect(exported.contractAddress).toBe("0x1234");
    expect(exported.rfq).toBe(rfq);
    expect(exported.bids).toEqual([bid]);
    expect(exported.decisionReceipt).toMatchObject({ ...receipt, parsedVerdict });
    expect(exported.transactionHashesObservedInThisBrowser).toBe(transactionHashes);
    expect(exported.exportedAt).toBe("2026-10-12T00:00:00.000Z");
  });

  it("uses a stable filename for the RFQ id", () => {
    expect(awardReceiptFilename(42)).toBe("quorda-rfq-42-award-receipt.json");
  });
});
