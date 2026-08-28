/**
 * Printer admin actions enforce the ADMIN role IN the action body (not only in
 * middleware/layout): a MEMBER or BARISTA session gets FORBIDDEN with ZERO
 * repository calls; an ADMIN call passes only the session orgId to the repo
 * and revalidates the page. (I-043, spec 0009; 's integration boundary
 * test additionally proves the same at the settings surface.)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const requireSession = vi.fn();
const createPrinter = vi.fn();
const updatePrinter = vi.fn();
const archivePrinter = vi.fn();
const setDefaultPrinter = vi.fn();

vi.mock("@/lib/auth/session", () => ({
  requireSession: () => requireSession(),
}));
vi.mock("@/lib/db/printers", () => ({
  createPrinter: (...a: unknown[]) => createPrinter(...a),
  updatePrinter: (...a: unknown[]) => updatePrinter(...a),
  archivePrinter: (...a: unknown[]) => archivePrinter(...a),
  setDefaultPrinter: (...a: unknown[]) => setDefaultPrinter(...a),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  createPrinterAction,
  updatePrinterAction,
  archivePrinterAction,
  setDefaultPrinterAction,
} from "./actions";

const createInput = {
  name: "HP_LaserJet",
  displayName: "LaserJet Lobi",
  location: "Lobby",
  printerType: "LASER" as const,
  colorSupport: false,
  paperSizes: ["A4", "F4"] as ("A4" | "A3" | "F4")[],
  sortOrder: 1,
};

const repos = { createPrinter, updatePrinter, archivePrinter, setDefaultPrinter };

describe("printer admin actions — role gate", () => {
  beforeEach(() => {
    requireSession.mockReset();
    for (const r of Object.values(repos)) r.mockReset();
  });

  for (const action of [
    ["createPrinterAction", createPrinterAction, createInput],
    ["updatePrinterAction", updatePrinterAction, { id: "p1", displayName: "Baru" }],
    ["archivePrinterAction", archivePrinterAction, { id: "p1" }],
    ["setDefaultPrinterAction", setDefaultPrinterAction, { id: "p1" }],
  ] as const) {
    it(`a MEMBER is denied (FORBIDDEN) with zero repo calls — ${action[0]}`, async () => {
      requireSession.mockResolvedValue({ id: "u", role: "MEMBER", orgId: "o1" });
      await expect((action[1] as (i: unknown) => Promise<unknown>)(action[2])).rejects.toThrow(
        "FORBIDDEN",
      );
      for (const r of Object.values(repos)) expect(r).not.toHaveBeenCalled();
    });

    it(`a BARISTA is denied (FORBIDDEN) with zero repo calls — ${action[0]}`, async () => {
      requireSession.mockResolvedValue({ id: "u", role: "BARISTA", orgId: "o1" });
      await expect((action[1] as (i: unknown) => Promise<unknown>)(action[2])).rejects.toThrow(
        "FORBIDDEN",
      );
      for (const r of Object.values(repos)) expect(r).not.toHaveBeenCalled();
    });
  }
});

describe("printer admin actions — ADMIN happy path", () => {
  beforeEach(() => {
    requireSession.mockReset();
    for (const r of Object.values(repos)) r.mockReset();
  });

  it("createPrinterAction passes only the session orgId", async () => {
    requireSession.mockResolvedValue({ id: "a", role: "ADMIN", orgId: "o1" });
    await createPrinterAction(createInput);
    expect(createPrinter).toHaveBeenCalledWith("o1", createInput);
  });

  it("updatePrinterAction passes the session orgId + printer id", async () => {
    requireSession.mockResolvedValue({ id: "a", role: "ADMIN", orgId: "o1" });
    await updatePrinterAction({ id: "p1", displayName: "Baru" });
    expect(updatePrinter).toHaveBeenCalledWith("o1", "p1", { displayName: "Baru" });
  });

  it("archivePrinterAction passes the session orgId + printer id", async () => {
    requireSession.mockResolvedValue({ id: "a", role: "ADMIN", orgId: "o1" });
    await archivePrinterAction("p1");
    expect(archivePrinter).toHaveBeenCalledWith("o1", "p1");
  });

  it("setDefaultPrinterAction passes the session orgId + printer id", async () => {
    requireSession.mockResolvedValue({ id: "a", role: "ADMIN", orgId: "o1" });
    await setDefaultPrinterAction("p1");
    expect(setDefaultPrinter).toHaveBeenCalledWith("o1", "p1");
  });
});
