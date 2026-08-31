import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { LineChart } from "./LineChart";

const DATA = [
  { label: "2026-01-01", value: 10_000 },
  { label: "2026-01-02", value: 25_000 },
  { label: "2026-01-03", value: 15_000 },
];

describe("LineChart", () => {
  it("renders a single connected path through every point and an accessible title", () => {
    render(<LineChart title="Tren Pendapatan" seriesLabel="Pendapatan" data={DATA} />);
    const svg = screen.getByRole("img", { name: "Tren Pendapatan" });
    expect(svg.querySelectorAll("path").length).toBe(1);
    expect(svg.querySelectorAll("circle").length).toBe(DATA.length);
  });

  it("renders a visible legend naming the series", () => {
    render(<LineChart title="Tren Pendapatan" seriesLabel="Pendapatan" data={DATA} />);
    expect(screen.getByText("Pendapatan")).toBeInTheDocument();
  });

  it("renders the a11y data-table fallback with every bucket", () => {
    render(<LineChart title="Tren Pendapatan" seriesLabel="Pendapatan" data={DATA} />);
    const table = screen.getByRole("table", { hidden: true });
    for (const d of DATA) {
      expect(within(table).getByText(d.label)).toBeInTheDocument();
    }
  });

  it("shows the empty state when there is no data", () => {
    render(<LineChart title="Tren Pendapatan" seriesLabel="Pendapatan" data={[]} />);
    expect(screen.getAllByText(/Belum ada data/).length).toBeGreaterThan(0);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
});
