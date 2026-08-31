/**
 * TopupClient (unit/RTL) — I-020, I-049.
 *   renders DB-sourced packages + balances; clicking a card opens a confirm
 *   dialog (recap + payment method), Konfirmasi triggers a brief processing
 *   state then calls the action and shows a success dialog.
 * Static gate: app/(member)/topup/ must not import lib/mock.
 *
 * Real timers are used throughout (not vi.useFakeTimers()): TopupClient's
 * confirm flow awaits a real ~1.8s setTimeout before calling the action, and
 * RTL's findBy and waitFor helpers poll via real setTimeout too — mixing the
 * two is a known source of hangs. Per-test timeouts are extended instead.
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
  topUpPrintAction: vi.fn().mockResolvedValue({} as never),
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

const DIALOG_TIMEOUT = 8000;

beforeEach(() => {
  vi.mocked(purchasePackageAction).mockReset().mockResolvedValue({ timeCredits: 0 });
  vi.mocked(topUpPrintAction).mockReset().mockResolvedValue({} as never);
});

/** Clicks a package card, then confirms the dialog. */
function purchaseViaDialog(cardText: string) {
  fireEvent.click(screen.getByText(cardText));
  fireEvent.click(screen.getByRole("button", { name: /konfirmasi/i }));
}

describe("TopupClient (I-020)", () => {
  it(
    "renders server-provided print package rows and confirms via the dialog",
    async () => {
      render(
        <TopupClient
          packages={samplePackages}
          printPackages={[
            { id: "print-10", pages: 10, priceRupiah: 10000, sortOrder: 1 },
            { id: "print-50", pages: 50, priceRupiah: 45000, sortOrder: 2 },
          ]}
          timeCredits={0}
          printBalance={0}
        />,
      );
      fireEvent.click(screen.getByRole("button", { name: /print balance/i }));
      expect(screen.getByText("10 Pages")).toBeInTheDocument();
      expect(screen.getByText("Rp 10.000")).toBeInTheDocument();

      purchaseViaDialog("10 Pages");
      await waitFor(() => expect(topUpPrintAction).toHaveBeenCalledWith("print-10"), {
        timeout: DIALOG_TIMEOUT,
      });
    },
    DIALOG_TIMEOUT + 2000,
  );

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

  it(
    "clicking a time package opens the confirm dialog with the recap + payment method, then Konfirmasi calls purchasePackageAction once",
    async () => {
      render(
        <TopupClient
          packages={samplePackages}
          timeCredits={0}
          printBalance={0}
        />,
      );

      fireEvent.click(screen.getByText("5 Hours"));

      // AC-i049-7: recap + payment method label render inside the dialog.
      const dialog = screen.getByRole("dialog");
      expect(dialog).toHaveTextContent("5 Hours");
      expect(dialog).toHaveTextContent("Rp 75.000");
      expect(dialog).toHaveTextContent(/mock payment gateway/i);
      expect(dialog).toHaveTextContent(/qris.*virtual account/i);
      expect(screen.getByRole("button", { name: /batal/i })).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: /konfirmasi/i }));

      // Processing state shown well before the ~1.8s mock delay resolves.
      await waitFor(() =>
        expect(screen.getByRole("heading", { name: /memproses/i })).toBeInTheDocument(),
      );

      await waitFor(
        () => {
          expect(purchasePackageAction).toHaveBeenCalledTimes(1);
          expect(purchasePackageAction).toHaveBeenCalledWith("pkg-5h");
        },
        { timeout: DIALOG_TIMEOUT },
      );

      // Success dialog.
      await waitFor(() => expect(screen.getByText(/berhasil/i)).toBeInTheDocument(), {
        timeout: DIALOG_TIMEOUT,
      });
    },
    DIALOG_TIMEOUT + 2000,
  );

  it("Batal closes the dialog without calling the action", () => {
    render(
      <TopupClient
        packages={samplePackages}
        timeCredits={0}
        printBalance={0}
      />,
    );

    fireEvent.click(screen.getByText("5 Hours"));
    screen.getByRole("dialog");
    fireEvent.click(screen.getByRole("button", { name: /batal/i }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(purchasePackageAction).not.toHaveBeenCalled();
  });

  it(
    "switches to the print tab and clicking a print package calls topUpPrintAction with its pages",
    async () => {
      render(
        <TopupClient
          packages={samplePackages}
          printPackages={[{ id: "print-50", pages: 50, priceRupiah: 25000, sortOrder: 1 }, { id: "print-100", pages: 100, priceRupiah: 50000, sortOrder: 2 }]}
          timeCredits={0}
          printBalance={0}
        />,
      );

      // open the print tab (balance tile acts as a tab)
      fireEvent.click(screen.getByRole("button", { name: /print balance/i }));

      // 100-page server package card
      purchaseViaDialog("100 Pages");

      await waitFor(
        () => {
          expect(topUpPrintAction).toHaveBeenCalledWith("print-100");
        },
        { timeout: DIALOG_TIMEOUT },
      );
    },
    DIALOG_TIMEOUT + 2000,
  );

  it(
    "surfaces a mapped Indonesian error when purchasePackageAction rejects, and closes the dialog",
    async () => {
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

      purchaseViaDialog("5 Hours");

      const alert = await screen.findByRole("alert", {}, { timeout: DIALOG_TIMEOUT });
      expect(alert).toHaveTextContent(/paket tidak tersedia/i);
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    },
    DIALOG_TIMEOUT + 2000,
  );

  it(
    "surfaces a friendly Indonesian message when the simulated payment declines",
    async () => {
      vi.mocked(purchasePackageAction).mockRejectedValue(
        new Error("PAYMENT_DECLINED"),
      );

      render(
        <TopupClient
          packages={samplePackages}
          timeCredits={0}
          printBalance={0}
        />,
      );

      purchaseViaDialog("5 Hours");

      const alert = await screen.findByRole("alert", {}, { timeout: DIALOG_TIMEOUT });
      expect(alert).toHaveTextContent(/pembayaran ditolak/i);
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    },
    DIALOG_TIMEOUT + 2000,
  );

  it("AC-i049-8: initialTab prop pre-selects the print tab (deep-link)", () => {
    render(
      <TopupClient
        packages={samplePackages}
        printPackages={[{ id: "print-10", pages: 10, priceRupiah: 10000, sortOrder: 1 }]}
        timeCredits={0}
        printBalance={0}
        initialTab="print"
      />,
    );
    expect(screen.getByText("Print Balance Packages")).toBeInTheDocument();
    expect(screen.getByText("10 Pages")).toBeInTheDocument();
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
