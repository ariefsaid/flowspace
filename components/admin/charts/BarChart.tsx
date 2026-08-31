/**
 * Lightweight inline-SVG bar chart (I-048) — used for the admin reports
 * "Statistik Booking" panel. No charting dependency: a handful of `<rect>`s
 * scaled to the max value, a visible legend, and an a11y table fallback.
 */
import type { ChartDatum } from "./types";
import { colorAt } from "./palette";
import { ChartDataTable } from "./ChartDataTable";
import { ChartEmpty } from "./ChartEmpty";

export interface BarChartProps {
  title: string;
  data: ChartDatum[];
  valueHeader?: string;
  formatValue?: (value: number) => string;
}

const WIDTH = 400;
const HEIGHT = 220;
const PADDING = { top: 16, right: 12, bottom: 32, left: 12 };
const defaultFormat = (value: number) => value.toLocaleString("id-ID");

export function BarChart({ title, data, valueHeader = "Jumlah", formatValue = defaultFormat }: BarChartProps) {
  const hasData = data.length > 0 && data.some((d) => d.value > 0);
  const chartHeight = HEIGHT - PADDING.top - PADDING.bottom;
  const bandWidth = hasData ? (WIDTH - PADDING.left - PADDING.right) / data.length : 0;
  const barWidth = Math.min(48, bandWidth * 0.6);
  const max = Math.max(...data.map((d) => d.value), 1);

  return (
    <div>
      {!hasData ? (
        <ChartEmpty />
      ) : (
        <>
          <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={title} className="h-56 w-full">
            <title>{title}</title>
            {data.map((d, i) => {
              const barHeight = Math.max((d.value / max) * chartHeight, 1);
              const x = PADDING.left + i * bandWidth + (bandWidth - barWidth) / 2;
              const y = PADDING.top + (chartHeight - barHeight);
              return (
                <g key={d.label}>
                  <rect x={x} y={y} width={barWidth} height={barHeight} fill={d.color ?? colorAt(i)} rx={4} />
                  <text
                    x={x + barWidth / 2}
                    y={HEIGHT - PADDING.bottom + 16}
                    textAnchor="middle"
                    fontSize="10"
                    className="fill-gray-500"
                  >
                    {d.label}
                  </text>
                </g>
              );
            })}
          </svg>
          <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-gray-600">
            {data.map((d, i) => (
              <li key={d.label} className="flex items-center gap-1.5">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-sm"
                  style={{ backgroundColor: d.color ?? colorAt(i) }}
                  aria-hidden="true"
                />
                {d.label}: <span className="font-medium text-gray-900">{formatValue(d.value)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      <ChartDataTable caption={title} valueHeader={valueHeader} data={data} formatValue={formatValue} />
    </div>
  );
}

export default BarChart;
