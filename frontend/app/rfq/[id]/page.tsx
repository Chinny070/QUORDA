"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useWallet } from "@/lib/wallet-context";
import {
  readRfq,
  readBid,
  readAwardReceipt,
  submitBid,
  closeBidding,
  filterHardConstraints,
  judgeAward,
  retryJudgment,
  acceptAward,
  type RfqView,
  type BidView,
  type AwardReceiptView,
  type WriteLifecycleState,
} from "@/lib/genlayer/contract";
import { StateBadge } from "@/components/StateBadge";
import { LifecycleTrack } from "@/components/LifecycleTrack";
import { explorerTxUrl } from "@/lib/genlayer/chain";
import { allowedActions } from "@/lib/lifecycle";
import { friendlyErrorMessage, isLikelyNetworkError } from "@/lib/errors";

const FINALITY_LABELS: Record<AwardReceiptView["finality_status"], string> = {
  ACCEPTED_FINAL: "Accepted — final",
  AWARDED_PENDING_ACCEPTANCE: "Awarded — pending buyer acceptance",
  NEEDS_CLARIFICATION_PENDING_RETRY: "Needs clarification — pending retry",
  NO_VALID_BID_FINAL: "No valid bid — final",
  CANCELLED_FINAL: "Cancelled — final",
  NOT_YET_AWARDED: "Not yet awarded",
};

