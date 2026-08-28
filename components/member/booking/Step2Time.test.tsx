/**
 * Step2Time (I-040, Phase 7) — duration selection bounds.
 *
 * AC-802: scheduled bookings only accept 1–8 hour durations and the summary
 *         derives end = start + duration; walk-in bookings offer the 1–4h
 *         estimate list (no start time, open duration).
 */
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Step2Time, type TimeSelection } from "./Step2Time";

function baseValue(): TimeSelection {
  return { date: "2026-09-01", startTime: "09:00", durationHours: 2 };
}

describe("Step2Time (AC-802)", () => {
  it("scheduled: offers exactly the 1-8 hour range, none outside it", () => {
    render(
      <Step2Time bookingType="scheduled-coworking" value={baseValue()} onChange={() => {}} />,
    );
    for (let h = 1; h <= 8; h++) {
      expect(screen.getByRole("button", { name: `${h} jam` })).toBeInTheDocument();
    }
    expect(screen.queryByRole("button", { name: "9 jam" })).toBeNull();
    expect(screen.queryByRole("button", { name: "0 jam" })).toBeNull();
  });

  it("scheduled: selecting a duration derives end = start + duration in the summary", () => {
    const onChange = () => {};
    const { rerender } = render(
      <Step2Time bookingType="scheduled-coworking" value={baseValue()} onChange={onChange} />,
    );
    // Simulate choosing 5h (previously missing from the button set).
    fireEvent.click(screen.getByRole("button", { name: "5 jam" }));
    rerender(
      <Step2Time
        bookingType="scheduled-coworking"
        value={{ ...baseValue(), durationHours: 5 }}
        onChange={onChange}
      />,
    );
    // 09:00 + 5h = 14:00
    expect(screen.getByText(/Jam mulai: 09:00 — selesai: 14:00/)).toBeInTheDocument();
  });

  it("walk-in: offers the 1-4h estimate list and hides the start-time input", () => {
    render(
      <Step2Time
        bookingType="walkin-coworking"
        value={{ date: "2026-09-01", startTime: "", durationHours: 2 }}
        onChange={() => {}}
      />,
    );
    for (let h = 1; h <= 4; h++) {
      expect(screen.getByRole("button", { name: `${h} jam` })).toBeInTheDocument();
    }
    expect(screen.queryByRole("button", { name: "5 jam" })).toBeNull();
    expect(screen.queryByLabelText("Jam Mulai")).toBeNull();
  });
});
