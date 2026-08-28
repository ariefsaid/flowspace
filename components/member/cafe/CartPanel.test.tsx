/**
 * I-044 UI-fix round: WCAG-AA contrast regression test for CartPanel's
 * empty-cart state. Scoped to the A4 fix only (not a full component suite).
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { CartPanel } from "./CartPanel";

describe("CartPanel (empty state)", () => {
  it("A4 (WCAG-AA contrast): the empty-cart helper text uses text-gray-500 (4.83:1), not gray-400 (2.54:1, fails AA)", () => {
    render(
      <CartPanel
        items={[]}
        discountPct={0}
        onClose={vi.fn()}
        onIncrement={vi.fn()}
        onDecrement={vi.fn()}
        onCheckout={vi.fn()}
        notes=""
        onNotesChange={vi.fn()}
      />,
    );
    expect(screen.getByText("Keranjang masih kosong")).toBeInTheDocument();
    const helper = screen.getByText("Tambahkan menu favorit Anda");
    expect(helper).toHaveClass("text-gray-500");
    expect(helper).not.toHaveClass("text-gray-400");
  });
});
