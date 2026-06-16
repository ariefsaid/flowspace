/**
 * AC-101: GuestCafeClient renders DB-provided menu items (unit/RTL).
 * Static gate: guest/page files must not import lib/mock/cafe.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { GuestCafeClient } from "./GuestCafeClient";
import type { GuestMenuItemView } from "./GuestCafeClient";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

// Mock the placeOrder server action (pulls in next-auth deps not available in jsdom)
vi.mock("@/app/cafe/actions", () => ({
  placeOrder: vi.fn().mockResolvedValue({}),
}));

const sampleMenu: GuestMenuItemView[] = [
  {
    id: "item-americano",
    name: "Americano",
    emoji: "☕",
    category: "Coffee",
    priceRupiah: 25000,
    description: "Espresso dengan air panas.",
    hasVariants: true,
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
