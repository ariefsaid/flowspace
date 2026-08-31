import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { DonutChart } from "./DonutChart";

const DATA = [
  { label: "Booking", value: 50_000 },
  { label: "Pesanan Cafe", value: 30_000 },
  { label: "Print", value: 20_000 },
];

describe("DonutChart", () => {
  it("renders one arc segment per datum plus the track circle, with an accessible title", () => {
    render(<DonutChart title="Pendapatan per Jenis" data={DATA} />);
    const svg = screen.getByRole("img", { name: "Pendapatan per Jenis" });
    // 1 background track circle + 1 per segment.
    expect(svg.querySelectorAll("circle").length).toBe(DATA.length + 1);
  });

  it("renders a visible legend with label, value, and percentage per segment", () => {
    render(<DonutChart title="Pendapatan per Jenis" data={DATA} />);
    const legend = screen.getByRole("list");
    expect(within(legend).getByText("Booking")).toBeInTheDocument();
    expect(within(legend).getByText("50.000")).toBeInTheDocument();
    expect(within(legend).getByText("(50%)")).toBeInTheDocument();
  });

  it("renders the a11y data-table fallback with every segment", () => {
    render(<DonutChart title="Pendapatan per Jenis" data={DATA} />);
    const table = screen.getByRole("table", { hidden: true });
    for (const d of DATA) {
      expect(within(table).getByText(d.label)).toBeInTheDocument();
    }
  });

  it("shows the empty state when total value is zero", () => {
    render(<DonutChart title="Pendapatan per Jenis" data={[{ label: "Booking", value: 0 }]} />);
    expect(screen.getByText(/Belum ada data/)).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
});
