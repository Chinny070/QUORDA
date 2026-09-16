"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { connectWallet, getInjectedProvider, type Address } from "./genlayer/client";
import { QUORDA_CHAIN_ID } from "./genlayer/chain";

interface WalletContextValue {
  address: Address | null;
  connecting: boolean;
  error: string | null;
  chainId: number;
  connect: () => Promise<void>;
  disconnect: () => void;
}

const WalletContext = createContext<WalletContextValue | null>(null);

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [address, setAddress] = useState<Address | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connect = useCallback(async () => {
    setError(null);
    setConnecting(true);
    try {
      if (!getInjectedProvider()) {
        throw new Error(
          "No injected wallet detected. Install a browser wallet extension (e.g. MetaMask) and reload."
        );
      }
      const addr = await connectWallet();
      setAddress(addr);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to connect wallet.");
      setAddress(null);
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    setAddress(null);
    setError(null);
  }, []);

  const value = useMemo(
    () => ({ address, connecting, error, chainId: QUORDA_CHAIN_ID, connect, disconnect }),
    [address, connecting, error, connect, disconnect]
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used within WalletProvider");
  return ctx;
}
