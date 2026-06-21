/**
 * TopupClient (unit/RTL) — I-020.
 *   renders DB-sourced packages + balances; clicking a card calls the action.
 * Static gate: app/(member)/topup/ must not import lib/mock.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { TopupClient } from "./TopupClient";
import type { PackageView } from "./TopupClient";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("@/app/(member)/topup/actions", () => ({
  purchasePackageAction: vi.fn().mockResolvedValue({ timeCredits: 0 }),
  topUpPrintAction: vi.fn().mockResolvedValue({ printBalance: 0 }),
}));

import {
  purchasePackageAction,
  topUpPrintAction,
} from "@/app/(member)/topup/actions";

const samplePackages: PackageView[] = [
  {
    id: "pkg-5h",
    name: "5 Hours",
    hours: 5,
    priceRupiah: 75000,
    pricePerHourRupiah: 15000,
    popular: false,
  },
  {
    id: "pkg-10h",
    name: "10 Hours",
    hours: 10,
    priceRupiah: 140000,
    pricePerHourRupiah: 14000,
    popular: true,
  },
];

beforeEach(() => {
  vi.mocked(purchasePackageAction).mockResolvedValue({ timeCredits: 0 });
  vi.mocked(topUpPrintAction).mockResolvedValue({ printBalance: 0 });
});

describe("TopupClient (I-020)", () => {
  it("renders DB-sourced packages + balances passed as props", () => {
    render(
      <TopupClient
        packages={samplePackages}
        timeCredits={12}
        printBalance={34}
      />,
    );
    // balances
    expect(screen.getByText("12.0")).toBeInTheDocument();
    expect(screen.getByText("34")).toBeInTheDocument();
    // package hours + DB prices
    expect(screen.getByText("5 Hours")).toBeInTheDocument();
    expect(screen.getByText("10 Hours")).toBeInTheDocument();
    expect(screen.getByText("Rp 75.000")).toBeInTheDocument();
    expect(screen.getByText("Rp 140.000")).toBeInTheDocument();
    expect(screen.getByText("Rp 15.000/hour")).toBeInTheDocument();
    // popular badge only on the 10h package
    expect(screen.getByText("Popular")).toBeInTheDocument();
  });

  it("clicking a time package calls purchasePackageAction with that packageId", async () => {
    render(
      <TopupClient
        packages={samplePackages}
        timeCredits={0}
        printBalance={0}
      />,
    );

    fireEvent.click(screen.getByText("5 Hours"));

    await waitFor(() => {
      expect(purchasePackageAction).toHaveBeenCalledWith("pkg-5h");
    });
  });

  it("switches to the print tab and clicking a print package calls topUpPrintAction with its pages", async () => {
    render(
      <TopupClient
        packages={samplePackages}
        timeCredits={0}
        printBalance={0}
      />,
    );

    // open the print tab (balance tile acts as a tab)
    fireEvent.click(screen.getByRole("button", { name: /print balance/i }));

    // 100-page denomination card
    fireEvent.click(screen.getByText("100 Pages"));

    await waitFor(() => {
      expect(topUpPrintAction).toHaveBeenCalledWith(100);
    });
  });

  it("surfaces a mapped Indonesian error when purchasePackageAction rejects", async () => {
    vi.mocked(purchasePackageAction).mockRejectedValue(
      new Error("UNKNOWN_PACKAGE"),
    );

    render(
      <TopupClient
        packages={samplePackages}
        timeCredits={0}
        printBalance={0}
      />,
    );

    fireEvent.click(screen.getByText("5 Hours"));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/paket tidak tersedia/i);
  });

  it("no-mock-import gate: topup page files do not import lib/mock", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const dir = path.resolve(__dirname);
    const files = await fs.readdir(dir);
    const tsxFiles = files.filter(
      (f) => (f.endsWith(".tsx") || f.endsWith(".ts")) && !f.endsWith(".test.tsx"),
    );
    for (const file of tsxFiles) {
      const content = await fs.readFile(path.join(dir, file), "utf8");
      expect(content, `${file} must not import lib/mock`).not.toMatch(
        /from\s+["']@\/lib\/mock/,
      );
    }
  });
});
