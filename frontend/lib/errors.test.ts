import { describe, expect, it } from "vitest";
import { friendlyErrorMessage, isLikelyRateLimitError } from "./errors";

describe("Studio Next RPC errors", () => {
  it("identifies the Studio Next read-rate-limit response", () => {
    const error = new Error("Rate limit exceeded: 30 requests per minute");
    expect(isLikelyRateLimitError(error)).toBe(true);
  });

  it("gives rate limits an actionable read-only retry message", () => {
    const message = friendlyErrorMessage(
      new Error("An unknown RPC error occurred. Details: Rate limit exceeded: 30 requests per minute"),
    );
    expect(message).toContain("temporarily rate-limiting read requests");
    expect(message).toContain("No transaction has failed");
  });
});
