/**
 * Menu-settings server actions (I-042). [SEC] money-adjacent — priceRupiah
 * feeds cafe orders. Every action re-checks ADMIN in-action (session role is
 * UX-only elsewhere) before touching lib/db/menu-admin.ts, and forwards the
 * repo's INVALID_PRICE rejection untouched so the client can surface it
 * inline (each `it()` title names its own owning acceptance criterion).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const requireSession = vi.fn();
const createMenuItem = vi.fn();
const updateMenuItem = vi.fn();
const toggleAvailable = vi.fn();
const archiveMenuItem = vi.fn();

vi.mock("@/lib/auth/session", () => ({
  requireSession: () => requireSession(),
}));
vi.mock("@/lib/db/menu-admin", () => ({
  createMenuItem: (...a: unknown[]) => createMenuItem(...a),
  updateMenuItem: (...a: unknown[]) => updateMenuItem(...a),
  toggleAvailable: (...a: unknown[]) => toggleAvailable(...a),
  archiveMenuItem: (...a: unknown[]) => archiveMenuItem(...a),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  createMenuItemAction,
  updateMenuItemAction,
  toggleAvailableAction,
  archiveMenuItemAction,
} from "./actions";

const input = {
  name: "Kopi Susu",
  emoji: "☕",
  category: "COFFEE" as const,
  priceRupiah: 18_000,
  description: "Signature milk coffee",
  available: true,
};

describe("menu settings actions", () => {
  beforeEach(() => {
    requireSession.mockReset();
    createMenuItem.mockReset();
    updateMenuItem.mockReset();
    toggleAvailable.mockReset();
    archiveMenuItem.mockReset();
  });

  describe("createMenuItemAction", () => {
    it("AC-M01: a MEMBER is denied (FORBIDDEN) and nothing is written", async () => {
      requireSession.mockResolvedValue({ id: "u", role: "MEMBER", orgId: "o1" });
      await expect(createMenuItemAction(input)).rejects.toThrow("FORBIDDEN");
      expect(createMenuItem).not.toHaveBeenCalled();
    });

    it("AC-M02: a BARISTA is denied (FORBIDDEN) and nothing is written", async () => {
      requireSession.mockResolvedValue({ id: "u", role: "BARISTA", orgId: "o1" });
      await expect(createMenuItemAction(input)).rejects.toThrow("FORBIDDEN");
      expect(createMenuItem).not.toHaveBeenCalled();
    });

    it("AC-M03: an ADMIN creates the item with the session orgId and returns the created row", async () => {
      requireSession.mockResolvedValue({ id: "a", role: "ADMIN", orgId: "o1" });
      const created = { id: "m1", orgId: "o1", ...input };
      createMenuItem.mockResolvedValue(created);
      const result = await createMenuItemAction(input);
      expect(createMenuItem).toHaveBeenCalledWith("o1", input);
      expect(result).toEqual(created);
    });

    it("AC-M04: an ADMIN create with an invalid price surfaces the repo's INVALID_PRICE rejection, no partial success", async () => {
      requireSession.mockResolvedValue({ id: "a", role: "ADMIN", orgId: "o1" });
      createMenuItem.mockRejectedValue(new Error("INVALID_PRICE"));
      await expect(createMenuItemAction({ ...input, priceRupiah: -1 })).rejects.toThrow(
        "INVALID_PRICE",
      );
    });
  });

  describe("updateMenuItemAction", () => {
    it("AC-M05: a non-ADMIN is denied (FORBIDDEN) and nothing is written", async () => {
      requireSession.mockResolvedValue({ id: "u", role: "MEMBER", orgId: "o1" });
      await expect(updateMenuItemAction("m1", { name: "x" })).rejects.toThrow("FORBIDDEN");
      expect(updateMenuItem).not.toHaveBeenCalled();
    });

    it("AC-M06: an ADMIN patches the item with the session orgId", async () => {
      requireSession.mockResolvedValue({ id: "a", role: "ADMIN", orgId: "o1" });
      await updateMenuItemAction("m1", { priceRupiah: 20_000 });
      expect(updateMenuItem).toHaveBeenCalledWith("o1", "m1", { priceRupiah: 20_000 });
    });

    it("AC-M07: an ADMIN update with an invalid price surfaces INVALID_PRICE", async () => {
      requireSession.mockResolvedValue({ id: "a", role: "ADMIN", orgId: "o1" });
      updateMenuItem.mockRejectedValue(new Error("INVALID_PRICE"));
      await expect(updateMenuItemAction("m1", { priceRupiah: -5 })).rejects.toThrow(
        "INVALID_PRICE",
      );
    });
  });

  describe("toggleAvailableAction", () => {
    it("AC-M08: a non-ADMIN is denied (FORBIDDEN) and nothing is written", async () => {
      requireSession.mockResolvedValue({ id: "u", role: "MEMBER", orgId: "o1" });
      await expect(toggleAvailableAction("m1", false)).rejects.toThrow("FORBIDDEN");
      expect(toggleAvailable).not.toHaveBeenCalled();
    });

    it("AC-M09: an ADMIN flips availability with the session orgId", async () => {
      requireSession.mockResolvedValue({ id: "a", role: "ADMIN", orgId: "o1" });
      await toggleAvailableAction("m1", false);
      expect(toggleAvailable).toHaveBeenCalledWith("o1", "m1", false);
    });
  });

  describe("archiveMenuItemAction", () => {
    it("AC-M10: a non-ADMIN is denied (FORBIDDEN) and nothing is written", async () => {
      requireSession.mockResolvedValue({ id: "u", role: "MEMBER", orgId: "o1" });
      await expect(archiveMenuItemAction("m1")).rejects.toThrow("FORBIDDEN");
      expect(archiveMenuItem).not.toHaveBeenCalled();
    });

    it("AC-M11: an ADMIN soft-archives the item with the session orgId", async () => {
      requireSession.mockResolvedValue({ id: "a", role: "ADMIN", orgId: "o1" });
      await archiveMenuItemAction("m1");
      expect(archiveMenuItem).toHaveBeenCalledWith("o1", "m1");
    });
  });
});
