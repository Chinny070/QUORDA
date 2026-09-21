export type VerdictView = {
  decision: string;
  confidenceBand: "high" | "medium" | "low";
  findings: string[];
  questions: string[];
  evidenceRefs: string[];
};

const CONFIDENCE_BANDS = new Set(["high", "medium", "low"]);

/**
 * A receipt is on-chain truth, but its verdict is stored as a bounded JSON
 * string. Parse it defensively so an unexpected historic receipt never breaks
 * the page and so presentation never invents a finding or source.
 */
export function parseVerdict(verdict: string): VerdictView | null {
  try {
    const raw: unknown = JSON.parse(verdict);
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const value = raw as Record<string, unknown>;
    const confidence = String(value.confidence_band ?? "low");
    return {
      decision: String(value.decision ?? "NEEDS_CLARIFICATION"),
      confidenceBand: CONFIDENCE_BANDS.has(confidence)
        ? (confidence as VerdictView["confidenceBand"])
        : "low",
      findings: asTextList(value.material_findings),
      questions: asTextList(value.unresolved_questions),
      evidenceRefs: asTextList(value.evidence_refs),
    };
  } catch {
    return null;
  }
}

function asTextList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}
