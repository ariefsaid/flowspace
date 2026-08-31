/**
 * Outbound-URL shape guard (I-042 security-fix round, finding 5 — Minor).
 * No outbound request happens anywhere in I-042 — the UniFi cloud console
 * URL and the site's social links are config-only fields; the UniFi
 * connection test is fully simulated. This just tightens the STORED shape
 * so a settings field can't smuggle a non-https scheme or an obviously
 * internal/metadata host, ahead of I-045 wiring a real outbound call. Full
 * egress control (DNS-rebind-safe fetch, redirect pinning) is I-045 — this
 * is a cheap first gate, not SSRF defense.
 */

const INTERNAL_HOST_PATTERNS: RegExp[] = [
  /^localhost$/i,
  /^127\./, // loopback
  /^0\.0\.0\.0$/,
  /^169\.254\./, // link-local, incl. cloud metadata (169.254.169.254)
  /^10\./, // RFC1918
  /^172\.(1[6-9]|2\d|3[0-1])\./, // RFC1918
  /^192\.168\./, // RFC1918
  /\.local$/i,
  /^\[?::1\]?$/, // IPv6 loopback
];

/**
 * Throws `INVALID_URL:<field>` unless `value` is either empty (caller
 * decides whether the field is required) or a well-formed `https://` URL
 * whose hostname isn't loopback/link-local/private/metadata.
 */
export function assertSafeHttpsUrl(value: string, field: string): void {
  if (value === "") return;

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`INVALID_URL:${field}`);
  }

  if (parsed.protocol !== "https:") {
    throw new Error(`INVALID_URL:${field}`);
  }

  if (INTERNAL_HOST_PATTERNS.some((pattern) => pattern.test(parsed.hostname))) {
    throw new Error(`INVALID_URL:${field}`);
  }
}
