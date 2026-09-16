"use client";

import Link from "next/link";
import { useWallet } from "@/lib/wallet-context";

function short(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function SiteHeader() {
  const { address, connecting, error, connect, disconnect, chainId } = useWallet();

  return (
    <header className="header">
      <div className="brand">
        <Link href="/" className="brand-name" style={{ color: "inherit" }}>
          QUORDA
        </Link>
        <span className="brand-tag">Studio Next · chain {chainId}</span>
      </div>
      <nav className="nav">
        <Link href="/workspace">Workspace</Link>
        <Link href="/demo">Demo scenarios</Link>
      </nav>
      <div>
        {address ? (
          <button className="btn secondary" onClick={disconnect} title={address}>
            {short(address)}
          </button>
        ) : (
          <button className="btn" onClick={connect} disabled={connecting}>
            {connecting ? "Connecting…" : "Connect wallet"}
          </button>
        )}
        {error && <div className="field-error small">{error}</div>}
      </div>
    </header>
  );
}
