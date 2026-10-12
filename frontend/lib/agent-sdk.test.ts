import { describe, expect, it } from "vitest";
import { keccak256, toBytes } from "viem";
import { assertStudioNextChain, createSealedBidSecret, sealedBidPreimage } from "./agent-sdk";

describe("agent SDK commitment helpers", () => {
  it("uses the exact RFQ, seller, terms, evidence URL, and salt preimage", () => {
    const terms = {
      priceCents: 42_000,
      latencyMs: 180,
      evidenceUrl: "https://seller.example/offer.json",
      salt: "ab".repeat(32),
    };
    const preimage = sealedBidPreimage(7, "0x00000000000000000000000000000000000000a1", terms);
    expect(preimage).toBe(`7|0x00000000000000000000000000000000000000a1|42000|180|${terms.evidenceUrl}|${terms.salt}`);
  });

  it("creates a 32-byte secret and a commitment compatible with contract reveal", () => {
    const secret = createSealedBidSecret(7, "0x00000000000000000000000000000000000000a1", {
      priceCents: 42_000,
      latencyMs: 180,
      evidenceUrl: "https://seller.example/offer.json",
    });
    expect(secret.salt).toMatch(/^[0-9a-f]{64}$/);
    expect(secret.commitmentHash).toBe(
      keccak256(toBytes(sealedBidPreimage(7, "0x00000000000000000000000000000000000000a1", secret))),
    );
  });

  it("rejects an agent wallet on any chain other than Studio Next 61997", async () => {
    const provider = {
      request: async () => "0xf227", // 61991, deliberately not 61997
    } as never;
    await expect(assertStudioNextChain(provider)).rejects.toThrow("requires Studio Next (61997)");
  });

  it("accepts the Studio Next chain ID", async () => {
    const provider = {
      request: async () => "0xf22d", // 61997
    } as never;
    await expect(assertStudioNextChain(provider)).resolves.toBeUndefined();
  });
});
