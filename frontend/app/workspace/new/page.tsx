"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useWallet } from "@/lib/wallet-context";
import { createRfqWithOptions, type WriteLifecycleState } from "@/lib/genlayer/contract";
import { LifecycleTrack } from "@/components/LifecycleTrack";
import { explorerTxUrl } from "@/lib/genlayer/chain";
import { friendlyErrorMessage, isLikelyNetworkError } from "@/lib/errors";

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
  const [weightedScoring, setWeightedScoring] = useState(false);
  const [criteriaJson, setCriteriaJson] = useState('[{"name":"Support","description":"Coverage and response commitments","weight":40},{"name":"Refunds","description":"Clarity and completeness of refund terms","weight":30},{"name":"Reliability","description":"Public uptime history and delivery evidence","weight":30}]');
  const [sealedBids, setSealedBids] = useState(false);
  const [minimumAcceptedWins, setMinimumAcceptedWins] = useState("0");
  const [revealPeriodSeconds, setRevealPeriodSeconds] = useState("300");

  const [state, setState] = useState<WriteLifecycleState | null>(null);
  const [failed, setFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorIsNetwork, setErrorIsNetwork] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);

  async function handleSubmit() {
    if (!address) {
      await connect();
      return;
    }
    setError(null);
    setErrorIsNetwork(false);
    setFailed(false);
    setState(null);
    try {
      const { txHash } = await createRfqWithOptions(
        address,
        {
          rfqSpecText: rfqSpec,
          deadline: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
          hardBudgetCents: Math.round(parseFloat(budgetDollars) * 100),
          hardLatencyMsMax: parseInt(latencyMs, 10),
          softPolicyText: softPolicy,
          criteriaJson: weightedScoring ? criteriaJson : "[]",
          sealedBids,
          minimumAcceptedWins: parseInt(minimumAcceptedWins, 10) || 0,
          revealPeriodSeconds: sealedBids ? parseInt(revealPeriodSeconds, 10) : 0,
        },
        setState
      );
      setTxHash(txHash);
    } catch (e) {
      setFailed(true);
      setErrorIsNetwork(isLikelyNetworkError(e));
      setError(friendlyErrorMessage(e));
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
        Set the non-negotiables first, then describe what matters most when two
        offers qualify. QUORDA automatically locks the exact wording you submit
        so no one can quietly change the criteria after offers arrive.
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
            <label htmlFor="policy">How should qualifying offers be compared?</label>
            <textarea id="policy" rows={4} value={softPolicy} onChange={(e) => setSoftPolicy(e.target.value)} />
          </div>
          <details className="verification-details">
            <summary>Advanced procurement options</summary>
            <label className="option-row">
              <input type="checkbox" checked={weightedScoring} onChange={(e) => setWeightedScoring(e.target.checked)} />
              <span><strong>Use weighted criteria</strong><br /><span className="dim small">Validators rate each published criterion from 0–100; the contract computes the weighted totals. Weights must add to 100. Missing evidence and ties produce clarification.</span></span>
            </label>
            {weightedScoring && <div className="field">
              <label htmlFor="criteria">Criteria JSON (2–5 criteria, weights total 100)</label>
              <textarea id="criteria" rows={7} value={criteriaJson} onChange={(e) => setCriteriaJson(e.target.value)} spellCheck={false} />
            </div>}
            <label className="option-row">
              <input type="checkbox" checked={sealedBids} onChange={(e) => setSealedBids(e.target.checked)} />
              <span><strong>Seal bids until the reveal window</strong><br /><span className="dim small">Sellers publish a commitment before the bid deadline, then reveal terms during the configured window afterward. They must keep their private reveal file.</span></span>
            </label>
            {sealedBids && <div className="field">
              <label htmlFor="reveal-period">Reveal window after bid deadline (seconds, 60–604800)</label>
              <input id="reveal-period" type="number" min="60" max="604800" value={revealPeriodSeconds} onChange={(e) => setRevealPeriodSeconds(e.target.value)} />
            </div>}
            <div className="field">
              <label htmlFor="reputation-floor">Minimum prior accepted awards (0 disables this filter)</label>
              <input id="reputation-floor" type="number" min="0" value={minimumAcceptedWins} onChange={(e) => setMinimumAcceptedWins(e.target.value)} />
              <span className="dim small">This uses only prior buyer-accepted awards recorded by this contract. New sellers can qualify when the floor is zero.</span>
            </div>
          </details>
          <button className="btn" onClick={() => setReviewed(true)}>Review before submitting →</button>
        </div>
      ) : (
        <div className="card">
          <h3>Review — this becomes immutable once submitted</h3>
          <p className="small"><strong>Hard budget:</strong> ${budgetDollars}</p>
          <p className="small"><strong>Hard latency ceiling:</strong> {latencyMs}ms</p>
          <p className="small"><strong>Soft priorities:</strong> {softPolicy}</p>
          <p className="small dim">RFQ spec: {rfqSpec}</p>
          <p className="small"><strong>Scoring:</strong> {weightedScoring ? "Weighted criteria are committed with this RFQ." : "Natural-language comparison among qualifying bids."}</p>
          <p className="small"><strong>Bid visibility:</strong> {sealedBids ? `Sealed, with a ${revealPeriodSeconds}-second reveal window.` : "Public when submitted."}</p>
          <p className="small"><strong>Minimum prior accepted awards:</strong> {minimumAcceptedWins}</p>

          {state && <LifecycleTrack current={state} failed={failed} />}
          {error && (
            <div style={{ marginBottom: 8 }}>
              <p className="field-error small">{error}</p>
              {errorIsNetwork && (
                <button className="btn secondary" onClick={() => window.location.reload()}>
                  Reload page
                </button>
              )}
            </div>
          )}

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
