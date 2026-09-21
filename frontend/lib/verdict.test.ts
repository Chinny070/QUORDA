import { describe, expect, it } from "vitest";
import { parseVerdict } from "./verdict";

describe("award verdict presentation", () => {
  it("keeps only receipt fields supplied by the contract", () => {
    expect(parseVerdict(JSON.stringify({
      decision: "4",
      confidence_band: "high",
      material_findings: ["Bid 4 documents 24/7 support."],
      unresolved_questions: [],
      evidence_refs: ["4"],
    }))).toEqual({
      decision: "4",
      confidenceBand: "high",
      findings: ["Bid 4 documents 24/7 support."],
      questions: [],
      evidenceRefs: ["4"],
    });
  });

  it("fails safely when an historic receipt is malformed", () => {
    expect(parseVerdict("not-json")).toBeNull();
  });
});
