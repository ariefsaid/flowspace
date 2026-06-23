/**
 * Storage seam smoke test (Task 4.4 — scaffold only, no print billing domain).
 *
 * Proves: upload a tiny buffer → get a signed URL → assert it is a non-empty
 * string (resolves); clean up the object.
 *
 * Uses the admin (service-role) client so it bypasses Storage RLS — the seam
 * test is infrastructure-level, not a user-auth test.
 */
import { afterAll, describe, expect, it } from "vitest";
import {
  uploadPrintDocument,
  getSignedDownloadUrl,
  deletePrintDocument,
} from "@/lib/storage/uploads";

const TEST_ORG = "test-org";
const TEST_PATH = `${TEST_ORG}/smoke-test/${Date.now()}-test.pdf`;

afterAll(async () => {
  // Ensure the test object is removed even if the test fails.
  try {
    await deletePrintDocument(TEST_PATH);
  } catch {
    // Best-effort cleanup.
  }
}, 15_000);

describe("Storage seam — print-uploads bucket", () => {
  it(
    "can upload, get a signed URL, and delete an object",
    async () => {
      // Tiny synthetic PDF-like buffer (content doesn't matter for the seam test).
      const content = Buffer.from("%PDF-1.4 smoke-test");

      // Upload
      await expect(
        uploadPrintDocument(TEST_ORG, TEST_PATH, content)
      ).resolves.not.toThrow();

      // Signed URL
      const url = await getSignedDownloadUrl(TEST_ORG, TEST_PATH);
      expect(typeof url).toBe("string");
      expect(url.length).toBeGreaterThan(0);
      // The URL should point to the local Supabase Storage endpoint.
      expect(url).toContain("print-uploads");

      // Delete
      await expect(deletePrintDocument(TEST_PATH)).resolves.not.toThrow();
    },
    15_000
  );
});
