/**
 * AC-101: BaristaClient renders DB-provided orders (unit/RTL).
 * Static gate: barista/ files must not import lib/mock/barista.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { BaristaClient } from "./BaristaClient";
import type { BaristaOrderView } from "./BaristaClient";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("@/app/barista/actions", () => ({
  advanceOrderStatusAction: vi.fn().mockResolvedValue({}),
}));

// useKdsRealtime opens a Supabase Realtime channel — stub it out in unit tests.
vi.mock("./useKdsRealtime", () => ({
  useKdsRealtime: vi.fn(),
}));

const newOrder: BaristaOrderView = {
  id: "order-1",
  code: "#ab1234",
  customer: "Budi Santoso",
  status: "new",
  placedAt: new Date("2026-06-15T10:00:00Z").toISOString(),
  lines: [{ name: "Latte", qty: 1, variant: "Hot, Normal Sugar" }],
};

describe("BaristaClient (AC-101)", () => {
  it("AC-101: 'Pesanan Baru' column shows 1 when one NEW order is passed", () => {
    render(<BaristaClient initialOrders={[newOrder]} orgId="org-test" />);
    expect(screen.getByText(/pesanan baru \(1\)/i)).toBeInTheDocument();
  });

  it("AC-101: shows the order code from props (DB-sourced)", () => {
    render(<BaristaClient initialOrders={[newOrder]} orgId="org-test" />);
    expect(screen.getByText("#ab1234")).toBeInTheDocument();
  });

  it("AC-101: shows the order line from props", () => {
    render(<BaristaClient initialOrders={[newOrder]} orgId="org-test" />);
    expect(screen.getByText("Latte")).toBeInTheDocument();
  });

  it("shows empty state when no orders", () => {
    render(<BaristaClient initialOrders={[]} orgId="org-test" />);
    expect(screen.getByText(/belum ada pesanan/i)).toBeInTheDocument();
  });

  it("no-mock-import gate: barista files do not import lib/mock/barista", async () => {
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
      expect(content, `${file} must not import lib/mock/barista`).not.toMatch(
        /from\s+["'].*lib\/mock\/barista["']/,
      );
      expect(content, `${file} must not import lib/mock`).not.toMatch(
        /from\s+["']@\/lib\/mock["']/,
      );
    }
  });
});
