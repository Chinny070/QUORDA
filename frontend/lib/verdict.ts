export type VerdictView = {
  decision: string;
  confidenceBand: "high" | "medium" | "low";
  findings: string[];
  questions: string[];
  evidenceRefs: string[];
  weightedScores: Record<string, unknown>[];
  evidenceCommitments: Record<string, string>;
  evidenceStatus: Record<string, string>;
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
      weightedScores: asRecordList(value.weighted_scores),
      evidenceCommitments: asStringRecord(value.evidence_commitments),
      evidenceStatus: asStringRecord(value.evidence_status),
    };
  } catch {
    return null;
  }
}

export function parseJudgmentHistory(value: string): Record<string, unknown>[] {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
      : [];
  } catch {
    return [];
  }
}

function asTextList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function asRecordList(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
    : [];
}

function asStringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
}
