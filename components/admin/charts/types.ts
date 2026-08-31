/** Shared prop shape for the lightweight inline-SVG admin charts (I-048). */
export type ChartDatum = {
  label: string;
  value: number;
  /** CSS color value (e.g. `var(--color-teal-500)`) — defaults to the shared palette by index. */
  color?: string;
};
