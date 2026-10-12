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
  commitBid,
  revealBid,
  openAppeal,
  resolveAppeal,
  readSellerReputation,
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
import { parseJudgmentHistory, parseVerdict } from "@/lib/verdict";
import { createSealedBidSecret, type BidTerms } from "@/lib/agent-sdk";
import { awardReceiptFilename, createPortableAwardReceipt } from "@/lib/receipt-export";
import { QUORDA_CONTRACT_ADDRESS } from "@/lib/genlayer/contract";

const FINALITY_LABELS: Record<AwardReceiptView["finality_status"], string> = {
  ACCEPTED_FINAL: "Accepted — final",
  AWARDED_PENDING_ACCEPTANCE: "Awarded — pending buyer acceptance",
  AWARD_APPEAL_PENDING: "Award appeal pending buyer review",
  NEEDS_CLARIFICATION_PENDING_RETRY: "Needs clarification — pending retry",
  NO_VALID_BID_FINAL: "No valid bid — final",
  CANCELLED_FINAL: "Cancelled — final",
  NOT_YET_AWARDED: "Not yet awarded",
};

type SealedSecret = BidTerms & { commitmentHash: string; bidId: number };

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
  const [sealedSecret, setSealedSecret] = useState<SealedSecret | null>(null);
  const [appealReason, setAppealReason] = useState("");
  const [appealBidId, setAppealBidId] = useState("");
  const [reputationBySeller, setReputationBySeller] = useState<Record<string, string>>({});
  const [exportMessage, setExportMessage] = useState("");

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
      if (r.state === "AWARDED" || r.state === "APPEAL_PENDING" || r.state === "NEEDS_CLARIFICATION" || r.accepted) {
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

  useEffect(() => {
    if (!address || typeof window === "undefined") return;
    const key = `quorda:sealed:${QUORDA_CONTRACT_ADDRESS.toLowerCase()}:${rfqId}:${address.toLowerCase()}`;
    try {
      const stored = window.localStorage.getItem(key);
      setSealedSecret(stored ? JSON.parse(stored) as SealedSecret : null);
    } catch {
      setSealedSecret(null);
    }
  }, [address, rfqId]);

  async function runAction(
    actionName: string,
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
      rememberTx(actionName, txHash);
      await load();
    } catch (e) {
      setFailed(true);
      setActionErrorIsNetwork(isLikelyNetworkError(e));
      setActionError(friendlyErrorMessage(e));
    }
  }

  function rememberTx(actionName: string, txHash: string) {
    setLastTx(txHash);
    if (typeof window === "undefined") return;
    const key = `quorda:transactions:${QUORDA_CONTRACT_ADDRESS.toLowerCase()}:${rfqId}`;
    try {
      const prior = JSON.parse(window.localStorage.getItem(key) || "[]") as { action: string; hash: string }[];
      window.localStorage.setItem(key, JSON.stringify([...prior, { action: actionName, hash: txHash }].slice(-40)));
    } catch {
      window.localStorage.setItem(key, JSON.stringify([{ action: actionName, hash: txHash }]));
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
      rememberTx("submit_bid", txHash);
      await load();
    } catch (e) {
      setFailed(true);
      setActionErrorIsNetwork(isLikelyNetworkError(e));
      setActionError(friendlyErrorMessage(e));
    }
  }

  function sealedSecretStorageKey(seller: string) {
    return `quorda:sealed:${QUORDA_CONTRACT_ADDRESS.toLowerCase()}:${rfqId}:${seller.toLowerCase()}`;
  }

  async function handleCommitSealedBid() {
    if (!address) {
      await connect();
      return;
    }
    setActionError(null);
    setFailed(false);
    setState(null);
    try {
      const secret = createSealedBidSecret(rfqId, address, {
        priceCents: Math.round(parseFloat(bidPrice) * 100),
        latencyMs: parseInt(bidLatency, 10),
        evidenceUrl: bidEvidenceUrl,
      });
      const pendingSecret = { ...secret, bidId: 0 };
      window.localStorage.setItem(sealedSecretStorageKey(address), JSON.stringify(pendingSecret));
      setSealedSecret(pendingSecret);
      const { txHash } = await commitBid(address, rfqId, secret.commitmentHash, setState);
      rememberTx("commit_bid", txHash);
      try {
        const refreshed = await readRfq(rfqId);
        const unconfirmedIds = [...refreshed.bid_ids].reverse();
        for (const id of unconfirmedIds) {
          const candidate = await readBid(id);
          if (candidate.seller.toLowerCase() === address.toLowerCase() && candidate.bid_hash.toLowerCase() === secret.commitmentHash.slice(2).toLowerCase()) {
            const saved = { ...pendingSecret, bidId: id };
            window.localStorage.setItem(sealedSecretStorageKey(address), JSON.stringify(saved));
            setSealedSecret(saved);
            break;
          }
        }
      } catch {
        // Keep the reveal secret locally; the bid is already committed and the
        // contract remains the source of truth when the page is refreshed.
      }
      await load();
    } catch (e) {
      setFailed(true);
      setActionErrorIsNetwork(isLikelyNetworkError(e));
      setActionError(friendlyErrorMessage(e));
    }
  }

  async function handleRevealSealedBid() {
    if (!address || !sealedSecret) return;
    setActionError(null);
    setFailed(false);
    setState(null);
    try {
      let commitmentId = sealedSecret.bidId;
      if (!commitmentId) {
        const refreshed = await readRfq(rfqId);
        for (const id of [...refreshed.bid_ids].reverse()) {
          const candidate = await readBid(id);
          if (candidate.seller.toLowerCase() === address.toLowerCase() && candidate.bid_hash.toLowerCase() === sealedSecret.commitmentHash.slice(2).toLowerCase() && !candidate.revealed) {
            commitmentId = id;
            break;
          }
        }
      }
      if (!commitmentId) throw new Error("Could not find this wallet's unrevealed on-chain commitment. Refresh the RFQ and check your reveal file.");
      const { txHash } = await revealBid(address, rfqId, commitmentId, sealedSecret, setState);
      rememberTx("reveal_bid", txHash);
      await load();
    } catch (e) {
      setFailed(true);
      setActionErrorIsNetwork(isLikelyNetworkError(e));
      setActionError(friendlyErrorMessage(e));
    }
  }

  function downloadRevealSecret() {
    if (!sealedSecret) return;
    const blob = new Blob([JSON.stringify({ format: "quorda-sealed-bid-reveal-v1", rfqId, seller: address, ...sealedSecret }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `quorda-rfq-${rfqId}-sealed-bid-reveal.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function importRevealSecret(file: File | undefined) {
    if (!file || !address) return;
    try {
      const imported = JSON.parse(await file.text()) as SealedSecret & { format?: string; seller?: string; rfqId?: number };
      if (imported.format !== "quorda-sealed-bid-reveal-v1" || imported.rfqId !== rfqId || imported.seller?.toLowerCase() !== address.toLowerCase() || !/^0x[0-9a-f]{64}$/i.test(imported.commitmentHash) || !/^[0-9a-f]{64}$/i.test(imported.salt)) {
        throw new Error("This reveal file does not match the connected seller and this RFQ.");
      }
      const secret = { priceCents: imported.priceCents, latencyMs: imported.latencyMs, evidenceUrl: imported.evidenceUrl, salt: imported.salt, commitmentHash: imported.commitmentHash, bidId: imported.bidId };
      window.localStorage.setItem(sealedSecretStorageKey(address), JSON.stringify(secret));
      setSealedSecret(secret);
      setActionError(null);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Could not read that reveal file.");
    }
  }

  async function handleOpenAppeal() {
    if (!address || !appealBidId) return;
    await runAction("open_appeal", (account, onState) => openAppeal(account, rfqId, Number(appealBidId), appealReason, onState));
  }

  async function handleResolveAppeal() {
    await runAction("resolve_appeal", (account, onState) => resolveAppeal(account, rfqId, onState));
  }

  async function loadSellerReputation(seller: string) {
    try {
      const result = await readSellerReputation(seller as `0x${string}`) as { accepted_wins: number; bids_submitted: number; hard_eliminations: number; clarification_events: number };
      setReputationBySeller((current) => ({
        ...current,
        [seller.toLowerCase()]: `${result.accepted_wins} buyer-accepted wins · ${result.bids_submitted} bids · ${result.hard_eliminations} hard-filter eliminations · ${result.clarification_events} clarification rounds`,
      }));
    } catch (e) {
      setReputationBySeller((current) => ({ ...current, [seller.toLowerCase()]: friendlyErrorMessage(e) }));
    }
  }

  function downloadReceipt() {
    if (!rfq || !receipt) return;
    const transactionKey = `quorda:transactions:${QUORDA_CONTRACT_ADDRESS.toLowerCase()}:${rfqId}`;
    let transactionHashes: { action: string; hash: string }[] = [];
    try { transactionHashes = JSON.parse(window.localStorage.getItem(transactionKey) || "[]"); } catch { /* optional browser-local tx index */ }
    const portableReceipt = createPortableAwardReceipt({
      rfq,
      bids,
      receipt,
      parsedVerdict: verdict,
      contractAddress: QUORDA_CONTRACT_ADDRESS,
      transactionHashes,
    });
    const blob = new Blob([JSON.stringify(portableReceipt, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = awardReceiptFilename(rfqId);
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
    setExportMessage("Receipt JSON downloaded. The transaction list reflects only transactions observed in this browser.");
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
    hasLosingBid: bids.some((bid) => address && bid.seller.toLowerCase() === address.toLowerCase() && bid.id !== rfq.winning_bid_id && !bid.eliminated),
    appealUsed: rfq.appeal_used,
    sealedBids: rfq.sealed_bids,
    revealDeadline: rfq.reveal_deadline,
    nowMs: Date.now(),
  });
  const nowMs = Date.now();
  const canCommitSealedBid = rfq.sealed_bids && nowMs < Date.parse(rfq.deadline);
  const canRevealSealedBid = rfq.sealed_bids && nowMs >= Date.parse(rfq.deadline) && nowMs < Date.parse(rfq.reveal_deadline);
  const ownUnrevealedBid = bids.find((bid) => address && bid.seller.toLowerCase() === address.toLowerCase() && !bid.revealed);
  const verdict = receipt?.verdict ? parseVerdict(receipt.verdict) : null;
  const judgmentHistory = receipt?.judgment_history ? parseJudgmentHistory(receipt.judgment_history) : [];
  const citedBids = verdict
    ? bids.filter((bid) => verdict.evidenceRefs.includes(String(bid.id)))
    : [];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <h1 style={{ margin: 0 }}>RFQ #{rfq.id}</h1>
        <StateBadge state={rfq.state} />
      </div>

      <div className="card">
        <h3>What the buyer needs</h3>
        <p className="small"><strong>Hard budget:</strong> ${(rfq.hard_budget_cents / 100).toFixed(2)}</p>
        <p className="small"><strong>Hard latency ceiling:</strong> {rfq.hard_latency_ms_max}ms</p>
        <p className="small"><strong>How to choose among qualifying offers:</strong> {rfq.soft_policy_text}</p>
        {rfq.criteria_json !== "[]" && <div className="receipt-section">
          <strong>Published scoring weights</strong>
          <ul>{(JSON.parse(rfq.criteria_json) as { name: string; description: string; weight: number }[]).map((criterion) => <li key={criterion.name}><strong>{criterion.name} — {criterion.weight}%:</strong> {criterion.description}</li>)}</ul>
        </div>}
        <details className="verification-details">
          <summary>Technical verification details</summary>
          <p className="small dim">The contract locked the exact criteria shown above when this RFQ was created. These are public fingerprints anyone can use to verify they have not changed.</p>
          <p className="small dim">Policy fingerprint: <span className="mono">{rfq.soft_policy_hash}</span></p>
          <p className="small dim">RFQ fingerprint: <span className="mono">{rfq.rfq_hash}</span></p>
          <p className="small dim">Scoring criteria fingerprint: <span className="mono">{rfq.criteria_hash}</span></p>
          <p className="small dim">Complete committed terms: <span className="mono">{rfq.terms_hash}</span></p>
          <p className="small dim">Buyer wallet: <span className="mono">{rfq.creator}</span></p>
        </details>
      </div>

      <div className="card">
        <h3>Bids ({bids.length})</h3>
        {bids.length === 0 && <p className="dim small">No bids submitted yet.</p>}
        {bids.length > 0 && (
          <table>
            <thead>
              <tr><th>Offer</th><th>Price</th><th>Latency</th><th>Seller / track record</th><th>Public support</th><th>Status</th></tr>
            </thead>
            <tbody>
              {bids.map((b) => (
                <tr key={b.id} style={rfq.winning_bid_id === b.id ? { background: "var(--color-mint-wash)" } : undefined}>
                  <td>Bid #{b.id}</td>
                  <td>{b.revealed ? `$${(b.price_cents / 100).toFixed(2)}` : "Sealed"}</td>
                  <td>{b.revealed ? `${b.latency_ms}ms` : "Sealed"}</td>
                  <td><div className="seller-track-record"><span className="mono">{b.seller.slice(0, 10)}…</span><span className="dim small">{b.seller_wins_at_bid} accepted wins at bid time</span>{!reputationBySeller[b.seller.toLowerCase()] ? <button className="btn secondary small" onClick={() => void loadSellerReputation(b.seller)}>Full track record</button> : <span className="dim small">{reputationBySeller[b.seller.toLowerCase()]}</span>}</div></td>
                  <td>{b.revealed && b.evidence_url ? <a href={b.evidence_url} target="_blank" rel="noreferrer">View source ↗</a> : "Not revealed"}</td>
                  <td>
                    {rfq.winning_bid_id === b.id
                      ? "🏆 Winner"
                      : !b.revealed
                      ? <span className="dim">Commitment not yet revealed</span>
                      : b.eliminated
                      ? <span className="dim">Eliminated: {b.elimination_reason}</span>
                      : "Survives hard filter"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {rfq.state === "OPEN" && !rfq.sealed_bids && (
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
            <p className="dim small">Your offer is permanently tied to this RFQ, your wallet, price, latency and source link when you submit. QUORDA never asks you to create a technical hash.</p>
            <button className="btn" onClick={handleSubmitBid}>
              {address ? "Sign & submit bid" : "Connect wallet to bid"}
            </button>
          </div>
        )}
        {rfq.state === "OPEN" && rfq.sealed_bids && (
          <div style={{ marginTop: 16, borderTop: "1px solid var(--border)", paddingTop: 16 }}>
            <h4>Sealed bid commit and reveal</h4>
            {canCommitSealedBid && !ownUnrevealedBid && <>
              <p className="dim small">Your terms remain private until after the bid deadline. QUORDA saves a random reveal secret in this browser before submitting the commitment. Download the reveal file and keep it safe; without it the bid cannot be revealed.</p>
              <div className="grid-2">
                <div className="field"><label>Price (USD)</label><input type="number" min="0" step="0.01" value={bidPrice} onChange={(e) => setBidPrice(e.target.value)} /></div>
                <div className="field"><label>Latency (ms)</label><input type="number" min="1" value={bidLatency} onChange={(e) => setBidLatency(e.target.value)} /></div>
              </div>
              <div className="field"><label>Public evidence URL (revealed after the deadline)</label><input value={bidEvidenceUrl} onChange={(e) => setBidEvidenceUrl(e.target.value)} /></div>
              <button className="btn" onClick={handleCommitSealedBid}>{address ? "Commit sealed bid" : "Connect wallet to commit"}</button>
            </>}
            {ownUnrevealedBid && <p className="small">Your sealed commitment is on-chain as Bid #{ownUnrevealedBid.id}.</p>}
            {canRevealSealedBid && ownUnrevealedBid && sealedSecret && <div className="callout warn">
              <p>Your bid is in the reveal window. Reveal the exact terms from your saved secret file before {new Date(rfq.reveal_deadline).toLocaleString()}.</p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><button className="btn" onClick={handleRevealSealedBid}>Reveal my bid</button><button className="btn secondary" onClick={downloadRevealSecret}>Download reveal file</button></div>
            </div>}
            {canRevealSealedBid && ownUnrevealedBid && !sealedSecret && <div className="callout danger">No reveal secret is saved in this browser. Choose the saved reveal file from the wallet that created the commitment to reveal it.<input type="file" accept="application/json,.json" onChange={(e) => void importRevealSecret(e.target.files?.[0])} /></div>}
            {!canCommitSealedBid && !canRevealSealedBid && <p className="dim small">Commit deadline: {new Date(rfq.deadline).toLocaleString()}. Reveal deadline: {new Date(rfq.reveal_deadline).toLocaleString()}.</p>}
            {sealedSecret && <button className="btn secondary" onClick={downloadRevealSecret}>Download reveal file backup</button>}
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
            <button className="btn secondary" onClick={() => runAction("close_bidding", (a, s) => closeBidding(a, rfqId, s))}>
              Close bidding
            </button>
          )}
          {actions.includes("filter_hard_constraints") && (
            <button className="btn secondary" onClick={() => runAction("filter_hard_constraints", (a, s) => filterHardConstraints(a, rfqId, s))}>
              Run deterministic hard-constraint filter
            </button>
          )}
          {actions.includes("judge_award") && (
            <button className="btn" onClick={() => runAction("judge_award", (a, s) => judgeAward(a, rfqId, s))}>
              Request GenLayer judgment
            </button>
          )}
          {actions.includes("retry_judgment") && (
            <button className="btn" onClick={() => runAction("retry_judgment", (a, s) => retryJudgment(a, rfqId, s))}>
              Retry judgment ({rfq.judgment_attempts}/{rfq.max_judgment_attempts} attempts used)
            </button>
          )}
          {actions.includes("accept_award") && (
            <button className="btn" onClick={() => runAction("accept_award", (a, s) => acceptAward(a, rfqId, rfq.winning_bid_id, s))}>
              Confirm selected offer
            </button>
          )}
          {actions.includes("resolve_appeal") && <button className="btn" onClick={handleResolveAppeal}>Review appeal with GenLayer</button>}
        </div>

        {actions.includes("open_appeal") && (
          <div className="receipt-section">
            <strong>Request one award review</strong>
            <p className="dim small">Only a seller with a non-winning bid that passed the hard filter can appeal. The buyer&apos;s original policy and all bids remain unchanged; the appeal reason is treated as untrusted evidence.</p>
            <div className="field"><label htmlFor="appeal-bid">Your losing bid</label><select id="appeal-bid" value={appealBidId} onChange={(e) => setAppealBidId(e.target.value)}><option value="">Choose a bid</option>{bids.filter((bid) => address && bid.seller.toLowerCase() === address.toLowerCase() && bid.id !== rfq.winning_bid_id && !bid.eliminated).map((bid) => <option value={bid.id} key={bid.id}>Bid #{bid.id}</option>)}</select></div>
            <div className="field"><label htmlFor="appeal-reason">What specific evidence or process issue should be reviewed? (10–500 characters)</label><textarea id="appeal-reason" maxLength={500} value={appealReason} onChange={(e) => setAppealReason(e.target.value)} /></div>
            <button className="btn secondary" disabled={!appealBidId || appealReason.trim().length < 10} onClick={handleOpenAppeal}>Submit appeal</button>
          </div>
        )}

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
          <h3>Decision receipt</h3>
          <p className="small">
            <strong>Decision status:</strong> {FINALITY_LABELS[receipt.finality_status]}
          </p>
          {rfq.winning_bid_id > 0 && <p className="small"><strong>Selected offer:</strong> Bid #{rfq.winning_bid_id}</p>}
          {verdict ? (
            <>
              <p className="small"><strong>Consensus confidence:</strong> {verdict.confidenceBand}</p>
              <div className="receipt-section">
                <strong>What the validators found</strong>
                {verdict.findings.length > 0 ? <ul>{verdict.findings.map((finding, index) => <li key={index}>{finding}</li>)}</ul> : <p className="dim small">No additional findings were recorded.</p>}
              </div>
              <div className="receipt-section">
                <strong>Sources considered</strong>
                {citedBids.length > 0 ? (
                  <ul>{citedBids.map((bid) => <li key={bid.id}>Bid #{bid.id}: <a href={bid.evidence_url} target="_blank" rel="noreferrer">open public source ↗</a></li>)}</ul>
                ) : <p className="dim small">No source was relied upon for this outcome.</p>}
                <p className="dim small">Sources are public seller-supplied claims, not facts guaranteed by QUORDA.</p>
              </div>
              {verdict.weightedScores.length > 0 && <div className="receipt-section">
                <strong>Weighted results calculated by the contract</strong>
                <ul>{verdict.weightedScores.map((row) => <li key={String(row.bid_id)}>Bid #{String(row.bid_id)}: {(Number(row.weighted_total_basis_points) / 100).toFixed(2)} / 100</li>)}</ul>
                <p className="dim small">Validators supplied cited 0–100 criterion ratings. The contract applied the buyer&apos;s committed weights and selected the unique highest total.</p>
              </div>}
              <div className="receipt-section">
                <strong>Evidence fingerprints at judgment time</strong>
                {Object.keys(verdict.evidenceStatus).length > 0 ? <ul>{Object.entries(verdict.evidenceStatus).map(([bidId, status]) => <li key={bidId}>Bid #{bidId}: {status}{verdict.evidenceCommitments[bidId] ? <> · Keccak-256 <span className="mono">{verdict.evidenceCommitments[bidId]}</span></> : " · no content digest was available"}</li>)}</ul> : <p className="dim small">This round did not fetch web evidence.</p>}
                <p className="dim small">A digest proves which returned bytes were committed; it does not prove that the seller&apos;s claim is true or guarantee those bytes remain hosted.</p>
              </div>
              {verdict.questions.length > 0 && (
                <div className="receipt-section"><strong>Still unresolved</strong><ul>{verdict.questions.map((question, index) => <li key={index}>{question}</li>)}</ul></div>
              )}
            </>
          ) : <p className="dim small">The contract recorded no readable verdict details for this receipt.</p>}
          <details className="verification-details">
            <summary>Technical verification details</summary>
            <p className="small dim">Policy fingerprint: <span className="mono">{receipt.policy_hash}</span></p>
            <p className="small dim">Criteria fingerprint: <span className="mono">{receipt.criteria_hash}</span></p>
            <p className="small dim">Complete terms fingerprint: <span className="mono">{receipt.terms_hash}</span></p>
            <p className="small dim">Judgment attempts: {receipt.judgment_attempts}</p>
            <p className="small dim">Raw contract verdict:</p>
            <pre className="mono small" style={{ whiteSpace: "pre-wrap", background: "var(--bg-panel-2)", padding: 12, borderRadius: 8 }}>{receipt.verdict || "—"}</pre>
            <p className="small dim">Review history (each entry includes the accepted round verdict and its evidence digests):</p>
            <pre className="mono small" style={{ whiteSpace: "pre-wrap", background: "var(--bg-panel-2)", padding: 12, borderRadius: 8 }}>{JSON.stringify(judgmentHistory, null, 2)}</pre>
          </details>
          {receipt.appeal_used && <p className="small"><strong>Appeal result:</strong> {receipt.appeal_result || "Appeal recorded"} (appealing bid #{receipt.appeal_bid_id})</p>}
          <button className="btn secondary" onClick={downloadReceipt}>Download verifiable receipt JSON</button>
          {exportMessage && <p className="small dim">{exportMessage}</p>}
        </div>
      )}

      {rfq.state === "APPEAL_PENDING" && (
        <div className="callout warn"><strong>Appeal submitted.</strong> The original award is held for review. The buyer will run one more consensus round using the original policy, original bid set, and public evidence. The appeal itself cannot rewrite the buyer&apos;s criteria.</div>
      )}

      {rfq.state === "AWARDED" && (
        <div className="callout">
          <strong>What happens next:</strong> the buyer can confirm the selected offer above. QUORDA records the decision and acceptance; the purchase agreement, payment and delivery happen directly between buyer and seller outside this app.
        </div>
      )}

      {rfq.accepted && (
        <div className="callout">
          <strong>Decision accepted.</strong> The buyer&apos;s acceptance is recorded on-chain. Share this receipt with the selected seller to begin the off-chain purchase or service agreement.
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
