/**
 * QUORDA - GenLayer client wrapper.
 *
 * Thin wrapper around genlayer-js@2.0.0-rc.1's real client surface
 * (createClient / readContract / writeContract / estimateTransactionFeesForWrite
 * / waitForDecision / waitForFinalization), verified against the installed
 * package's type declarations rather than guessed. Injected wallet only -
 * no private keys ever touch this app.
 */

import { createClient } from "genlayer-js";
import { quordaChain, QUORDA_CHAIN_ID } from "./chain";

export type Address = `0x${string}`;

/** String literal union matching genlayer-js's internal TransactionHashVariant
 * enum ("latest-final" | "latest-nonfinal"). Not re-exported as a runtime
 * value by genlayer-js@2.0.0-rc.1, so the literal values are used directly. */
export const TransactionHashVariant = {
  LATEST_FINAL: "latest-final",
  LATEST_NONFINAL: "latest-nonfinal",
} as const;

export type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
};

declare global {
  interface Window {
    ethereum?: EthereumProvider;
  }
}

export function getInjectedProvider(): EthereumProvider | undefined {
  if (typeof window === "undefined") return undefined;
  return window.ethereum;
}

/** Requests wallet connection and ensures the wallet is on Studio Next (61997). */
export async function connectWallet(): Promise<Address> {
  const provider = getInjectedProvider();
  if (!provider) {
    throw new Error(
      "No injected wallet found. Install a browser wallet extension to use QUORDA."
    );
  }

  const accounts = (await provider.request({
    method: "eth_requestAccounts",
  })) as string[];

  if (!accounts || accounts.length === 0) {
    throw new Error("Wallet connection was rejected or returned no accounts.");
  }

  const chainIdHex = (await provider.request({ method: "eth_chainId" })) as string;
  const currentChainId = parseInt(chainIdHex, 16);

  if (currentChainId !== QUORDA_CHAIN_ID) {
    try {
      await provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: `0x${QUORDA_CHAIN_ID.toString(16)}` }],
      });
    } catch {
      try {
        await provider.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: `0x${QUORDA_CHAIN_ID.toString(16)}`,
              chainName: quordaChain.name,
              rpcUrls: quordaChain.rpcUrls.default.http,
              nativeCurrency: quordaChain.nativeCurrency,
            },
          ],
        });
      } catch (err) {
        throw new Error(
          `Please switch your wallet to Studio Next (chain ${QUORDA_CHAIN_ID}) and try again.`
        );
      }
    }
  }

  return accounts[0] as Address;
}

/** Creates a client bound to the connected wallet address for writes. */
export function getWalletClient(account: Address) {
  const provider = getInjectedProvider();
  if (!provider) {
    throw new Error("No injected wallet found.");
  }
  return createClient({
    chain: quordaChain,
    account,
    provider,
  });
}

/** Creates a read-only client (no signer required) for view calls. */
export function getReadClient() {
  return createClient({ chain: quordaChain });
}
