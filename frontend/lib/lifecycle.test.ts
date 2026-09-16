import { describe, expect, it } from "vitest";
import { allowedActions } from "./lifecycle";

describe("allowedActions", () => {
  it("offers nothing to a non-creator", () => {
    expect(
      allowedActions({ state: "OPEN", isCreator: false, bidCount: 3, accepted: false })
    ).toEqual([]);
  });

  it("offers nothing to the creator while OPEN with zero bids", () => {
    expect(
      allowedActions({ state: "OPEN", isCreator: true, bidCount: 0, accepted: false })
    ).toEqual([]);
  });

  it("offers close_bidding to the creator once bids exist", () => {
    expect(
      allowedActions({ state: "OPEN", isCreator: true, bidCount: 1, accepted: false })
    ).toEqual(["close_bidding"]);
  });

  it("offers filter_hard_constraints after bidding closes", () => {
    expect(
      allowedActions({ state: "BIDDING_CLOSED", isCreator: true, bidCount: 2, accepted: false })
    ).toEqual(["filter_hard_constraints"]);
  });

  it("offers judge_award once filtered", () => {
    expect(
      allowedActions({ state: "FILTERED", isCreator: true, bidCount: 2, accepted: false })
    ).toEqual(["judge_award"]);
  });

  it("offers accept_award only while awarded and not yet accepted", () => {
    expect(
      allowedActions({ state: "AWARDED", isCreator: true, bidCount: 2, accepted: false })
    ).toEqual(["accept_award"]);
    expect(
      allowedActions({ state: "AWARDED", isCreator: true, bidCount: 2, accepted: true })
    ).toEqual([]);
  });

  it("offers nothing for terminal failure states", () => {
    for (const state of ["NO_VALID_BID", "NEEDS_CLARIFICATION", "CANCELLED"] as const) {
      expect(allowedActions({ state, isCreator: true, bidCount: 2, accepted: false })).toEqual([]);
    }
  });
});
