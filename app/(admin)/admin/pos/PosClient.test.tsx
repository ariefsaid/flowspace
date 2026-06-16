/**
 * AC-101: PosClient renders DB-provided menu items (unit/RTL).
 * Static gate: pos/ files must not import lib/mock/cafe.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { PosClient } from "./PosClient";
import type { PosMenuItemView } from "./PosClient";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

const sampleMenu: PosMenuItemView[] = [
  {
    id: "item-latte",
    name: "Latte",
    emoji: "🥛",
    category: "COFFEE",
    priceRupiah: 32000,
    description: "Espresso lembut.",
    hasVariants: true,
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
    }
  });
});
