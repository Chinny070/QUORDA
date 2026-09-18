"use client";

import Link from "next/link";
import { useState } from "react";
import { useWallet } from "@/lib/wallet-context";
import { createRfq, submitBid, listRfqIds, type WriteLifecycleState } from "@/lib/genlayer/contract";
import { LifecycleTrack } from "@/components/LifecycleTrack";
import { friendlyErrorMessage, isLikelyNetworkError } from "@/lib/errors";

const SOFT_POLICY =
  "Prefer the bid with the strongest refund terms, most comprehensive support " +
  "coverage and best documented uptime. Delivery certainty should not be " +
  "sacrificed for a marginally lower price among bids that already meet the " +
  "hard budget and latency requirements.";

type Scenario = {
  id: string;
  title: string;
  description: string;
  budgetUsd: number;
  latencyMs: number;
  bids: { price: number; latency: number; evidenceUrl: string; label: string }[];
  expect: string;
};

const SCENARIOS: Scenario[] = [
  {
    id: "clean",
    title: "1. Clean pass",
    description:
      "Buyer needs an API provider under a hard budget/latency ceiling, preferring " +
      "refund terms, support coverage and documented uptime. One bid is cheapest " +
      "but too slow, one is compliant but weak on soft priorities, one wins on " +
      "the declared trade-offs.",
    budgetUsd: 500,
    latencyMs: 300,
    bids: [
      { price: 150, latency: 900, evidenceUrl: "https://example.com/quorda-demo/bid-cheap-slow.json", label: "Cheapest, violates latency" },
      { price: 450, latency: 250, evidenceUrl: "https://example.com/quorda-demo/bid-weak-support.json", label: "Compliant, weak support" },
      { price: 480, latency: 220, evidenceUrl: "https://example.com/quorda-demo/bid-strong-tradeoffs.json", label: "Compliant, strong trade-offs" },
    ],
    expect: "Third bid should be AWARDED after GenLayer judgment; the latency-violating bid is eliminated before any LLM call.",
  },
  {
    id: "negative",
    title: "2. Negative case",
    description:
      "Every submitted bid materially violates a hard constraint. The contract " +
      "must refuse to award anything — no LLM ever sees these bids.",
    budgetUsd: 100,
    latencyMs: 100,
    bids: [
      { price: 500, latency: 80, evidenceUrl: "https://example.com/quorda-demo/bid-over-budget.json", label: "Over budget" },
    ],
    expect: "RFQ resolves to NO_VALID_BID immediately after the deterministic filter.",
  },
  {
    id: "uncertain",
    title: "3. Uncertainty case",
    description:
      "Two hard-constraint-equal bids point at evidence that cannot be resolved. " +
      "Validators must refuse to fabricate a winner.",
    budgetUsd: 500,
    latencyMs: 300,
    bids: [
      { price: 400, latency: 200, evidenceUrl: "https://nonexistent.invalid/quorda-demo/a.json", label: "Unverifiable evidence A" },
      { price: 400, latency: 200, evidenceUrl: "https://nonexistent.invalid/quorda-demo/b.json", label: "Unverifiable evidence B" },
    ],
    expect: "RFQ should resolve to NEEDS_CLARIFICATION after judge_award, not a guessed winner.",
  },
];

const RETRY_NOTE =
  "4. Recovery / retry — not a one-click scenario here. After running the " +
  "uncertainty case above (or any RFQ that lands on NEEDS_CLARIFICATION), " +
  "open that RFQ and use its \"Retry judgment\" button. retry_judgment() " +
  "re-runs consensus over the exact same soft_policy_text and bid set — " +
  "it takes no other parameters, so nothing about the RFQ can be rewritten " +
  "between attempts. It stays fail-closed: it only reaches AWARDED once " +
  "evidence genuinely supports a winner, and returns NEEDS_CLARIFICATION " +
  "again otherwise. Attempts are capped (see the RFQ page for the " +
  "remaining count).";

