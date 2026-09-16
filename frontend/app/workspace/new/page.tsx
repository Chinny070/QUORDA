"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useWallet } from "@/lib/wallet-context";
import { sha256Hex } from "@/lib/hash";
import { createRfq, type WriteLifecycleState } from "@/lib/genlayer/contract";
import { LifecycleTrack } from "@/components/LifecycleTrack";
import { explorerTxUrl } from "@/lib/genlayer/chain";

export default function NewRfqPage() {
  const { address, connect } = useWallet();
  const router = useRouter();

  const [budgetDollars, setBudgetDollars] = useState("500.00");
  const [latencyMs, setLatencyMs] = useState("300");
  const [softPolicy, setSoftPolicy] = useState(
    "Prefer the bid with the strongest refund terms, most comprehensive support " +
      "coverage and best documented uptime. Delivery certainty should not be " +
      "sacrificed for a marginally lower price among bids that already meet the " +
      "hard budget and latency requirements."
  );
  const [rfqSpec, setRfqSpec] = useState(
    "API provider for production workload. Hard budget and latency ceiling below " +
      "are non-negotiable; soft priorities describe how to break ties among " +
      "compliant bids."
  );

  const [reviewed, setReviewed] = useState(false);
  const [rfqHash, setRfqHash] = useState<string | null>(null);
  const [policyHash, setPolicyHash] = useState<string | null>(null);

  const [state, setState] = useState<WriteLifecycleState | null>(null);
  const [failed, setFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  async function handleReview() {
    setRfqHash(await sha256Hex(rfqSpec));
    setPolicyHash(await sha256Hex(softPolicy));
    setReviewed(true);
  }

  async function handleSubmit() {
    if (!address) {
      await connect();
      return;
    }
    if (!rfqHash || !policyHash) return;
    setError(null);
    setFailed(false);
    setState(null);
    try {
      const { txHash } = await createRfq(
        address,
        {
          rfqHash,
          deadline: Math.floor(Date.now() / 1000) + 30 * 24 * 3600,
          hardBudgetCents: Math.round(parseFloat(budgetDollars) * 100),
          hardLatencyMsMax: parseInt(latencyMs, 10),
          softPolicyHash: policyHash,
          softPolicyText: softPolicy,
        },
        setState
      );
      setTxHash(txHash);
    } catch (e) {
      setFailed(true);
      setError(e instanceof Error ? e.message : "Transaction failed.");
    }
  }

  if (txHash) {
    return (
      <div className="card">
        <h2>RFQ submitted</h2>
        <p className="small">
          Transaction: <a href={explorerTxUrl(txHash)} target="_blank" rel="noreferrer" className="mono">{txHash}</a>
        </p>
        <LifecycleTrack current={state} failed={failed} />
        <button className="btn" onClick={() => router.push("/workspace")}>
          Back to workspace
        </button>
      </div>
    );
  }

  return (
    <div>
      <h1>Create RFQ</h1>
      <p className="dim small">
        Hard constraints below are enforced deterministically by the contract
        before any GenLayer judgment runs. Soft priorities are natural language
        that GenLayer validators interpret against each surviving bid&apos;s evidence.
      </p>

      {!reviewed ? (
        <div className="card">
          <div className="field">
            <label htmlFor="spec">RFQ specification</label>
            <textarea id="spec" rows={3} value={rfqSpec} onChange={(e) => setRfqSpec(e.target.value)} />
          </div>
          <div className="grid-2">
            <div className="field">
              <label htmlFor="budget">Hard budget ceiling (USD)</label>
              <input id="budget" type="number" min="0" step="0.01" value={budgetDollars} onChange={(e) => setBudgetDollars(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="latency">Hard latency ceiling (ms)</label>
              <input id="latency" type="number" min="1" value={latencyMs} onChange={(e) => setLatencyMs(e.target.value)} />
            </div>
          </div>
          <div className="field">
            <label htmlFor="policy">Soft priorities (natural language, judged by GenLayer)</label>
            <textarea id="policy" rows={4} value={softPolicy} onChange={(e) => setSoftPolicy(e.target.value)} />
          </div>
          <button className="btn" onClick={handleReview}>Review before submitting →</button>
        </div>
      ) : (
        <div className="card">
          <h3>Review — this becomes immutable once submitted</h3>
          <p className="small"><strong>Hard budget:</strong> ${budgetDollars}</p>
          <p className="small"><strong>Hard latency ceiling:</strong> {latencyMs}ms</p>
          <p className="small"><strong>Soft priorities:</strong> {softPolicy}</p>
          <p className="small dim">RFQ spec hash: <span className="mono">{rfqHash}</span></p>
          <p className="small dim">Soft policy hash: <span className="mono">{policyHash}</span></p>

          {state && <LifecycleTrack current={state} failed={failed} />}
          {error && <p className="field-error small">{error}</p>}

          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn secondary" onClick={() => setReviewed(false)} disabled={!!state && !failed}>
              Edit
            </button>
            <button className="btn" onClick={handleSubmit} disabled={!!state && !failed}>
              {address ? "Sign & submit to Studio Next" : "Connect wallet to submit"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
