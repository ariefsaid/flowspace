/**
 * AC-101: CafeClient renders DB-provided menu items (unit/RTL).
 * AC-102: CafeClient surfaces server-action errors inline (money-path defect fix).
 * AC-701/703/704: variant picker + cart-line combination behavior (I-044).
 * AC-730: cart discount preview renders the server-resolved % (never hardcoded).
 * Static gate: app/(member)/cafe/ must not import lib/mock/cafe.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CafeClient } from "./CafeClient";
import type { MenuItemView } from "./CafeClient";

// Mock next/navigation for client components
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

// Mock the placeOrder server action (pulls in next-auth deps not available in jsdom)
vi.mock("@/app/cafe/actions", () => ({
  placeOrder: vi.fn().mockResolvedValue({}),
}));

// Import the mocked module so tests can override it
import { placeOrder } from "@/app/cafe/actions";

const sampleMenu: MenuItemView[] = [
  {
    id: "item-latte",
    name: "Latte",
    emoji: "🥛",
    category: "Coffee",
    priceRupiah: 32000,
    description: "Espresso lembut dengan susu steamed.",
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
    description: "Croissant butter renyah.",
    hasVariants: false,
  },
];

beforeEach(() => {
  vi.mocked(placeOrder).mockResolvedValue({} as never);
});

describe("CafeClient (AC-101)", () => {
  it("AC-101: renders menu items passed as props (DB-sourced)", () => {
    render(
      <CafeClient menu={sampleMenu} recentOrder={null} discountPct={0} />,
    );
    expect(screen.getByText("Latte")).toBeInTheDocument();
    expect(screen.getByText("Croissant")).toBeInTheDocument();
    expect(screen.getByText("Rp 32.000")).toBeInTheDocument();
    expect(screen.getByText("Rp 25.000")).toBeInTheDocument();
  });

  it("AC-730: a REGULAR (0%) member sees no discount banner", () => {
    render(
      <CafeClient menu={sampleMenu} recentOrder={null} discountPct={0} />,
    );
    expect(screen.queryByText(/diskon/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/sesi aktif/i)).not.toBeInTheDocument();
  });

  it("AC-730: a GOLD (10%) member sees the server-resolved 10% banner, never a hardcoded 5%", () => {
    render(
      <CafeClient menu={sampleMenu} recentOrder={null} discountPct={10} />,
    );
    expect(screen.getByText(/diskon 10%/i)).toBeInTheDocument();
    expect(screen.queryByText(/diskon 5%/i)).not.toBeInTheDocument();
  });

  it("shows empty state when menu is empty", () => {
    render(
      <CafeClient menu={[]} recentOrder={null} discountPct={0} />,
    );
    // No menu items rendered — grid is empty but page still mounts
    expect(screen.queryByText("Latte")).not.toBeInTheDocument();
  });

  it("AC-101: renders recent order when provided", () => {
    const recentOrder = {
      code: "#abc123",
      placedAt: new Date("2026-06-15T10:00:00Z").toISOString(),
      totalRupiah: 57000,
      items: [{ nameSnapshot: "Latte", qty: 1 }],
    };
    render(
      <CafeClient
        menu={sampleMenu}
        recentOrder={recentOrder}
        discountPct={0}
      />,
    );
    expect(screen.getByText("#abc123")).toBeInTheDocument();
  });

  it("shows the real order status badge (not a hardcoded 'Selesai') when status is provided", () => {
    render(
      <CafeClient
        menu={sampleMenu}
        recentOrder={{
          code: "#preparing1",
          placedAt: new Date("2026-06-15T10:00:00Z").toISOString(),
          totalRupiah: 32000,
          items: [{ nameSnapshot: "Latte", qty: 1 }],
          status: "PREPARING",
        }}
        discountPct={0}
      />,
    );
    expect(screen.getByText("Diproses")).toBeInTheDocument();
    expect(screen.queryByText("Selesai")).not.toBeInTheDocument();
  });

  it("falls back to the 'Selesai' badge when status is omitted (back-compat)", () => {
    const recentOrder = {
      code: "#abc123",
      placedAt: new Date("2026-06-15T10:00:00Z").toISOString(),
      totalRupiah: 57000,
      items: [{ nameSnapshot: "Latte", qty: 1 }],
    };
    render(
      <CafeClient menu={sampleMenu} recentOrder={recentOrder} discountPct={0} />,
    );
    expect(screen.getByText("Selesai")).toBeInTheDocument();
  });

  it("AC-102: shows mapped Indonesian error when placeOrder rejects with INVALID_MENU_ITEMS", async () => {
    vi.mocked(placeOrder).mockRejectedValue(new Error("INVALID_MENU_ITEMS"));

    render(
      <CafeClient menu={sampleMenu} recentOrder={null} discountPct={0} />,
    );

    // Add croissant to cart (no variant, direct add)
    const addButtons = screen.getAllByRole("button", { name: /tambah/i });
    fireEvent.click(addButtons[0]);

    // Open cart
    fireEvent.click(screen.getByRole("button", { name: /buka keranjang/i }));

    // Click "Pesan Sekarang" in cart panel
    const orderBtn = await screen.findByRole("button", { name: /pesan sekarang/i });
    fireEvent.click(orderBtn);

    // Indonesian error message should appear
    const errorEl = await screen.findByRole("alert");
    expect(errorEl).toHaveTextContent(/sebagian item tidak tersedia/i);

    // Cart must still be visible (not cleared)
    expect(screen.getByRole("button", { name: /pesan sekarang/i })).toBeInTheDocument();

    // Checkout button must be interactive again (not stuck disabled)
    expect(screen.getByRole("button", { name: /pesan sekarang/i })).not.toBeDisabled();
  });

  it("AC-102: shows generic fallback error for unknown sentinel", async () => {
    vi.mocked(placeOrder).mockRejectedValue(new Error("NETWORK_TIMEOUT"));

    render(
      <CafeClient menu={sampleMenu} recentOrder={null} discountPct={0} />,
    );

    const addButtons = screen.getAllByRole("button", { name: /tambah/i });
    fireEvent.click(addButtons[0]);
    fireEvent.click(screen.getByRole("button", { name: /buka keranjang/i }));

    const orderBtn = await screen.findByRole("button", { name: /pesan sekarang/i });
    fireEvent.click(orderBtn);

    const errorEl = await screen.findByRole("alert");
    expect(errorEl).toHaveTextContent(/pesanan gagal diproses/i);
  });

  it("AC-102: clears error message on next successful submit", async () => {
    vi.mocked(placeOrder)
      .mockRejectedValueOnce(new Error("EMPTY_ORDER"))
      .mockResolvedValueOnce({} as never);

    render(
      <CafeClient menu={sampleMenu} recentOrder={null} discountPct={0} />,
    );

    const addButtons = screen.getAllByRole("button", { name: /tambah/i });
    fireEvent.click(addButtons[0]);
    fireEvent.click(screen.getByRole("button", { name: /buka keranjang/i }));

    const orderBtn = await screen.findByRole("button", { name: /pesan sekarang/i });
    fireEvent.click(orderBtn);

    // Error appears after first (rejected) attempt
    await screen.findByRole("alert");

    // Second click — should succeed and error should be gone
    fireEvent.click(screen.getByRole("button", { name: /pesan sekarang/i }));

    await waitFor(() => {
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
  });

  it("AC-701/AC-703: opening the picker on Latte shows the configured group and adjusted price on Cold", async () => {
    render(
      <CafeClient menu={sampleMenu} recentOrder={null} discountPct={0} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /pilih variant/i }));
    expect(await screen.findByText("Temperature")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cold" }));
    expect(screen.getByText(/tambah ke keranjang.*rp 35\.000/i)).toBeInTheDocument();
  });

  it("AC-704: adding Hot then Cold keeps them as two separate cart lines and submits generic options + trimmed notes", async () => {
    render(
      <CafeClient menu={sampleMenu} recentOrder={null} discountPct={0} />,
    );

    // Add Hot (default selection)
    fireEvent.click(screen.getByRole("button", { name: /pilih variant/i }));
    fireEvent.click(await screen.findByRole("button", { name: /tambah ke keranjang/i }));

    // Add Cold
    fireEvent.click(screen.getByRole("button", { name: /pilih variant/i }));
    fireEvent.click(await screen.findByRole("button", { name: "Cold" }));
    fireEvent.click(screen.getByRole("button", { name: /tambah ke keranjang/i }));

    fireEvent.click(screen.getByRole("button", { name: /buka keranjang/i }));
    // One "Latte" in the menu grid card + two separate cart lines (Hot, Cold)
    expect(screen.getAllByText("Latte")).toHaveLength(3);

    // Notes + checkout
    fireEvent.change(screen.getByLabelText(/catatan/i), {
      target: { value: "  extra hot  " },
    });
    fireEvent.click(screen.getByRole("button", { name: /pesan sekarang/i }));

    await waitFor(() => expect(placeOrder).toHaveBeenCalled());
    // Mocks aren't reset between tests in this file — read the LAST call.
    const calls = vi.mocked(placeOrder).mock.calls;
    const call = calls[calls.length - 1][0];
    expect(call.notes).toBe("extra hot");
    expect(call.lines).toHaveLength(2);
    expect(call.lines.every((l) => "options" in l)).toBe(true);
    // No client price/subtotal/discount field ever sent
    expect(call.lines.every((l) => !("price" in l) && !("unitPriceRupiah" in l))).toBe(true);
  });

  it("no-mock-import gate: cafe page files do not import lib/mock/cafe", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const dir = path.resolve(__dirname);
    const files = await fs.readdir(dir);
    const tsxFiles = files.filter(
      (f) => (f.endsWith(".tsx") || f.endsWith(".ts")) && !f.endsWith(".test.tsx"),
    );
    for (const file of tsxFiles) {
      const content = await fs.readFile(path.join(dir, file), "utf8");
      expect(content, `${file} must not import lib/mock/cafe`).not.toMatch(
        /from\s+["'].*lib\/mock\/cafe["']/,
      );
      expect(content, `${file} must not import lib/mock`).not.toMatch(
        /from\s+["']@\/lib\/mock["']/,
      );
    }
  });
});
