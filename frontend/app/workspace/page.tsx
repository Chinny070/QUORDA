"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { listRfqIds, readRfq, type RfqView } from "@/lib/genlayer/contract";
import { StateBadge } from "@/components/StateBadge";
import { useWallet } from "@/lib/wallet-context";

export default function WorkspacePage() {
  const { address } = useWallet();
  const [rfqs, setRfqs] = useState<RfqView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const ids = await listRfqIds();
        const items = await Promise.all(ids.map((id) => readRfq(id)));
        if (!cancelled) setRfqs(items.sort((a, b) => b.id - a.id));
      } catch (e) {
        if (!cancelled) {
          setError(
            e instanceof Error
              ? e.message
              : "Failed to load RFQs from the deployed contract."
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

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
        <h3>All RFQs (on-chain state)</h3>
        {loading && <p className="dim small">Loading from Studio Next…</p>}
        {error && <p className="field-error small">{error}</p>}
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
