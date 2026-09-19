"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { listRfqIds, readRfq, type RfqView } from "@/lib/genlayer/contract";
import { StateBadge } from "@/components/StateBadge";
import { useWallet } from "@/lib/wallet-context";
import { friendlyErrorMessage, isLikelyRateLimitError } from "@/lib/errors";

// Studio Next permits a limited number of RPC reads per minute. Loading every
// historical RFQ in parallel makes the workspace unusable once a demo account
// has created a number of RFQs, so the landing view deliberately loads only
// the newest entries and keeps the calls sequential.
const WORKSPACE_RFQ_LIMIT = 12;

export default function WorkspacePage() {
  const { address } = useWallet();
  const [rfqs, setRfqs] = useState<RfqView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rateLimited, setRateLimited] = useState(false);
  const [loading, setLoading] = useState(true);
  const [totalRfqCount, setTotalRfqCount] = useState<number | null>(null);

  const load = useCallback(async () => {
      setLoading(true);
      setError(null);
      setRateLimited(false);
      try {
        const ids = await listRfqIds();
        setTotalRfqCount(ids.length);
        const latestIds = [...ids]
          .sort((a, b) => b - a)
          .slice(0, WORKSPACE_RFQ_LIMIT);
        const items: RfqView[] = [];
        for (const id of latestIds) {
          items.push(await readRfq(id));
        }
        setRfqs(items);
      } catch (e) {
        setRateLimited(isLikelyRateLimitError(e));
        setError(friendlyErrorMessage(e));
      } finally {
        setLoading(false);
      }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h1 style={{ margin: 0 }}>Workspace</h1>
        <Link href="/workspace/new" className="btn">New RFQ</Link>
      </div>

      {!address && (
        <div className="callout warn" style={{ marginBottom: 16 }}>
          Connect a wallet to create RFQs, submit bids, or run the lifecycle
          actions. Reads below work without a wallet.
        </div>
      )}

      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <h3 style={{ margin: 0 }}>Latest RFQs (on-chain state)</h3>
          <button className="btn secondary" onClick={() => void load()} disabled={loading}>
            {loading ? "Loading…" : "Refresh"}
          </button>
        </div>
        {totalRfqCount !== null && totalRfqCount > WORKSPACE_RFQ_LIMIT && (
          <p className="dim small">Showing the newest {WORKSPACE_RFQ_LIMIT} of {totalRfqCount} RFQs.</p>
        )}
        {loading && <p className="dim small">Loading from Studio Next…</p>}
        {error && (
          <div style={{ marginTop: 10 }}>
            <p className="field-error small">{error}</p>
            {rateLimited && <p className="dim small">The retry is read-only; it will not create or change anything.</p>}
            <button className="btn secondary" onClick={() => void load()}>Retry</button>
          </div>
        )}
        {!loading && !error && rfqs && rfqs.length === 0 && (
          <p className="dim small">No RFQs yet. Create one to get started.</p>
        )}
        {rfqs && rfqs.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>State</th>
                <th>Hard budget</th>
                <th>Bids</th>
                <th>Winning bid</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rfqs.map((rfq) => (
                <tr key={rfq.id}>
                  <td className="mono">#{rfq.id}</td>
                  <td><StateBadge state={rfq.state} /></td>
                  <td>${(rfq.hard_budget_cents / 100).toFixed(2)}</td>
                  <td>{rfq.bid_ids.length}</td>
                  <td>{rfq.winning_bid_id ? `#${rfq.winning_bid_id}` : "—"}</td>
                  <td><Link href={`/rfq/${rfq.id}`}>Open →</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
