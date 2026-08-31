/**
 * Step4Confirm (I-040 design round-2 fixes).
 *
 * - Payment-option radios are `sr-only`; the wrapping label must show a
 *   visible focus ring when the input receives keyboard focus (WCAG 2.4.7).
 * - The member's time-credit balance is surfaced adjacent to the "Time
 *   Credits" option (Lens D decision point), at AA-passing contrast, with a
 *   disabled/"Saldo habis" state when the balance is 0.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Step4Confirm } from "./Step4Confirm";
import type { TimeSelection } from "./Step2Time";
import type { FacilitySeat } from "./FloorPlan";

const time: TimeSelection = { date: "2026-06-21", startTime: "09:00", durationHours: 2 };

const place: FacilitySeat = {
  id: "fac_a",
  label: "Meja A",
  seatLabel: "A",
  zone: "DESK",
  status: "available",
  ratePerHourRupiah: 25_000,
};

const discounts = { coworkingDiscountPct: 0, meetingDiscountPct: 0 };

function baseProps(overrides: Partial<React.ComponentProps<typeof Step4Confirm>> = {}) {
  return {
    bookingType: "scheduled-coworking" as const,
    time,
    place,
    discounts,
    paymentMethod: "online" as const,
    onPaymentMethodChange: vi.fn(),
    policyAccepted: false,
    onPolicyAcceptedChange: vi.fn(),
    onConfirm: vi.fn(),
    submitting: false,
    result: null,
    timeCredits: 4.5,
    ...overrides,
  };
}

describe("Step4Confirm — payment focus + time-credit balance", () => {
  it("design-review: the payment-option label shows a visible keyboard focus ring", () => {
    render(<Step4Confirm {...baseProps()} />);
    const label = screen.getByRole("radio", { name: /Online/ }).closest("label");
    expect(label?.className).toMatch(/has-\[:focus-visible\]:ring-2/);
    expect(label?.className).toMatch(/has-\[:focus-visible\]:ring-teal-500/);
  });

  it("design-review: shows the real time-credit balance adjacent to the Time Credits option", () => {
    render(<Step4Confirm {...baseProps({ timeCredits: 4.5 })} />);
    const timeCreditsLabel = screen.getByRole("radio", { name: /Time Credits/ }).closest("label");
    expect(timeCreditsLabel).toHaveTextContent("4.5 jam");
    // Readable contrast token, not the failing text-gray-400 (2.5:1).
    expect(timeCreditsLabel?.innerHTML).not.toMatch(/text-gray-400/);
  });

  it("design-review: disables the Time Credits option and shows 'Saldo habis' when balance is 0", () => {
    render(<Step4Confirm {...baseProps({ timeCredits: 0 })} />);
    const radio = screen.getByRole("radio", { name: /Time Credits/ });
    expect(radio).toBeDisabled();
    const label = radio.closest("label");
    expect(label).toHaveTextContent("Saldo habis");
  });

  it("does not surface the raw balance readout outside the payment picker (no more bottom-of-page gray-400 line)", () => {
    render(<Step4Confirm {...baseProps()} />);
    expect(screen.queryByText(/Saldo Time Credits Anda/)).toBeNull();
  });
});

describe("Step4Confirm — AC-i049-3: 8-clause booking policy", () => {
  it("renders all 8 numbered policy clauses in a scrollable box", () => {
    render(<Step4Confirm {...baseProps()} />);
    for (let i = 1; i <= 8; i++) {
      expect(screen.getByText(`${i}.`)).toBeInTheDocument();
    }
    expect(screen.getByText(/perekaman video atau fotografi komersial/i)).toBeInTheDocument();
    expect(
      screen.getByText(/1 \(satu\) jam pemesanan ruang pra-acara/i),
    ).toBeInTheDocument();
  });

  it("Konfirmasi Booking stays disabled until the policy checkbox is checked", () => {
    const { rerender } = render(<Step4Confirm {...baseProps({ policyAccepted: false })} />);
    expect(screen.getByRole("button", { name: /konfirmasi booking/i })).toBeDisabled();

    rerender(<Step4Confirm {...baseProps({ policyAccepted: true })} />);
    expect(screen.getByRole("button", { name: /konfirmasi booking/i })).not.toBeDisabled();
  });

  it("checking the policy checkbox calls onPolicyAcceptedChange(true)", () => {
    const onPolicyAcceptedChange = vi.fn();
    render(<Step4Confirm {...baseProps({ onPolicyAcceptedChange })} />);
    const checkbox = screen.getByRole("checkbox");
    fireEvent.click(checkbox);
    expect(onPolicyAcceptedChange).toHaveBeenCalledWith(true);
  });
});
