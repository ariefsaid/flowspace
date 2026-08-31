/**
 * Accessible data-table fallback for the inline-SVG charts (I-048). Rendered
 * inside a native `<details>` so it's always in the DOM (screen readers /
 * find-in-page reach it) but collapsed by default for sighted users who
 * already have the chart + legend.
 */
import type { ChartDatum } from "./types";

export interface ChartDataTableProps {
  caption: string;
  valueHeader: string;
  data: ChartDatum[];
  formatValue?: (value: number) => string;
}

const defaultFormat = (value: number) => value.toLocaleString("id-ID");

export function ChartDataTable({ caption, valueHeader, data, formatValue = defaultFormat }: ChartDataTableProps) {
  return (
    <details className="mt-3 text-sm">
      <summary className="cursor-pointer select-none rounded text-teal-600 hover:text-teal-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/30">
        Lihat sebagai tabel
      </summary>
      <table className="mt-2 w-full text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-gray-500">
            <th scope="col" className="py-1 pr-4">
              Label
            </th>
            <th scope="col" className="py-1">
              {valueHeader}
            </th>
          </tr>
        </thead>
        <tbody>
          {data.length === 0 ? (
            <tr>
              <td colSpan={2} className="py-2 text-gray-400">
                Belum ada data
              </td>
            </tr>
          ) : (
            data.map((d) => (
              <tr key={d.label} className="border-b border-slate-100 last:border-0">
                <td className="py-1 pr-4 text-gray-700">{d.label}</td>
                <td className="py-1 font-medium text-gray-900">{formatValue(d.value)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </details>
  );
}

export default ChartDataTable;
