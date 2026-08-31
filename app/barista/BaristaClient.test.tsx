/**
 * AC-101: BaristaClient renders DB-provided orders (unit/RTL).
 * Static gate: barista/ files must not import lib/mock/barista.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BaristaClient } from "./BaristaClient";
import type { BaristaOrderView } from "./BaristaClient";

class MockAudioContext {
  static instances: MockAudioContext[] = [];
  currentTime = 0;
  destination = {};
  constructor() {
    MockAudioContext.instances.push(this);
  }
  createOscillator() {
    return {
      type: "sine",
      frequency: { value: 0 },
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    };
  }
  createGain() {
    return {
      gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
      connect: vi.fn(),
    };
  }
}

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
  notes: null,
  lines: [{ name: "Latte", qty: 1, variant: "Temperature: Hot" }],
};

beforeEach(() => {
  MockAudioContext.instances = [];
  vi.stubGlobal("AudioContext", MockAudioContext);
});

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

  it("AC-714: renders a generic variant-option snapshot and a highlighted note block", () => {
    const orderWithNote: BaristaOrderView = {
      id: "order-2",
      code: "#cd5678",
      customer: "Guest: Sari",
      status: "new",
      placedAt: new Date("2026-06-15T10:00:00Z").toISOString(),
      notes: "extra hot please",
      lines: [{ name: "Kopi Susu", qty: 1, variant: "Temperature: Cold" }],
    };
    render(<BaristaClient initialOrders={[orderWithNote]} orgId="org-test" />);

    expect(screen.getByText(/temperature: cold/i)).toBeInTheDocument();
    const noteBlock = screen.getByLabelText(/catatan pesanan/i);
    expect(noteBlock).toHaveTextContent("extra hot please");
    expect(noteBlock.className).toMatch(/amber-100/);
    expect(noteBlock.className).toMatch(/amber-700/);
  });

  it("does not render a note block when notes is null", () => {
    render(<BaristaClient initialOrders={[newOrder]} orgId="org-test" />);
    expect(screen.queryByLabelText(/catatan pesanan/i)).not.toBeInTheDocument();
  });

  it("AC-i049-2: does not notify (toast/beep) on first load even with a NEW order already present", () => {
    render(<BaristaClient initialOrders={[newOrder]} orgId="org-test" />);
    expect(screen.queryByText(/pesanan baru masuk/i)).not.toBeInTheDocument();
    expect(MockAudioContext.instances).toHaveLength(0);
  });

  it("AC-i049-2: new NEW order with sound on shows the toast and plays a beep", () => {
    const { rerender } = render(<BaristaClient initialOrders={[]} orgId="org-test" />);
    expect(MockAudioContext.instances).toHaveLength(0);

    rerender(<BaristaClient initialOrders={[newOrder]} orgId="org-test" />);

    expect(screen.getByText(/pesanan baru masuk/i)).toBeInTheDocument();
    expect(MockAudioContext.instances).toHaveLength(1);
  });

  it("AC-i049-2: sound toggle off suppresses the new-order notice entirely", () => {
    const { rerender } = render(<BaristaClient initialOrders={[]} orgId="org-test" />);

    fireEvent.click(screen.getByRole("button", { name: /matikan suara/i }));

    rerender(<BaristaClient initialOrders={[newOrder]} orgId="org-test" />);

    expect(screen.queryByText(/pesanan baru masuk/i)).not.toBeInTheDocument();
    expect(MockAudioContext.instances).toHaveLength(0);
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
