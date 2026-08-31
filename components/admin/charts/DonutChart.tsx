/**
 * Lightweight inline-SVG donut chart (I-048) — used for the admin reports
 * "Pendapatan per Jenis" panel. No charting dependency: stacked stroke-dasharray
 * arcs on a single circle, a visible legend (label + value + %), and an a11y
 * table fallback.
 */
import type { ChartDatum } from "./types";
import { colorAt } from "./palette";
import { ChartDataTable } from "./ChartDataTable";
import { ChartEmpty } from "./ChartEmpty";

export interface DonutChartProps {
  title: string;
  data: ChartDatum[];
  valueHeader?: string;
  formatValue?: (value: number) => string;
}

const SIZE = 200;
const RADIUS = 70;
const STROKE = 28;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const defaultFormat = (value: number) => value.toLocaleString("id-ID");

export function DonutChart({ title, data, valueHeader = "Jumlah", formatValue = defaultFormat }: DonutChartProps) {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  const hasData = data.length > 0 && total > 0;

  let cursor = 0;
  const segments = hasData
    ? data.map((d, i) => {
        const fraction = d.value / total;
        const dash = fraction * CIRCUMFERENCE;
        const segment = {
          d,
          color: d.color ?? colorAt(i),
          dash,
          dashOffset: -cursor,
          percent: Math.round(fraction * 100),
        };
        cursor += dash;
        return segment;
      })
    : [];

  return (
    <div>
      {!hasData ? (
        <ChartEmpty />
      ) : (
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
          <svg viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label={title} className="h-48 w-48 shrink-0 -rotate-90">
            <title>{title}</title>
            <circle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} fill="none" stroke="var(--color-slate-100)" strokeWidth={STROKE} />
            {segments.map((s) => (
              <circle
                key={s.d.label}
                cx={SIZE / 2}
                cy={SIZE / 2}
                r={RADIUS}
                fill="none"
                stroke={s.color}
                strokeWidth={STROKE}
                strokeDasharray={`${s.dash} ${CIRCUMFERENCE - s.dash}`}
                strokeDashoffset={s.dashOffset}
              />
            ))}
          </svg>
          <ul className="w-full space-y-1.5 text-xs text-gray-600">
            {segments.map((s) => (
              <li key={s.d.label} className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: s.color }} aria-hidden="true" />
                <span className="flex-1 truncate">{s.d.label}</span>
                <span className="font-medium text-gray-900">{formatValue(s.d.value)}</span>
                <span className="text-gray-400">({s.percent}%)</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <ChartDataTable caption={title} valueHeader={valueHeader} data={data} formatValue={formatValue} />
    </div>
  );
}

export default DonutChart;
