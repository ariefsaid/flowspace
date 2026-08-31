/**
 * AC-101: GuestCafeClient renders DB-provided menu items (unit/RTL).
 * AC-102: GuestCafeClient surfaces server-action errors inline (money-path defect fix).
 * Static gate: guest/page files must not import lib/mock/cafe.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { GuestCafeClient } from "./GuestCafeClient";
import type { GuestMenuItemView } from "./GuestCafeClient";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

// Mock the placeOrder server action (pulls in next-auth deps not available in jsdom)
vi.mock("@/app/cafe/actions", () => ({
  placeOrder: vi.fn().mockResolvedValue({}),
}));

import { placeOrder } from "@/app/cafe/actions";

const sampleMenu: GuestMenuItemView[] = [
  {
    id: "item-americano",
    name: "Americano",
    emoji: "☕",
    category: "Coffee",
    priceRupiah: 25000,
    description: "Espresso dengan air panas.",
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
    category: "Food",
    priceRupiah: 25000,
    description: "Croissant butter renyah.",
    hasVariants: false,
  },
];

beforeEach(() => {
  vi.mocked(placeOrder).mockResolvedValue({} as never);
});

describe("GuestCafeClient (AC-101)", () => {
  it("AC-101: renders menu items passed as props (DB-sourced)", () => {
    render(<GuestCafeClient menu={sampleMenu} />);
    expect(screen.getByText("Americano")).toBeInTheDocument();
    expect(screen.getByText("Croissant")).toBeInTheDocument();
  });

  it("AC-101: shows item price from props", () => {
    render(<GuestCafeClient menu={sampleMenu} />);
    // Two items with same price; at least one rendered
    const prices = screen.getAllByText("Rp 25.000");
    expect(prices.length).toBeGreaterThanOrEqual(1);
  });

  it("shows empty state gracefully when menu is empty", () => {
    render(<GuestCafeClient menu={[]} />);
    expect(screen.queryByText("Americano")).not.toBeInTheDocument();
  });

  it("AC-102: shows mapped Indonesian error when placeOrder rejects with INVALID_MENU_ITEMS", async () => {
    vi.mocked(placeOrder).mockRejectedValue(new Error("INVALID_MENU_ITEMS"));

    render(<GuestCafeClient menu={sampleMenu} />);

    // Add croissant (no variant) to cart via "Tambah" button
    const addButtons = screen.getAllByRole("button", { name: /tambah/i });
    fireEvent.click(addButtons[0]);

    // Open checkout modal via visible cart panel "Checkout" button
    const checkoutBtn = await screen.findByRole("button", { name: /checkout/i });
    fireEvent.click(checkoutBtn);

    // Fill in guest name
    const nameInput = screen.getByPlaceholderText(/masukkan nama/i);
    fireEvent.change(nameInput, { target: { value: "Budi" } });

    // Submit order
    const orderBtn = screen.getByRole("button", { name: /pesan sekarang/i });
    fireEvent.click(orderBtn);

    // Indonesian error should appear inside the checkout modal
    const errorEl = await screen.findByRole("alert");
    expect(errorEl).toHaveTextContent(/sebagian item tidak tersedia/i);

    // Cart (checkout modal) must still be open
    expect(screen.getByPlaceholderText(/masukkan nama/i)).toBeInTheDocument();

    // Submit button must be interactive again
    expect(screen.getByRole("button", { name: /pesan sekarang/i })).not.toBeDisabled();
  });

  it("AC-102: shows GUEST_NAME_REQUIRED error in Indonesian", async () => {
    vi.mocked(placeOrder).mockRejectedValue(new Error("GUEST_NAME_REQUIRED"));

    render(<GuestCafeClient menu={sampleMenu} />);

    const addButtons = screen.getAllByRole("button", { name: /tambah/i });
    fireEvent.click(addButtons[0]);

    const checkoutBtn = await screen.findByRole("button", { name: /checkout/i });
    fireEvent.click(checkoutBtn);

    const nameInput = screen.getByPlaceholderText(/masukkan nama/i);
    fireEvent.change(nameInput, { target: { value: "Test" } });

    fireEvent.click(screen.getByRole("button", { name: /pesan sekarang/i }));

    const errorEl = await screen.findByRole("alert");
    expect(errorEl).toHaveTextContent(/nama wajib diisi/i);
  });

  it("AC-102: shows generic fallback for unknown errors", async () => {
    vi.mocked(placeOrder).mockRejectedValue(new Error("NETWORK_ERROR"));

    render(<GuestCafeClient menu={sampleMenu} />);

    const addButtons = screen.getAllByRole("button", { name: /tambah/i });
    fireEvent.click(addButtons[0]);

    const checkoutBtn = await screen.findByRole("button", { name: /checkout/i });
    fireEvent.click(checkoutBtn);

    const nameInput = screen.getByPlaceholderText(/masukkan nama/i);
    fireEvent.change(nameInput, { target: { value: "Test" } });

    fireEvent.click(screen.getByRole("button", { name: /pesan sekarang/i }));

    const errorEl = await screen.findByRole("alert");
    expect(errorEl).toHaveTextContent(/pesanan gagal diproses/i);
  });

  it("AC-102: clears error on next successful submit", async () => {
    vi.mocked(placeOrder)
      .mockRejectedValueOnce(new Error("INVALID_QUANTITY"))
      .mockResolvedValueOnce({} as never);

    render(<GuestCafeClient menu={sampleMenu} />);

    const addButtons = screen.getAllByRole("button", { name: /tambah/i });
    fireEvent.click(addButtons[0]);

    const checkoutBtn = await screen.findByRole("button", { name: /checkout/i });
    fireEvent.click(checkoutBtn);

    const nameInput = screen.getByPlaceholderText(/masukkan nama/i);
    fireEvent.change(nameInput, { target: { value: "Test" } });

    fireEvent.click(screen.getByRole("button", { name: /pesan sekarang/i }));
    await screen.findByRole("alert");

    // Second attempt succeeds — error clears, success modal shown
    fireEvent.click(screen.getByRole("button", { name: /pesan sekarang/i }));
    await waitFor(() => {
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
  });

  it("AC-702/AC-703: opening the picker on Americano shows the configured group and adjusted price on Cold", async () => {
    render(<GuestCafeClient menu={sampleMenu} />);
    fireEvent.click(screen.getByRole("button", { name: /pilih variant/i }));
    expect(await screen.findByText("Temperature")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cold" }));
    expect(screen.getByText(/tambah ke keranjang.*rp 28\.000/i)).toBeInTheDocument();
  });

  it("AC-704: adding Hot then Cold keeps them as two separate lines; checkout sends generic options + trimmed notes", async () => {
    render(<GuestCafeClient menu={sampleMenu} />);

    // Add Hot (default)
    fireEvent.click(screen.getByRole("button", { name: /pilih variant/i }));
    fireEvent.click(await screen.findByRole("button", { name: /tambah ke keranjang/i }));

    // Add Cold
    fireEvent.click(screen.getByRole("button", { name: /pilih variant/i }));
    fireEvent.click(await screen.findByRole("button", { name: "Cold" }));
    fireEvent.click(screen.getByRole("button", { name: /tambah ke keranjang/i }));

    const checkoutBtn = await screen.findByRole("button", { name: /checkout/i });
    fireEvent.click(checkoutBtn);

    fireEvent.change(screen.getByPlaceholderText(/masukkan nama/i), {
      target: { value: "Budi" },
    });
    fireEvent.change(screen.getByLabelText(/catatan/i), {
      target: { value: "  less ice  " },
    });
    fireEvent.click(screen.getByRole("button", { name: /pesan sekarang/i }));

    await waitFor(() => expect(placeOrder).toHaveBeenCalled());
    const calls = vi.mocked(placeOrder).mock.calls;
    const call = calls[calls.length - 1][0];
    expect(call.guestName).toBe("Budi");
    expect(call.notes).toBe("less ice");
    expect(call.lines).toHaveLength(2);
    expect(call.lines.every((l) => "options" in l)).toBe(true);
    expect(call.lines.every((l) => !("price" in l) && !("unitPriceRupiah" in l))).toBe(true);
  });

  it("AC-i049-1: success modal shows the returned order code and pay-at-cashier note", async () => {
    vi.mocked(placeOrder).mockResolvedValue({ code: "CAFE-A1B2" } as never);

    render(<GuestCafeClient menu={sampleMenu} />);

    const addButtons = screen.getAllByRole("button", { name: /tambah/i });
    fireEvent.click(addButtons[0]);

    const checkoutBtn = await screen.findByRole("button", { name: /checkout/i });
    fireEvent.click(checkoutBtn);

    fireEvent.change(screen.getByPlaceholderText(/masukkan nama/i), {
      target: { value: "Budi" },
    });
    fireEvent.click(screen.getByRole("button", { name: /pesan sekarang/i }));

    expect(await screen.findByText("CAFE-A1B2")).toBeInTheDocument();
    expect(screen.getByText(/nomor pesanan/i)).toBeInTheDocument();
    expect(screen.getByText(/pembayaran dilakukan di kasir/i)).toBeInTheDocument();
  });

  it("no-mock-import gate: guest cafe files do not import lib/mock/cafe", async () => {
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
    }
  });
});
