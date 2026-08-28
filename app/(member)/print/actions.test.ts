// @vitest-environment node
/**
 * AC-0243: a print job REQUIRES a file — a no-file submit throws FILE_REQUIRED
 *          and never charges (submitPrintJob is not called).
 * AC-0244: the document is uploaded to Storage BEFORE the job is charged, so a
 *          rejected/failed upload cannot leave a charged orphan job. (security review)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { PDFDocument } from "pdf-lib";

vi.mock("@/lib/auth/session", () => ({
  requireSession: vi.fn().mockResolvedValue({
    id: "user-1",
    orgId: "org-1",
    role: "MEMBER",
    email: "m@flowspace.test",
    name: "M",
  }),
}));
vi.mock("@/lib/storage/uploads", async (orig) => ({
  // keep the real validate+path builders; spy only the network upload
  ...(await orig<typeof import("@/lib/storage/uploads")>()),
  uploadPrintDocument: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/db/print", () => ({
  submitPrintJob: vi.fn().mockResolvedValue({ id: "job-1" }),
}));

import { submitPrintJobAction } from "./actions";
import { uploadPrintDocument } from "@/lib/storage/uploads";
import { submitPrintJob } from "@/lib/db/print";

function form(fields: Record<string, string>, file?: Blob) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  if (file) fd.set("file", file, "doc.pdf");
  return fd;
}

beforeEach(() => vi.clearAllMocks());

async function validPdf() {
  const pdf = await PDFDocument.create();
  pdf.addPage();
  return new Blob([await pdf.save() as unknown as BlobPart], { type: "application/pdf" });
}

describe("submitPrintJobAction", () => {
  it("AC-0243: no file → FILE_REQUIRED, never charges", async () => {
    await expect(
      submitPrintJobAction(form({ fileName: "doc.pdf", pages: "1", copies: "1", colorMode: "BW" })),
    ).rejects.toThrow(/FILE_REQUIRED/);
    expect(submitPrintJob).not.toHaveBeenCalled();
    expect(uploadPrintDocument).not.toHaveBeenCalled();
  });

  it("AC-0244: uploads BEFORE charging, and passes the storagePath to the job", async () => {
    // Use a valid PDF so server-side page extraction can run.
    const pdf = await validPdf();
    await submitPrintJobAction(
      form({ fileName: "doc.pdf", pages: "1", copies: "1", colorMode: "BW" }, pdf),
    );
    expect(uploadPrintDocument).toHaveBeenCalledTimes(1);
    expect(submitPrintJob).toHaveBeenCalledTimes(1);
    // upload happens before the charge (lower invocation order)
    const uploadOrder = vi.mocked(uploadPrintDocument).mock.invocationCallOrder[0];
    const chargeOrder = vi.mocked(submitPrintJob).mock.invocationCallOrder[0];
    expect(uploadOrder).toBeLessThan(chargeOrder);
    // the job is created with the org-scoped storage path
    const arg = vi.mocked(submitPrintJob).mock.calls[0][0];
    expect(arg.storagePath).toMatch(/^org-1\/print\/.+\/doc\.pdf$/);
  });

  it("AC-0244: a failed upload prevents the charge (no orphan job)", async () => {
    vi.mocked(uploadPrintDocument).mockRejectedValueOnce(new Error("STORAGE_DOWN"));
    // Use a valid PDF so the upload mock, rather than page extraction, fails.
    const pdf = await validPdf();
    await expect(
      submitPrintJobAction(form({ fileName: "doc.pdf", pages: "1", copies: "1", colorMode: "BW" }, pdf)),
    ).rejects.toThrow(/STORAGE_DOWN/);
    expect(submitPrintJob).not.toHaveBeenCalled();
  });
});
