/**
 * assertSafeHttpsUrl (I-042 security-fix round, finding 5 — Minor). Pure
 * shape guard shared by the UniFi cloud-console URL and the site's social
 * links: require https://, reject an obviously-internal/metadata host, and
 * allow empty (the caller decides whether the field is required).
 */
import { describe, it, expect } from "vitest";
import { assertSafeHttpsUrl } from "./url-guard";

describe("assertSafeHttpsUrl", () => {
  it("AC: an empty string is allowed (not a format error)", () => {
    expect(() => assertSafeHttpsUrl("", "url")).not.toThrow();
  });

  it("AC: a well-formed https:// URL on a public host is allowed", () => {
    expect(() =>
      assertSafeHttpsUrl("https://unifi.ui.com/consoles/ABC123/network/default/dashboard", "url"),
    ).not.toThrow();
  });

  it("AC: a http:// URL is rejected", () => {
    expect(() => assertSafeHttpsUrl("http://unifi.ui.com/console", "url")).toThrow("INVALID_URL:url");
  });

  it("AC: a non-URL string is rejected", () => {
    expect(() => assertSafeHttpsUrl("not-a-url", "url")).toThrow("INVALID_URL:url");
  });

  it.each([
    "https://localhost/console",
    "https://127.0.0.1/console",
    "https://169.254.169.254/latest/meta-data",
    "https://10.0.0.5/console",
    "https://172.16.0.5/console",
    "https://192.168.1.5/console",
    "https://box.local/console",
  ])("AC: an obviously-internal/metadata host (%s) is rejected", (value) => {
    expect(() => assertSafeHttpsUrl(value, "url")).toThrow("INVALID_URL:url");
  });

  it("AC: a public host that merely contains a private-looking substring is still allowed (host-anchored match, not a substring match)", () => {
    expect(() => assertSafeHttpsUrl("https://not10.example.com/console", "url")).not.toThrow();
  });
});
