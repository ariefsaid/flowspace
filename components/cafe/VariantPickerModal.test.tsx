/**
 * Unit/RTL tests for components/cafe/VariantPickerModal.tsx (I-044).
 * Shared by member/guest/POS surfaces.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { VariantPickerModal } from "@/components/cafe/VariantPickerModal";
import type { VariantConfig } from "@/lib/cafe/types";

const CONFIG: VariantConfig = {
  variants: [
    {
      name: "Temperature",
      required: true,
      options: [
        { name: "Hot", priceAdjustment: 0 },
        { name: "Cold", priceAdjustment: 3000 },
      ],
    },
    {
      name: "Sugar",
      required: true,
      options: [
        { name: "Normal Sugar", priceAdjustment: 0 },
        { name: "Less Sugar", priceAdjustment: 0 },
        { name: "No Sugar", priceAdjustment: 0 },
      ],
    },
  ],
};

const ITEM = {
  name: "Kopi Susu",
  emoji: "🧋",
  description: "Kopi susu klasik.",
  priceRupiah: 22000,
  variantConfig: CONFIG,
};

describe("VariantPickerModal", () => {
  it("AC-701: renders every configured group with its options, marks required groups", () => {
    render(<VariantPickerModal item={ITEM} onClose={vi.fn()} onConfirm={vi.fn()} />);
    expect(screen.getByText("Temperature")).toBeInTheDocument();
    expect(screen.getByText("Sugar")).toBeInTheDocument();
    expect(screen.getByText("Hot")).toBeInTheDocument();
    expect(screen.getByText("Cold")).toBeInTheDocument();
    expect(screen.getByText("Normal Sugar")).toBeInTheDocument();
    // required groups are announced (aria or visible text)
    const requiredMarks = screen.getAllByText(/wajib/i);
    expect(requiredMarks.length).toBeGreaterThanOrEqual(2);
  });

  it("AC-701/702: role=dialog with an accessible label, and defaults each group to its first option", () => {
    render(<VariantPickerModal item={ITEM} onClose={vi.fn()} onConfirm={vi.fn()} />);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAccessibleName(/Kopi Susu/i);
    expect(screen.getByRole("button", { name: "Hot" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Cold" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Normal Sugar" })).toHaveAttribute("aria-pressed", "true");
  });

  it("AC-703: selecting Cold (+Rp3.000) updates the displayed preview price", () => {
    render(<VariantPickerModal item={ITEM} onClose={vi.fn()} onConfirm={vi.fn()} />);
    expect(screen.getByText("Rp 22.000")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cold" }));
    expect(screen.getByText("Rp 25.000")).toBeInTheDocument();
  });

  it("AC-703: confirm submits only {variantName, optionName} selections, never a price", () => {
    const onConfirm = vi.fn();
    render(<VariantPickerModal item={ITEM} onClose={vi.fn()} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole("button", { name: "Cold" }));
    fireEvent.click(screen.getByRole("button", { name: "No Sugar" }));
    fireEvent.click(screen.getByRole("button", { name: /tambah ke keranjang/i }));
    expect(onConfirm).toHaveBeenCalledWith([
      { variantName: "Temperature", optionName: "Cold" },
      { variantName: "Sugar", optionName: "No Sugar" },
    ]);
  });

  it("calls onClose when the close button is clicked", () => {
    const onClose = vi.fn();
    render(<VariantPickerModal item={ITEM} onClose={onClose} onConfirm={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /tutup/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
