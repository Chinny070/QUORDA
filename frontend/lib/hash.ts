/** SHA-256 hex hash via the browser's native Web Crypto API - used to bind
 * RFQ specs, soft policy text and bid payloads to an immutable hash before
 * anything is sent on-chain (FR-02: hash and display immutable policy). */
export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
