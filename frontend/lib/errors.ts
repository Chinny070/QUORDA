/**
 * Studio Next (this hackathon's preview environment) occasionally drops
 * connections mid-request. When that happens during a write's
 * fee-estimate/submit/finalization steps, the underlying error is a raw
 * browser-level message like "Failed to fetch" - technically accurate but
 * meaningless to someone testing the app, and it gives no indication that
 * the transaction may have actually gone through on-chain even though the
 * UI lost track of it.
 *
 * This turns that class of error into an actionable message, and flags it
 * so the UI can offer a reload action instead of just showing red text.
 */

const NETWORK_ERROR_PATTERNS = [
  "failed to fetch",
  "network error",
  "networkerror",
  "econnreset",
  "connection aborted",
  "connection reset",
  "err_network",
  "err_internet_disconnected",
  "502",
  "503",
  "504",
  "bad gateway",
  "gateway timeout",
  "timed out",
  "timeout",
];

const RATE_LIMIT_PATTERNS = [
  "rate limit",
  "too many requests",
  "429",
  "30 requests per minute",
];

export function isLikelyNetworkError(error: unknown): boolean {
  const text = errorText(error).toLowerCase();
  return NETWORK_ERROR_PATTERNS.some((p) => text.includes(p));
}

export function isLikelyRateLimitError(error: unknown): boolean {
  const text = errorText(error).toLowerCase();
  return RATE_LIMIT_PATTERNS.some((p) => text.includes(p));
}

export function friendlyErrorMessage(error: unknown): string {
  if (isLikelyRateLimitError(error)) {
    return (
      "Studio Next is temporarily rate-limiting read requests. No transaction " +
      "has failed. Wait a few seconds, then use Retry to refresh the latest " +
      "on-chain RFQs."
    );
  }
  if (isLikelyNetworkError(error)) {
    return (
      "Lost connection to Studio Next while waiting on this transaction. " +
      "This is a network hiccup, not a problem with the transaction itself " +
      "— it may have already gone through. Reload this page to see the " +
      "current on-chain state before trying again."
    );
  }
  return errorText(error) || "Transaction failed.";
}

function errorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}
