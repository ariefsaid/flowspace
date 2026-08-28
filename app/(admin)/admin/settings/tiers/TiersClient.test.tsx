/**
 * The pricing-config editor renders four labelled discount inputs
 * (coworking/meeting/cafe/print) per enum tier, uses only enum tier labels,
 * and surfaces a save error without a false "saved" state (each `it()` title
 * below names its own owning acceptance criterion).
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { TiersClient, type TierRow } from "./TiersClient";
import { savePricingConfigAction } from "./actions";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("./actions", () => ({ savePricingConfigAction: vi.fn() }));

const tiers: TierRow[] = [
  { tier: "REGULAR", coworkingDiscountPct: 0, meetingDiscountPct: 0, cafeDiscountPct: 0, printDiscountPct: 0 },
  { tier: "PREMIUM", coworkingDiscountPct: 10, meetingDiscountPct: 10, cafeDiscountPct: 5, printDiscountPct: 5 },
  { tier: "GOLD", coworkingDiscountPct: 15, meetingDiscountPct: 15, cafeDiscountPct: 10, printDiscountPct: 10 },
];

describe("TiersClient", () => {
  it("AC-520: renders print base rates + four labelled discount inputs per tier, populated from seeded config", () => {
    render(
      <TiersClient
        tiers={tiers}
        printPricing={{ bwRatePerPageRupiah: 500, colorRatePerPageRupiah: 1500 }}
      />,
    );
    // print base rates
    expect(screen.getByDisplayValue("500")).toBeInTheDocument();
    expect(screen.getByDisplayValue("1500")).toBeInTheDocument();
    // REGULAR — 0/0/0/0
    expect(screen.getByLabelText("Diskon coworking REGULAR")).toHaveValue(0);
    expect(screen.getByLabelText("Diskon meeting REGULAR")).toHaveValue(0);
    expect(screen.getByLabelText("Diskon cafe REGULAR")).toHaveValue(0);
    expect(screen.getByLabelText("Diskon print REGULAR")).toHaveValue(0);
    // PREMIUM — 10/10/5/5
    expect(screen.getByLabelText("Diskon coworking PREMIUM")).toHaveValue(10);
    expect(screen.getByLabelText("Diskon meeting PREMIUM")).toHaveValue(10);
    expect(screen.getByLabelText("Diskon cafe PREMIUM")).toHaveValue(5);
    expect(screen.getByLabelText("Diskon print PREMIUM")).toHaveValue(5);
    // GOLD — 15/15/10/10
    expect(screen.getByLabelText("Diskon coworking GOLD")).toHaveValue(15);
    expect(screen.getByLabelText("Diskon meeting GOLD")).toHaveValue(15);
    expect(screen.getByLabelText("Diskon cafe GOLD")).toHaveValue(10);
    expect(screen.getByLabelText("Diskon print GOLD")).toHaveValue(10);
    expect(screen.getByRole("button", { name: /Simpan/i })).toBeInTheDocument();
  });

  it("AC-525: the tier-discount table renders only the bare enum tier labels, no dynamic display-name/color metadata", () => {
    render(
      <TiersClient
        tiers={tiers}
        printPricing={{ bwRatePerPageRupiah: 500, colorRatePerPageRupiah: 1500 }}
      />,
    );
    const tierCell = screen.getByText("REGULAR");
    // the tier cell holds exactly the enum name — no dynamic display-name/color
    // metadata (e.g. a sibling color swatch or description) is rendered alongside it.
    expect(tierCell.textContent).toBe("REGULAR");
    expect(tierCell.parentElement?.textContent).toBe("REGULAR");
    expect(screen.getByText("PREMIUM")).toBeInTheDocument();
    expect(screen.getByText("GOLD")).toBeInTheDocument();
  });

  it("AC-522: shows an error state and no saved indicator when the save action rejects", async () => {
    vi.mocked(savePricingConfigAction).mockRejectedValueOnce(new Error("INVALID_PCT:cafe"));
    render(
      <TiersClient
        tiers={tiers}
        printPricing={{ bwRatePerPageRupiah: 500, colorRatePerPageRupiah: 1500 }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Simpan/i }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.queryByText("Tersimpan")).not.toBeInTheDocument();
  });
});