export default function RfqDetailPage() {
  const params = useParams<{ id: string }>();
  const rfqId = parseInt(params.id, 10);
  const { address, connect } = useWallet();

  const [rfq, setRfq] = useState<RfqView | null>(null);
  const [bids, setBids] = useState<BidView[]>([]);
  const [receipt, setReceipt] = useState<AwardReceiptView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [state, setState] = useState<WriteLifecycleState | null>(null);
  const [failed, setFailed] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionErrorIsNetwork, setActionErrorIsNetwork] = useState(false);
  const [lastTx, setLastTx] = useState<string | null>(null);

  const [bidPrice, setBidPrice] = useState("450.00");
  const [bidLatency, setBidLatency] = useState("250");
  const [bidEvidenceUrl, setBidEvidenceUrl] = useState("https://example.com/quorda-demo/bid.json");

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const r = await readRfq(rfqId);
      setRfq(r);
      const bidViews = await Promise.all(r.bid_ids.map((id) => readBid(id)));
      setBids(bidViews);
      if (r.state === "AWARDED" || r.state === "NEEDS_CLARIFICATION" || r.accepted) {
        try {
          setReceipt(await readAwardReceipt(rfqId));
        } catch {
          setReceipt(null);
        }
      }
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load RFQ.");
    }
  }, [rfqId]);

  useEffect(() => {
    load();
  }, [load]);

  async function runAction(
    fn: (addr: `0x${string}`, onState: (s: WriteLifecycleState) => void) => Promise<{ txHash: string }>
  ) {
    if (!address) {
      await connect();
      return;
    }
    setActionError(null);
    setActionErrorIsNetwork(false);
    setFailed(false);
    setState(null);
    try {
      const { txHash } = await fn(address, setState);
      setLastTx(txHash);
      await load();
    } catch (e) {
      setFailed(true);
      setActionErrorIsNetwork(isLikelyNetworkError(e));
      setActionError(friendlyErrorMessage(e));
    }
  }

  async function handleSubmitBid() {
    if (!address) {
      await connect();
      return;
    }
    setActionError(null);
    setActionErrorIsNetwork(false);
    setFailed(false);
    setState(null);
    try {
      const { txHash } = await submitBid(
        address,
        {
          rfqId,
          priceCents: Math.round(parseFloat(bidPrice) * 100),
          latencyMs: parseInt(bidLatency, 10),
          evidenceUrl: bidEvidenceUrl,
        },
        setState
      );
      setLastTx(txHash);
      await load();
    } catch (e) {
      setFailed(true);
      setActionErrorIsNetwork(isLikelyNetworkError(e));
      setActionError(friendlyErrorMessage(e));
    }
  }

  if (loadError) {
    return (
      <div className="card">
        <h2>Could not load RFQ #{rfqId}</h2>
        <p className="field-error small">{loadError}</p>
      </div>
    );
  }

  if (!rfq) return <p className="dim">Loading…</p>;

  const isCreator = Boolean(address && rfq.creator.toLowerCase() === address.toLowerCase());
  const actions = allowedActions({
    state: rfq.state,
    isCreator,
    bidCount: bids.length,
    accepted: rfq.accepted,
    judgmentAttempts: rfq.judgment_attempts,
    maxJudgmentAttempts: rfq.max_judgment_attempts,
  });

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <h1 style={{ margin: 0 }}>RFQ #{rfq.id}</h1>
        <StateBadge state={rfq.state} />
      </div>

      <div className="card">
        <h3>Immutable criteria (commitment computed on-chain)</h3>
        <p className="small"><strong>Hard budget:</strong> ${(rfq.hard_budget_cents / 100).toFixed(2)}</p>
        <p className="small"><strong>Hard latency ceiling:</strong> {rfq.hard_latency_ms_max}ms</p>
        <p className="small"><strong>Soft priorities (judged by GenLayer):</strong> {rfq.soft_policy_text}</p>
        <p className="small dim">
          Policy hash (Keccak256 of the exact text above, computed by the contract):{" "}
          <span className="mono">{rfq.soft_policy_hash}</span>
        </p>
        <p className="small dim">
          RFQ spec hash: <span className="mono">{rfq.rfq_hash}</span>
        </p>
        <p className="small dim">Creator: <span className="mono">{rfq.creator}</span></p>
      </div>

      <div className="card">
        <h3>Bids ({bids.length})</h3>
        {bids.length === 0 && <p className="dim small">No bids submitted yet.</p>}
        {bids.length > 0 && (
          <table>
            <thead>
              <tr><th>ID</th><th>Price</th><th>Latency</th><th>Seller</th><th>Status</th></tr>
            </thead>
            <tbody>
              {bids.map((b) => (
                <tr key={b.id} style={rfq.winning_bid_id === b.id ? { background: "var(--color-mint-wash)" } : undefined}>
                  <td className="mono">#{b.id}</td>
                  <td>${(b.price_cents / 100).toFixed(2)}</td>
                  <td>{b.latency_ms}ms</td>
                  <td className="mono">{b.seller.slice(0, 10)}…</td>
                  <td>
                    {rfq.winning_bid_id === b.id
                      ? "🏆 Winner"
                      : b.eliminated
                      ? <span className="dim">Eliminated: {b.elimination_reason}</span>
                      : "Survives hard filter"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {rfq.state === "OPEN" && (
          <div style={{ marginTop: 16, borderTop: "1px solid var(--border)", paddingTop: 16 }}>
            <h4>Submit a bid</h4>
            <div className="grid-2">
              <div className="field">
                <label>Price (USD)</label>
                <input type="number" min="0" step="0.01" value={bidPrice} onChange={(e) => setBidPrice(e.target.value)} />
              </div>
              <div className="field">
                <label>Latency (ms)</label>
                <input type="number" min="1" value={bidLatency} onChange={(e) => setBidLatency(e.target.value)} />
              </div>
            </div>
            <div className="field">
              <label>Public evidence URL (support/refund/uptime docs)</label>
              <input value={bidEvidenceUrl} onChange={(e) => setBidEvidenceUrl(e.target.value)} />
            </div>
            <p className="dim small">
              The bid commitment (bid_hash) is computed on-chain from this
              RFQ, your address, price, latency and evidence URL - it is not
              something you supply.
            </p>
            <button className="btn" onClick={handleSubmitBid}>
              {address ? "Sign & submit bid" : "Connect wallet to bid"}
            </button>
          </div>
        )}
      </div>

      <div className="card">
        <h3>Lifecycle actions</h3>
        <p className="small dim">
          Buttons only appear for transitions the contract currently allows —
          the UI never offers an action the contract would reject.
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {actions.includes("close_bidding") && (
            <button className="btn secondary" onClick={() => runAction((a, s) => closeBidding(a, rfqId, s))}>
              Close bidding
            </button>
          )}
          {actions.includes("filter_hard_constraints") && (
            <button className="btn secondary" onClick={() => runAction((a, s) => filterHardConstraints(a, rfqId, s))}>
              Run deterministic hard-constraint filter
            </button>
          )}
          {actions.includes("judge_award") && (
            <button className="btn" onClick={() => runAction((a, s) => judgeAward(a, rfqId, s))}>
              Request GenLayer judgment
            </button>
          )}
          {actions.includes("retry_judgment") && (
            <button className="btn" onClick={() => runAction((a, s) => retryJudgment(a, rfqId, s))}>
              Retry judgment ({rfq.judgment_attempts}/{rfq.max_judgment_attempts} attempts used)
            </button>
          )}
          {actions.includes("accept_award") && (
            <button className="btn" onClick={() => runAction((a, s) => acceptAward(a, rfqId, rfq.winning_bid_id, s))}>
              Accept award
            </button>
          )}
        </div>

        {rfq.state === "OPEN" && !isCreator && address && (
          <p className="dim small">Only the RFQ creator ({rfq.creator.slice(0, 10)}…) can close bidding.</p>
        )}
        {rfq.state === "NEEDS_CLARIFICATION" && isCreator && rfq.judgment_attempts >= rfq.max_judgment_attempts && (
          <p className="dim small">
            Maximum judgment attempts ({rfq.max_judgment_attempts}) reached — this RFQ cannot be retried further.
          </p>
        )}

        {state && <LifecycleTrack current={state} failed={failed} />}
        {actionError && (
          <div style={{ marginTop: 8 }}>
            <p className="field-error small">{actionError}</p>
            {actionErrorIsNetwork && (
              <button className="btn secondary" onClick={() => window.location.reload()}>
                Reload page
              </button>
            )}
          </div>
        )}
        {lastTx && (
          <p className="small dim">
            Last transaction: <a href={explorerTxUrl(lastTx)} target="_blank" rel="noreferrer" className="mono">{lastTx}</a>
          </p>
        )}
      </div>

      {receipt && (
        <div className="card">
          <h3>Award receipt</h3>
          <p className="small">
            <strong>Finality:</strong> {FINALITY_LABELS[receipt.finality_status]}
          </p>
          <p className="small dim">Policy hash: <span className="mono">{receipt.policy_hash}</span></p>
          <p className="small dim">Judgment attempts so far: {receipt.judgment_attempts}</p>
          <p className="small">Validator verdict (bounded JSON, not free-form prose):</p>
          <pre className="mono small" style={{ whiteSpace: "pre-wrap", background: "var(--bg-panel-2)", padding: 12, borderRadius: 8 }}>
            {receipt.verdict ? JSON.stringify(JSON.parse(receipt.verdict), null, 2) : "—"}
          </pre>
        </div>
      )}

      {(rfq.state === "NEEDS_CLARIFICATION" || rfq.state === "NO_VALID_BID") && (
        <div className="callout warn">
          {rfq.state === "NEEDS_CLARIFICATION"
            ? "Validator consensus could not reach a confident, evidence-backed decision (missing/contradictory evidence, or a material tie) and correctly refused to fabricate a winner. The buyer can retry judgment over the same policy and bids once evidence sources may have become reachable — nothing about the RFQ can be rewritten on retry."
            : "Every bid violated a hard constraint before any GenLayer call happened — there was nothing left to judge."}
        </div>
      )}
    </div>
  );
}
