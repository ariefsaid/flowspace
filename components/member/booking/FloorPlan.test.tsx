/**
 * FloorPlan (I-040, Phase 7) — server-driven place selection, replacing the
 * hardcoded seat map defect (OBS-836).
 *
 * AC-803: click an available seat selects it; an occupied seat cannot be
 *         selected (disabled, no onSelect call).
 * AC-843: the component renders ONLY the facility props it is given — no
 *         hardcoded seat catalog (e.g. a literal "Meja X" array) is imported
 *         or defined in the source file.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FloorPlan, type FacilitySeat } from "./FloorPlan";

const desks: FacilitySeat[] = [
  { id: "fac_a", label: "Meja A", seatLabel: "A", zone: "DESK", status: "available", ratePerHourRupiah: 25_000 },
  { id: "fac_b", label: "Meja B", seatLabel: "B", zone: "DESK", status: "occupied", ratePerHourRupiah: 25_000 },
];

const meetingRooms: FacilitySeat[] = [
  { id: "fac_mr_a", label: "Meeting Room A", seatLabel: null, zone: "MEETING", status: "available", ratePerHourRupiah: 150_000 },
];

const fullRoom: FacilitySeat[] = [
  { id: "fac_fr", label: "Full Room Event", seatLabel: null, zone: "FULL_ROOM", status: "available", ratePerHourRupiah: 350_000 },
];

describe("FloorPlan (AC-803/843)", () => {
  it("AC-803: clicking an available seat selects it", () => {
    const onSelect = vi.fn();
    render(<FloorPlan seats={desks} selectedId={null} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("button", { name: /Meja A/ }));
    expect(onSelect).toHaveBeenCalledWith(desks[0]);
  });

  it("AC-803: an occupied seat is disabled and cannot be selected", () => {
    const onSelect = vi.fn();
    render(<FloorPlan seats={desks} selectedId={null} onSelect={onSelect} />);
    const occupiedBtn = screen.getByRole("button", { name: /Meja B/ });
    expect(occupiedBtn).toBeDisabled();
    fireEvent.click(occupiedBtn);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("marks the selected seat visually distinct (aria-pressed)", () => {
    render(<FloorPlan seats={desks} selectedId="fac_a" onSelect={vi.fn()} />);
    expect(screen.getByRole("button", { name: /Meja A/ })).toHaveAttribute("aria-pressed", "true");
  });

  it("renders meeting-room zone facilities as a selectable list", () => {
    const onSelect = vi.fn();
    render(<FloorPlan seats={meetingRooms} selectedId={null} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("button", { name: /Meeting Room A/ }));
    expect(onSelect).toHaveBeenCalledWith(meetingRooms[0]);
  });

  it("renders a full-room zone facility as a single selectable card", () => {
    const onSelect = vi.fn();
    render(<FloorPlan seats={fullRoom} selectedId={null} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("button", { name: /Full Room Event/ }));
    expect(onSelect).toHaveBeenCalledWith(fullRoom[0]);
  });

  it("empty state: no facilities available for the criteria", () => {
    render(<FloorPlan seats={[]} selectedId={null} onSelect={vi.fn()} />);
    expect(
      screen.getByText(/Tidak ada tempat tersedia/i),
    ).toBeInTheDocument();
  });

  it("AC-843: imports/defines no hardcoded seat catalog — renders only prop labels", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const source = await fs.readFile(
      path.resolve(__dirname, "FloorPlan.tsx"),
      "utf8",
    );
    // No literal seat-label arrays like the superseded Step3Place.tsx had.
    expect(source).not.toMatch(/Meja [A-Z]"/);
    expect(source).not.toMatch(/COWORKING_SEATS|MEETING_ROOMS/);

    // Renders a facility name that is present ONLY in the test's own props,
    // never hardcoded — proves the component has no baked-in catalog.
    const uniqueLabel = "Meja ZZZ (Test Only)";
    render(
      <FloorPlan
        seats={[
          {
            id: "fac_zz",
            label: uniqueLabel,
            seatLabel: "ZZ",
            zone: "DESK",
            status: "available",
            ratePerHourRupiah: 1,
          },
        ]}
        selectedId={null}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByText(uniqueLabel)).toBeInTheDocument();
  });
});
