/**
 * Categorical chart palette — DESIGN.md tokens only (teal primary, orange
 * accent, plus the purple/blue/amber already used elsewhere in this app for
 * the print-action gradient and status badges). CSS variables, never raw hex
 * (Tailwind v4 emits `--color-<name>` globally from `@import "tailwindcss"`).
 */
export const CHART_PALETTE = [
  "var(--color-teal-500)",
  "var(--color-orange-500)",
  "var(--color-purple-500)",
  "var(--color-blue-500)",
  "var(--color-amber-500)",
  "var(--color-slate-400)",
] as const;

export function colorAt(index: number): string {
  return CHART_PALETTE[index % CHART_PALETTE.length];
}
