import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { BarChart } from "./BarChart";

const DATA = [
  { label: "Aktif", value: 4 },
  { label: "Selesai", value: 9 },
  { label: "Dibatalkan", value: 1 },
];

describe("BarChart", () => {
  it("renders one bar (rect) per datum and an accessible title", () => {
    render(<BarChart title="Statistik Booking" data={DATA} />);
    const svg = screen.getByRole("img", { name: "Statistik Booking" });
    expect(svg.querySelectorAll("rect").length).toBe(DATA.length);
  });

  it("renders a visible legend entry per datum with its formatted value", () => {
    render(<BarChart title="Statistik Booking" data={DATA} />);
    const legend = screen.getByRole("list");
    expect(within(legend).getByText(/Aktif/)).toBeInTheDocument();
    expect(within(legend).getByText(/Selesai/)).toBeInTheDocument();
    expect(within(legend).getByText("9")).toBeInTheDocument();
  });

  it("renders the a11y data-table fallback with every row", () => {
    render(<BarChart title="Statistik Booking" data={DATA} />);
    const table = screen.getByRole("table", { hidden: true });
    for (const d of DATA) {
      expect(within(table).getByText(d.label)).toBeInTheDocument();
    }
  });

  it("shows the empty state and an empty-but-present table when there is no data", () => {
    render(<BarChart title="Statistik Booking" data={[]} />);
    expect(screen.getAllByText(/Belum ada data/).length).toBeGreaterThan(0);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    // The table fallback still renders (collapsed) with its own "no data" row.
    expect(screen.getByRole("table", { hidden: true })).toBeInTheDocument();
  });
});
