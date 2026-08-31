/**
 * Lightweight inline-SVG line chart (I-048) — used for the admin reports
 * "Tren Pendapatan" panel. No charting dependency: a single scaled polyline
 * path, a visible legend, and an a11y table fallback.
 */
import type { ChartDatum } from "./types";
import { ChartDataTable } from "./ChartDataTable";
import { ChartEmpty } from "./ChartEmpty";

export interface LineChartProps {
  title: string;
  seriesLabel: string;
  data: ChartDatum[];
  valueHeader?: string;
  formatValue?: (value: number) => string;
  color?: string;
}

const WIDTH = 400;
const HEIGHT = 220;
const PADDING = { top: 16, right: 16, bottom: 32, left: 16 };
const defaultFormat = (value: number) => value.toLocaleString("id-ID");

export function LineChart({
  title,
  seriesLabel,
  data,
  valueHeader = "Nilai",
  formatValue = defaultFormat,
  color = "var(--color-teal-600)",
}: LineChartProps) {
  const hasData = data.length > 0;
  const chartWidth = WIDTH - PADDING.left - PADDING.right;
  const chartHeight = HEIGHT - PADDING.top - PADDING.bottom;
  const max = Math.max(...data.map((d) => d.value), 1);

  const points = data.map((d, i) => {
    const x = PADDING.left + (data.length === 1 ? chartWidth / 2 : (i / (data.length - 1)) * chartWidth);
    const y = PADDING.top + chartHeight - (d.value / max) * chartHeight;
    return { x, y, d };
  });

  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");

  return (
    <div>
      {!hasData ? (
        <ChartEmpty />
      ) : (
        <>
          <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={title} className="h-56 w-full">
            <title>{title}</title>
            <line
              x1={PADDING.left}
              y1={PADDING.top + chartHeight}
              x2={WIDTH - PADDING.right}
              y2={PADDING.top + chartHeight}
              stroke="var(--color-slate-200)"
              strokeWidth={1}
            />
            <path d={path} fill="none" stroke={color} strokeWidth={2} />
            {points.map((p) => (
              <circle key={p.d.label} cx={p.x} cy={p.y} r={3} fill={color} />
            ))}
            {points.map((p) => (
              <text
                key={`${p.d.label}-label`}
                x={p.x}
                y={HEIGHT - PADDING.bottom + 16}
                textAnchor="middle"
                fontSize="9"
                className="fill-gray-500"
              >
                {p.d.label}
              </text>
            ))}
          </svg>
          <ul className="mt-3 flex items-center gap-1.5 text-xs text-gray-600">
            <li className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: color }} aria-hidden="true" />
              {seriesLabel}
            </li>
          </ul>
        </>
      )}
      <ChartDataTable caption={title} valueHeader={valueHeader} data={data} formatValue={formatValue} />
    </div>
  );
}

export default LineChart;
