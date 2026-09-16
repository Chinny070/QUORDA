/**
 * QUORDA - Studio Next chain configuration.
 *
 * Hackathon non-negotiable: this app talks to Studio Next only.
 *   Public name : Studio Next
 *   Chain ID    : 61997
 *   Explorer    : https://explorer-studio-dev.genlayer.com/
 *   gltest name : studio_devnet
 *   JS chain    : studioDevnet
 *
 * genlayer-js@2.0.0-rc.1 ships a built-in `studioDevnet` chain definition,
 * but its bundled default RPC resolves to studio-dev.genlayer.com. The
 * Agent Tank announcement designates studio-next.genlayer.com as the
 * canonical hackathon RPC for the same 61997 preview environment, so it is
 * pinned explicitly here rather than trusting the SDK default silently.
 */

import { studioDevnet } from "genlayer-js/chains";

export const QUORDA_CHAIN_ID = 61997;
export const QUORDA_RPC_URL = "https://studio-next.genlayer.com/api";
export const QUORDA_EXPLORER_URL = "https://explorer-studio-dev.genlayer.com/";

export const quordaChain = {
  ...studioDevnet,
  rpcUrls: {
    ...studioDevnet.rpcUrls,
    default: { http: [QUORDA_RPC_URL] },
  },
};

export function explorerTxUrl(txHash: string): string {
  return `${QUORDA_EXPLORER_URL}tx/${txHash}`;
}

export function explorerAddressUrl(address: string): string {
  return `${QUORDA_EXPLORER_URL}address/${address}`;
}
