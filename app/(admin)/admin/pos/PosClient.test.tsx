/**
 * AC-101: PosClient renders DB-provided menu items (unit/RTL).
 * AC-719: every visible item carries its live variant config; no mock/static
 *   cafe menu is imported.
 * AC-720: member lookup, variant cart, notes, and checkout call the real
 *   server actions with only email/lines/notes — never client totals/user id.
 * Static gate: pos/ files must not import lib/mock/cafe.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PosClient } from "./PosClient";
import type { PosMenuItemView } from "./PosClient";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("./actions", () => ({
  lookupPosMemberAction: vi.fn(),
  placePosOrder: vi.fn(),
}));

import { lookupPosMemberAction, placePosOrder } from "./actions";

const sampleMenu: PosMenuItemView[] = [
  {
    id: "item-latte",
    name: "Latte",
    emoji: "🥛",
    category: "COFFEE",
    priceRupiah: 32000,
    description: "Espresso lembut.",
    hasVariants: true,
    variantConfig: {
      variants: [
        {
          name: "Temperature",
          required: true,
          options: [
            { name: "Hot", priceAdjustment: 0 },
            { name: "Cold", priceAdjustment: 3000 },
          ],
        },
      ],
    },
  },
  {
    id: "item-croissant",
    name: "Croissant",
    emoji: "🥐",
    category: "FOOD",
    priceRupiah: 25000,
    description: "Croissant renyah.",
    hasVariants: false,
  },
];

beforeEach(() => {
  vi.mocked(lookupPosMemberAction).mockReset();
  vi.mocked(placePosOrder).mockReset();
  vi.mocked(placePosOrder).mockResolvedValue({
    id: "order-1",
    code: "ab12cd",
  } as never);
});

describe("PosClient (AC-101)", () => {
  it("AC-101: renders menu item name from props (DB-sourced)", () => {
    render(<PosClient menu={sampleMenu} />);
    expect(screen.getByText("Latte")).toBeInTheDocument();
  });

  it("AC-101: renders menu item price from props", () => {
    render(<PosClient menu={sampleMenu} />);
    expect(screen.getByText("Rp 32.000")).toBeInTheDocument();
  });

  it("shows empty cart state on mount", () => {
    render(<PosClient menu={sampleMenu} />);
    expect(screen.getByText(/cart is empty/i)).toBeInTheDocument();
  });

  it("AC-719: a variant item exposes its live variantConfig to the picker", async () => {
    render(<PosClient menu={sampleMenu} />);
    fireEvent.click(screen.getByRole("button", { name: /pilih variant latte/i }));
    expect(await screen.findByText("Temperature")).toBeInTheDocument();
  });

  it("AC-720: lookup shows member state, variant picker adds a line, checkout sends only email/lines/notes", async () => {
    vi.mocked(lookupPosMemberAction).mockResolvedValue({
      id: "member-1",
      name: "Gold Member",
      email: "gold@x.test",
      hasActiveBooking: true,
      cafeDiscountPct: 10,
      activeBookingFacility: "Walk-in Coworking",
      activeBookingEndAt: null,
    });

    render(<PosClient menu={sampleMenu} />);

    // Lookup
    fireEvent.change(screen.getByPlaceholderText(/enter email/i), {
      target: { value: "gold@x.test" },
    });
    fireEvent.click(screen.getByRole("button", { name: /search customer/i }));
    await screen.findByText("Gold Member");
    expect(screen.getByText(/diskon 10%/i)).toBeInTheDocument();

    // Add a variant line (Cold)
    fireEvent.click(screen.getByRole("button", { name: /pilih variant latte/i }));
    fireEvent.click(await screen.findByRole("button", { name: "Cold" }));
    fireEvent.click(screen.getByRole("button", { name: /tambah ke keranjang/i }));

    // Notes
    fireEvent.change(screen.getByLabelText(/catatan/i), {
      target: { value: "  extra hot  " },
    });

    // Checkout
    fireEvent.click(screen.getByRole("button", { name: /^checkout$/i }));

    await waitFor(() => expect(placePosOrder).toHaveBeenCalled());
    const call = vi.mocked(placePosOrder).mock.calls[0][0];
    expect(call.email).toBe("gold@x.test");
    expect(call.notes).toBe("extra hot");
    expect(call.lines).toEqual([
      {
        menuItemId: "item-latte",
        qty: 1,
        options: [{ variantName: "Temperature", optionName: "Cold" }],
      },
    ]);
    // No client totals or user id sent
    expect(call).not.toHaveProperty("subtotalRupiah");
    expect(call).not.toHaveProperty("discountRupiah");
    expect(call).not.toHaveProperty("userId");
  });

  it("A3 (WCAG-AA contrast): the active-session subline uses text-teal-700 (5.25:1), not teal-600 (3.59:1, fails AA)", async () => {
    vi.mocked(lookupPosMemberAction).mockResolvedValue({
      id: "member-1",
      name: "Gold Member",
      email: "gold@x.test",
      hasActiveBooking: true,
      cafeDiscountPct: 10,
      activeBookingFacility: "Walk-in Coworking",
      activeBookingEndAt: null,
    });

    render(<PosClient menu={sampleMenu} />);
    fireEvent.change(screen.getByPlaceholderText(/enter email/i), {
      target: { value: "gold@x.test" },
    });
    fireEvent.click(screen.getByRole("button", { name: /search customer/i }));

    const subline = await screen.findByText(/diskon 10%/i);
    expect(subline).toHaveClass("text-teal-700");
    expect(subline).not.toHaveClass("text-teal-600");
  });

  it("A4 (WCAG-AA contrast): the 'Mencari member…' loading status uses text-gray-500 (4.83:1), not gray-400 (2.54:1, fails AA)", async () => {
    let resolveLookup!: (v: unknown) => void;
    vi.mocked(lookupPosMemberAction).mockReturnValue(
      new Promise((resolve) => {
        resolveLookup = resolve;
      }) as never,
    );

    render(<PosClient menu={sampleMenu} />);
    fireEvent.change(screen.getByPlaceholderText(/enter email/i), {
      target: { value: "gold@x.test" },
    });
    fireEvent.click(screen.getByRole("button", { name: /search customer/i }));

    const loading = await screen.findByText(/mencari member/i);
    expect(loading).toHaveClass("text-gray-500");
    expect(loading).not.toHaveClass("text-gray-400");

    resolveLookup(null);
    await screen.findByText(/no member found/i);
  });

  it("I-047: shows the active-booking facility and end time in the member-found panel (ORIG pos:224-227)", async () => {
    vi.mocked(lookupPosMemberAction).mockResolvedValue({
      id: "member-1",
      name: "Gold Member",
      email: "gold@x.test",
      hasActiveBooking: true,
      cafeDiscountPct: 10,
      activeBookingFacility: "Meeting Room A",
      activeBookingEndAt: "2026-06-15T09:05:00.000Z",
    });

    render(<PosClient menu={sampleMenu} />);
    fireEvent.change(screen.getByPlaceholderText(/enter email/i), {
      target: { value: "gold@x.test" },
    });
    fireEvent.click(screen.getByRole("button", { name: /search customer/i }));

    expect(await screen.findByText(/sesi aktif di meeting room a/i)).toBeInTheDocument();
    expect(screen.getByText(/sampai/i)).toBeInTheDocument();
  });

  it("I-047: shows just the facility (no 'sampai') when activeBookingEndAt is null (open-ended)", async () => {
    vi.mocked(lookupPosMemberAction).mockResolvedValue({
      id: "member-1",
      name: "Gold Member",
      email: "gold@x.test",
      hasActiveBooking: true,
      cafeDiscountPct: 10,
      activeBookingFacility: "Walk-in Coworking",
      activeBookingEndAt: null,
    });

    render(<PosClient menu={sampleMenu} />);
    fireEvent.change(screen.getByPlaceholderText(/enter email/i), {
      target: { value: "gold@x.test" },
    });
    fireEvent.click(screen.getByRole("button", { name: /search customer/i }));

    const facilityLine = await screen.findByText(/sesi aktif di walk-in coworking/i);
    expect(facilityLine).toBeInTheDocument();
    expect(facilityLine.textContent).not.toMatch(/sampai/i);
  });

  it("I-047: clear-cart control resets the cart and the member lookup in one click (ORIG pos:94-99)", async () => {
    vi.mocked(lookupPosMemberAction).mockResolvedValue({
      id: "member-1",
      name: "Gold Member",
      email: "gold@x.test",
      hasActiveBooking: true,
      cafeDiscountPct: 10,
      activeBookingFacility: "Meeting Room A",
      activeBookingEndAt: null,
    });

    render(<PosClient menu={sampleMenu} />);

    // Look up a member and add an item to the cart.
    fireEvent.change(screen.getByPlaceholderText(/enter email/i), {
      target: { value: "gold@x.test" },
    });
    fireEvent.click(screen.getByRole("button", { name: /search customer/i }));
    await screen.findByText("Gold Member");
    fireEvent.click(screen.getByRole("button", { name: /add croissant/i }));
    expect(screen.queryByText(/cart is empty/i)).not.toBeInTheDocument();

    // Clear cart — resets cart + member lookup.
    fireEvent.click(screen.getByRole("button", { name: /clear cart/i }));

    expect(screen.getByText(/cart is empty/i)).toBeInTheDocument();
    expect(screen.queryByText("Gold Member")).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText(/enter email/i)).toHaveValue("");
  });

  it("clear-cart control is not shown while the cart is empty", () => {
    render(<PosClient menu={sampleMenu} />);
    expect(screen.queryByRole("button", { name: /clear cart/i })).not.toBeInTheDocument();
  });

  it("no member found shows a not-found message", async () => {
    vi.mocked(lookupPosMemberAction).mockResolvedValue(null);
    render(<PosClient menu={sampleMenu} />);
    fireEvent.change(screen.getByPlaceholderText(/enter email/i), {
      target: { value: "nobody@x.test" },
    });
    fireEvent.click(screen.getByRole("button", { name: /search customer/i }));
    expect(await screen.findByText(/no member found/i)).toBeInTheDocument();
  });

  it("no-mock-import gate: pos files do not import lib/mock/cafe", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const dir = path.resolve(__dirname);
    const files = await fs.readdir(dir);
    const srcFiles = files.filter(
      (f) =>
        (f.endsWith(".tsx") || f.endsWith(".ts")) &&
        !f.endsWith(".test.tsx") &&
        !f.endsWith(".test.ts"),
    );
    for (const file of srcFiles) {
      const content = await fs.readFile(path.join(dir, file), "utf8");
      expect(content, `${file} must not import lib/mock/cafe`).not.toMatch(
        /from\s+["'].*lib\/mock\/cafe["']/,
      );
      expect(content, `${file} must not import a static/mock cafe menu`).not.toMatch(
        /CAFE_MENU\s*[:=]|from\s+["']@\/lib\/mock["']/,
      );
    }
  });
});
