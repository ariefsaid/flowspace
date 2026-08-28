// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PDFDocument } from "pdf-lib";

vi.mock("@/lib/auth/session", () => ({
  requireSession: vi.fn().mockResolvedValue({ id: "member-1", orgId: "org-1", role: "MEMBER" }),
}));
vi.mock("@/lib/storage/uploads", async (original) => ({
  ...(await original<typeof import("@/lib/storage/uploads")>()),
  uploadPrintDocument: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/db/print", () => ({ submitPrintJob: vi.fn().mockResolvedValue({ id: "job-1" }) }));

import { requireSession } from "@/lib/auth/session";
import { uploadPrintDocument } from "@/lib/storage/uploads";
import { submitPrintJob } from "@/lib/db/print";
import { submitPrintJobAction } from "./actions";

function form(fields: Record<string, string>, file?: Blob, fileName = "doc.pdf") {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  if (file) fd.set("file", file, fileName);
  return fd;
}

async function tinyPdf() {
  const pdf = await PDFDocument.create();
  pdf.addPage();
  return new Blob([await pdf.save() as unknown as BlobPart], { type: "application/pdf" });
}

beforeEach(() => vi.clearAllMocks());

describe("submitPrintJobAction I-043 contract", () => {
  it(": rejects non-positive document pages and copies before Storage", async () => {
    const file = new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], { type: "image/png" });
    await expect(submitPrintJobAction(form({ documentPages: "0", copies: "1", colorMode: "BW", pageRange: "all", duplex: "false" }, file, "doc.png"))).rejects.toThrow(/INVALID_DOCUMENT_PAGES/);
    await expect(submitPrintJobAction(form({ documentPages: "1", copies: "0", colorMode: "BW", pageRange: "all", duplex: "false" }, file, "doc.png"))).rejects.toThrow(/INVALID_COPIES/);
    expect(uploadPrintDocument).not.toHaveBeenCalled();
  });

  it("derives PDF pages from bytes and forwards the strict server contract", async () => {
    const file = await tinyPdf();
    await submitPrintJobAction(form({ documentPages: "999", copies: "2", colorMode: "BW", paperSize: "A4", pageRange: "all", duplex: "true" }, file));
    const input = vi.mocked(submitPrintJob).mock.calls[0][0];
    expect(input.documentPages).toBe(1);
    expect(input.pageRange).toBe("all");
    expect(input.copies).toBe(2);
    expect(input.printerId).toBeUndefined();
    expect(input.storagePath).toMatch(/^org-1\/print\/.+\/doc\.pdf$/);
  });

  it("requires metadata pages for accepted non-PDF files and rejects spoofed MIME", async () => {
    const png = new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], { type: "image/png" });
    await expect(submitPrintJobAction(form({ copies: "1", colorMode: "BW", pageRange: "all", duplex: "false" }, png, "doc.png"))).rejects.toThrow(/INVALID_DOCUMENT_PAGES/);
    const text = new Blob(["not a png"], { type: "image/png" });
    await expect(submitPrintJobAction(form({ documentPages: "1", copies: "1", colorMode: "BW", pageRange: "all", duplex: "false" }, text, "doc.png"))).rejects.toThrow(/INVALID_FILE_CONTENT/);
    expect(uploadPrintDocument).not.toHaveBeenCalled();
  });

  it("AC-631: missing session fails before Storage or repository calls", async () => {
    vi.mocked(requireSession).mockRejectedValueOnce(new Error("UNAUTHENTICATED"));
    await expect(submitPrintJobAction(form({ documentPages: "1", copies: "1", colorMode: "BW", pageRange: "all", duplex: "false" }, await tinyPdf()))).rejects.toThrow(/UNAUTHENTICATED/);
    expect(uploadPrintDocument).not.toHaveBeenCalled();
    expect(submitPrintJob).not.toHaveBeenCalled();
  });
});
