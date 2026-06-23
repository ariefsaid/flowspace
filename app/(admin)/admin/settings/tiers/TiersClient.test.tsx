/**
 * AC-405: the pricing-config editor renders the current rates — print base
 * rates + one row per tier with cafe/print discount inputs.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { TiersClient, type TierRow } from "./TiersClient";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("./actions", () => ({ savePricingConfigAction: vi.fn() }));

const tiers: TierRow[] = [
  { tier: "REGULAR", cafeDiscountPct: 5, printDiscountPct: 0 },
  { tier: "PREMIUM", cafeDiscountPct: 5, printDiscountPct: 20 },
  { tier: "GOLD", cafeDiscountPct: 5, printDiscountPct: 20 },
];

describe("TiersClient", () => {
  it("AC-405: renders print base rates + a row per tier with current discounts", () => {
    render(
      <TiersClient
        tiers={tiers}
        printPricing={{ bwRatePerPageRupiah: 500, colorRatePerPageRupiah: 1500 }}
      />,
    );
    // print base rates
    expect(screen.getByDisplayValue("500")).toBeInTheDocument();
    expect(screen.getByDisplayValue("1500")).toBeInTheDocument();
    // one labelled input per tier × {cafe, print}
    expect(screen.getByLabelText("Diskon cafe PREMIUM")).toHaveValue(5);
    expect(screen.getByLabelText("Diskon print PREMIUM")).toHaveValue(20);
    expect(screen.getByLabelText("Diskon print GOLD")).toHaveValue(20);
    expect(screen.getByLabelText("Diskon print REGULAR")).toHaveValue(0);
    // tier labels present
    expect(screen.getByText("REGULAR")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Simpan/i })).toBeInTheDocument();
  });
});
