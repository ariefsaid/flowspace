/**
 * Unit tests for lib/storage/uploads.ts — storage path scoping + MIME validation.
 *
 * AC-0241: upload path is org-scoped (orgId prefix + deterministic structure).
 * AC-0242: invalid MIME types are rejected before any storage call.
 *
 * Storage client is mocked — no real bucket I/O in unit tests.
 */
import { describe, it, expect } from "vitest";
import {
  buildPrintStoragePath,
  ALLOWED_PRINT_MIME_TYPES,
  MAX_PRINT_FILE_SIZE_BYTES,
  validatePrintFile,
} from "./uploads";

describe("buildPrintStoragePath", () => {
  it("AC-0241: path starts with orgId (org-scoped)", () => {
    const path = buildPrintStoragePath("org-abc", "job-123", "report.pdf");
    expect(path).toMatch(/^org-abc\//);
  });

  it("AC-0241: path includes print/ segment + jobId directory", () => {
    const path = buildPrintStoragePath("org-abc", "job-123", "report.pdf");
    expect(path).toBe("org-abc/print/job-123/report.pdf");
  });

  it("AC-0241: different orgs produce different path prefixes", () => {
    const pathA = buildPrintStoragePath("org-aaa", "job-x", "doc.pdf");
    const pathB = buildPrintStoragePath("org-bbb", "job-x", "doc.pdf");
    expect(pathA).not.toBe(pathB);
    expect(pathA.startsWith("org-aaa/")).toBe(true);
    expect(pathB.startsWith("org-bbb/")).toBe(true);
  });

  it("AC-0241: sanitises file name (strips leading slashes and path traversal)", () => {
    const path = buildPrintStoragePath("org-x", "job-1", "../evil/../../etc/passwd");
    // Must not contain '..' traversal segments
    expect(path).not.toContain("..");
    // Must still be org-scoped
    expect(path.startsWith("org-x/")).toBe(true);
  });

  it("AC-0241: truncates very long file names to 200 chars", () => {
    const longName = "a".repeat(300) + ".pdf";
    const path = buildPrintStoragePath("org-x", "job-1", longName);
    const segments = path.split("/");
    const fileName = segments[segments.length - 1];
    expect(fileName.length).toBeLessThanOrEqual(200);
  });
});

describe("validatePrintFile", () => {
  it("AC-0242: accepts PDF MIME type", () => {
    expect(() =>
      validatePrintFile("application/pdf", 1024 * 1024)
    ).not.toThrow();
  });

  it("AC-0242: accepts Word MIME types", () => {
    expect(() =>
      validatePrintFile("application/msword", 100)
    ).not.toThrow();
    expect(() =>
      validatePrintFile(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        100
      )
    ).not.toThrow();
  });

  it("AC-0242: accepts image types (PNG, JPEG)", () => {
    expect(() => validatePrintFile("image/png", 500)).not.toThrow();
    expect(() => validatePrintFile("image/jpeg", 500)).not.toThrow();
  });

  it("AC-0242: rejects disallowed MIME type (e.g. video/mp4)", () => {
    expect(() => validatePrintFile("video/mp4", 100)).toThrow("INVALID_FILE_TYPE");
  });

  it("AC-0242: rejects empty string MIME type", () => {
    expect(() => validatePrintFile("", 100)).toThrow("INVALID_FILE_TYPE");
  });

  it("AC-0242: rejects file exceeding size limit", () => {
    expect(() =>
      validatePrintFile("application/pdf", MAX_PRINT_FILE_SIZE_BYTES + 1)
    ).toThrow("FILE_TOO_LARGE");
  });

  it("AC-0242: accepts file exactly at size limit", () => {
    expect(() =>
      validatePrintFile("application/pdf", MAX_PRINT_FILE_SIZE_BYTES)
    ).not.toThrow();
  });

  it("AC-0242: ALLOWED_PRINT_MIME_TYPES includes standard office + image types", () => {
    const required = [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-powerpoint",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "image/jpeg",
      "image/png",
      "image/tiff",
    ];
    for (const mime of required) {
      expect(ALLOWED_PRINT_MIME_TYPES).toContain(mime);
    }
  });
});
