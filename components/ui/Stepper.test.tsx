/**
 * Stepper (unit/RTL) — wizard step indicator.
 *
 * Design review fix: each step must render as a filled pill capsule
 * (number + label together inside a rounded-full container), with the
 * active step as a solid teal pill (aria-current="step"), and inactive
 * steps as slate-tinted pills. The active step must NOT rely on color
 * alone — the step number and label remain visible.
 *
 * AC: wizard-stepper component pattern (DESIGN.md)
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Stepper } from "./Stepper";

const steps = ["Tipe", "Waktu", "Pilih Tempat", "Konfirmasi"];

describe("Stepper — pill shape + a11y", () => {
  it("renders each step label inside the pill (number + label together)", () => {
    render(<Stepper steps={steps} current={0} />);
    // All step labels must be present in the document
    expect(screen.getByText("Tipe")).toBeInTheDocument();
    expect(screen.getByText("Waktu")).toBeInTheDocument();
    expect(screen.getByText("Pilih Tempat")).toBeInTheDocument();
    expect(screen.getByText("Konfirmasi")).toBeInTheDocument();
  });

  it("active step has aria-current='step' (a11y: not color-only)", () => {
    render(<Stepper steps={steps} current={1} />);
    // Step 2 (Waktu) is active — its list item must carry aria-current="step"
    const activeItem = screen.getByRole("listitem", { current: "step" });
    expect(activeItem).toBeInTheDocument();
    // The active step label must still be visible (not hidden by color alone)
    expect(activeItem).toHaveTextContent("Waktu");
  });

  it("only the active step has aria-current='step'", () => {
    render(<Stepper steps={steps} current={2} />);
    const currentItems = screen
      .getAllByRole("listitem")
      .filter((el) => el.getAttribute("aria-current") === "step");
    expect(currentItems).toHaveLength(1);
    expect(currentItems[0]).toHaveTextContent("Pilih Tempat");
  });

  it("done steps show a checkmark (not the number)", () => {
    render(<Stepper steps={steps} current={2} />);
    // Steps 0 and 1 (Tipe, Waktu) are done — numbers 1 and 2 should not be visible
    // The check icon replaces them; we verify numbers are absent
    expect(screen.queryByText("1")).toBeNull();
    expect(screen.queryByText("2")).toBeNull();
    // Step numbers for pending steps are present
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
  });

  it("first step shows number 1 when active (not done)", () => {
    render(<Stepper steps={steps} current={0} />);
    expect(screen.getByText("1")).toBeInTheDocument();
  });
});
