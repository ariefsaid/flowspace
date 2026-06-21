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
  validatePrintMagicBytes,
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

describe("validatePrintMagicBytes (AC-0242b)", () => {
  // PDF magic: %PDF = 0x25 0x50 0x44 0x46
  const pdfBytes = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
  // PNG magic: 0x89 0x50 0x4e 0x47 ...
  const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  // JPEG magic: 0xff 0xd8 0xff
  const jpegBytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
  // ZIP/OpenXML: PK = 0x50 0x4b
  const zipBytes = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
  // OLE2 / Legacy Office: 0xd0 0xcf 0x11 0xe0
  const oleBytes = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1]);

  it("AC-0242b: PDF bytes pass for application/pdf", () => {
    expect(() => validatePrintMagicBytes(pdfBytes, "application/pdf")).not.toThrow();
  });

  it("AC-0242b: PNG bytes labeled as image/png pass", () => {
    expect(() => validatePrintMagicBytes(pngBytes, "image/png")).not.toThrow();
  });

  it("AC-0242b: JPEG bytes pass for image/jpeg", () => {
    expect(() => validatePrintMagicBytes(jpegBytes, "image/jpeg")).not.toThrow();
  });

  it("AC-0242b: ZIP bytes pass for openxml docx MIME", () => {
    expect(() =>
      validatePrintMagicBytes(
        zipBytes,
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      )
    ).not.toThrow();
  });

  it("AC-0242b: OLE bytes pass for application/msword", () => {
    expect(() =>
      validatePrintMagicBytes(oleBytes, "application/msword")
    ).not.toThrow();
  });

  it("AC-0242b: PNG bytes labeled as application/pdf throw INVALID_FILE_CONTENT", () => {
    expect(() =>
      validatePrintMagicBytes(pngBytes, "application/pdf")
    ).toThrow("INVALID_FILE_CONTENT");
  });

  it("AC-0242b: PDF bytes labeled as image/png throw INVALID_FILE_CONTENT", () => {
    expect(() =>
      validatePrintMagicBytes(pdfBytes, "image/png")
    ).toThrow("INVALID_FILE_CONTENT");
  });

  it("AC-0242b: unknown MIME type passes regardless of bytes (don't block unknowns)", () => {
    const randomBytes = Buffer.from([0x00, 0x01, 0x02, 0x03]);
    expect(() =>
      validatePrintMagicBytes(randomBytes, "application/octet-stream")
    ).not.toThrow();
  });

  it("AC-0242b: TIFF little-endian (II) bytes pass for image/tiff", () => {
    const tiffLE = Buffer.from([0x49, 0x49, 0x2a, 0x00]);
    expect(() => validatePrintMagicBytes(tiffLE, "image/tiff")).not.toThrow();
  });

  it("AC-0242b: TIFF big-endian (MM) bytes pass for image/tiff", () => {
    const tiffBE = Buffer.from([0x4d, 0x4d, 0x00, 0x2a]);
    expect(() => validatePrintMagicBytes(tiffBE, "image/tiff")).not.toThrow();
  });

  it("AC-0242b: wrong bytes for image/tiff throw INVALID_FILE_CONTENT", () => {
    expect(() =>
      validatePrintMagicBytes(pdfBytes, "image/tiff")
    ).toThrow("INVALID_FILE_CONTENT");
  });
});
