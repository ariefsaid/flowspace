import type { NextConfig } from "next";

/**
 * Production-grade security response headers applied to every route. Kept
 * framework-level (not per-route) so new surfaces inherit them. A full CSP is
 * intentionally omitted here — it needs per-app nonce/style-src tuning and is
 * tracked as a follow-up; the headers below are the safe, no-tuning baseline.
 */
const securityHeaders = [
  // Force HTTPS once served over TLS (no-op on local http).
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  // Disallow framing (clickjacking) — the app has no embed use case.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  // No MIME sniffing.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Minimal referrer leakage.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Lock down powerful features the app does not use.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false, // don't advertise the framework
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
