import { describe, expect, it } from "vitest";
import { allowedActions } from "./lifecycle";

const base = { judgmentAttempts: 0, maxJudgmentAttempts: 5 };

describe("allowedActions", () => {
  it("offers nothing to a non-creator", () => {
    expect(
      allowedActions({ state: "OPEN", isCreator: false, bidCount: 3, accepted: false, ...base })
    ).toEqual([]);
  });

  it("offers nothing to the creator while OPEN with zero bids", () => {
    expect(
      allowedActions({ state: "OPEN", isCreator: true, bidCount: 0, accepted: false, ...base })
    ).toEqual([]);
  });

  it("offers close_bidding to the creator once bids exist", () => {
    expect(
      allowedActions({ state: "OPEN", isCreator: true, bidCount: 1, accepted: false, ...base })
    ).toEqual(["close_bidding"]);
  });

  it("offers filter_hard_constraints after bidding closes", () => {
    expect(
      allowedActions({ state: "BIDDING_CLOSED", isCreator: true, bidCount: 2, accepted: false, ...base })
    ).toEqual(["filter_hard_constraints"]);
  });

  it("offers judge_award once filtered", () => {
    expect(
      allowedActions({ state: "FILTERED", isCreator: true, bidCount: 2, accepted: false, ...base })
    ).toEqual(["judge_award"]);
  });

  it("offers accept_award only while awarded and not yet accepted", () => {
    expect(
      allowedActions({ state: "AWARDED", isCreator: true, bidCount: 2, accepted: false, ...base })
    ).toEqual(["accept_award"]);
    expect(
      allowedActions({ state: "AWARDED", isCreator: true, bidCount: 2, accepted: true, ...base })
    ).toEqual([]);
  });

  it("offers retry_judgment after NEEDS_CLARIFICATION while attempts remain", () => {
    expect(
      allowedActions({
        state: "NEEDS_CLARIFICATION",
        isCreator: true,
        bidCount: 2,
        accepted: false,
        judgmentAttempts: 1,
        maxJudgmentAttempts: 5,
      })
    ).toEqual(["retry_judgment"]);
  });

  it("does not offer retry_judgment once attempts are exhausted", () => {
    expect(
      allowedActions({
        state: "NEEDS_CLARIFICATION",
        isCreator: true,
        bidCount: 2,
        accepted: false,
        judgmentAttempts: 5,
        maxJudgmentAttempts: 5,
      })
    ).toEqual([]);
  });

  it("offers nothing for terminal failure states", () => {
    for (const state of ["NO_VALID_BID", "CANCELLED"] as const) {
      expect(
        allowedActions({ state, isCreator: true, bidCount: 2, accepted: false, ...base })
      ).toEqual([]);
    }
  });
});
