/**
 * AC-101: CafeClient renders DB-provided menu items (unit/RTL).
 * Static gate: app/(member)/cafe/ must not import lib/mock/cafe.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
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

const sampleMenu: MenuItemView[] = [
  {
    id: "item-latte",
    name: "Latte",
    emoji: "🥛",
    category: "Coffee",
    priceRupiah: 32000,
    description: "Espresso lembut dengan susu steamed.",
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

describe("CafeClient (AC-101)", () => {
  it("AC-101: renders menu items passed as props (DB-sourced)", () => {
    render(
      <CafeClient
        menu={sampleMenu}
        recentOrder={null}
        discountEligible={false}
      />,
    );
    expect(screen.getByText("Latte")).toBeInTheDocument();
    expect(screen.getByText("Croissant")).toBeInTheDocument();
    expect(screen.getByText("Rp 32.000")).toBeInTheDocument();
    expect(screen.getByText("Rp 25.000")).toBeInTheDocument();
  });

  it("AC-101: does NOT show discount banner when discountEligible is false (ADR-0011 dormant)", () => {
    render(
      <CafeClient
        menu={sampleMenu}
        recentOrder={null}
        discountEligible={false}
      />,
    );
    expect(screen.queryByText(/diskon 5%/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/sesi aktif/i)).not.toBeInTheDocument();
  });

  it("shows discount banner only when discountEligible is true (future use)", () => {
    render(
      <CafeClient
        menu={sampleMenu}
        recentOrder={null}
        discountEligible={true}
      />,
    );
    expect(screen.getByText(/diskon 5%/i)).toBeInTheDocument();
  });

  it("shows empty state when menu is empty", () => {
    render(
      <CafeClient menu={[]} recentOrder={null} discountEligible={false} />,
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
        discountEligible={false}
      />,
    );
    expect(screen.getByText("#abc123")).toBeInTheDocument();
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