export default function DemoPage() {
  const { address, connect } = useWallet();
  const [running, setRunning] = useState<string | null>(null);
  const [state, setState] = useState<WriteLifecycleState | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [createdRfqId, setCreatedRfqId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runScenario(scenario: Scenario) {
    if (!address) {
      await connect();
      return;
    }
    setRunning(scenario.id);
    setError(null);
    setLog([]);
    setCreatedRfqId(null);
    let newRfqId: number | null = null;
    try {
      setLog((l) => [...l, "Creating RFQ (wallet signature required)…"]);
      const created = await createRfq(
        address,
        {
          rfqSpecText: `${scenario.title} - ${scenario.description} (run ${Date.now()})`,
          deadline: new Date(Date.now() + 3600 * 1000).toISOString(),
          hardBudgetCents: Math.round(scenario.budgetUsd * 100),
          hardLatencyMsMax: scenario.latencyMs,
          softPolicyText: SOFT_POLICY,
        },
        setState
      );

      setLog((l) => [...l, `RFQ created. tx: ${created.txHash}`]);

      // list_rfq_ids is monotonically increasing; the freshly created RFQ is
      // the highest id visible right after finalization.
      const ids = await listRfqIds();
      newRfqId = Math.max(...ids);
      setCreatedRfqId(newRfqId);
      setLog((l) => [...l, `New RFQ id: #${newRfqId}`]);

      for (const bid of scenario.bids) {
        setLog((l) => [...l, `Submitting bid: ${bid.label}…`]);
        await submitBid(
          address,
          {
            rfqId: newRfqId,
            priceCents: Math.round(bid.price * 100),
            latencyMs: bid.latency,
            evidenceUrl: bid.evidenceUrl,
          },
          setState
        );
      }

      setLog((l) => [
        ...l,
        `All bids submitted to RFQ #${newRfqId}. Open it to continue: close bidding → filter → judge → accept.`,
      ]);
    } catch (e) {
      if (isLikelyNetworkError(e) && newRfqId !== null) {
        setLog((l) => [
          ...l,
          `Lost connection to Studio Next partway through. RFQ #${newRfqId} was already created — open it below and check which bids landed before continuing manually.`,
        ]);
      }
      setError(friendlyErrorMessage(e));
    } finally {
      setRunning(null);
    }
  }

  return (
    <div>
      <h1>Demo scenarios</h1>
      <p className="dim small">
        These three scenarios are the mandatory reproducible cases from the
        Compendium&apos;s Testing and Acceptance Specification. Running one here
        creates a fresh RFQ and submits its bids; use{" "}
        <Link href="/workspace">Workspace</Link> to drive close-bidding →
        filter → judge-award → accept for full step-by-step control and to
        watch each on-chain transaction and receipt.
      </p>

      {SCENARIOS.map((s) => (
        <div className="card" key={s.id}>
          <h3>{s.title}</h3>
          <p className="small">{s.description}</p>
          <table style={{ marginBottom: 10 }}>
            <thead><tr><th>Bid</th><th>Price</th><th>Latency</th></tr></thead>
            <tbody>
              {s.bids.map((b) => (
                <tr key={b.label}><td>{b.label}</td><td>${b.price}</td><td>{b.latency}ms</td></tr>
              ))}
            </tbody>
          </table>
          <p className="small dim">Expected: {s.expect}</p>
          <button className="btn" onClick={() => runScenario(s)} disabled={running !== null}>
            {address ? `Run scenario ${running === s.id ? "…" : ""}` : "Connect wallet to run"}
          </button>
        </div>
      ))}

      <div className="card">
        <h3>4. Recovery / retry</h3>
        <p className="small">{RETRY_NOTE}</p>
      </div>

      {(log.length > 0 || error) && (
        <div className="card">
          <h3>Run log</h3>
          {state && <LifecycleTrack current={state} />}
          {log.map((line, i) => (
            <p key={i} className="small mono">{line}</p>
          ))}
          {error && <p className="field-error small">{error}</p>}
          {createdRfqId !== null && (
            <Link href={`/rfq/${createdRfqId}`} className="btn" style={{ marginRight: 10 }}>
              Open RFQ #{createdRfqId} →
            </Link>
          )}
          <Link href="/workspace" className="btn secondary">Go to Workspace →</Link>
        </div>
      )}
    </div>
  );
}
