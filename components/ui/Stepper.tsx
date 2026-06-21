import { Check } from "lucide-react";
import { cn } from "@/lib/cn";

export interface StepperProps {
  steps: string[];
  /** Zero-based index of the active step. */
  current: number;
  className?: string;
}

/**
 * WizardStepper — pill capsule variant (DESIGN.md wizard-stepper pattern).
 *
 * Each step renders as a rounded-full capsule containing the step number +
 * label together. Active step: solid teal pill (bg-teal-500 text-white).
 * Done step: teal pill with checkmark (number replaced). Pending step: slate
 * tinted pill (bg-slate-100 text-gray-500).
 *
 * A11y: active <li> carries aria-current="step"; the step number + label
 * remain visible inside the pill so active state is never conveyed by
 * color alone (WCAG 1.4.1).
 */
export function Stepper({ steps, current, className }: StepperProps) {
  return (
    <ol className={cn("flex items-center gap-2 flex-wrap", className)}>
      {steps.map((step, i) => {
        const done = i < current;
        const active = i === current;
        const isLast = i === steps.length - 1;
        return (
          <li
            key={step}
            aria-current={active ? "step" : undefined}
            className={cn("flex items-center", !isLast && "gap-2")}
          >
            {/* Pill capsule — number + label together */}
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold",
                done && "bg-teal-500 text-white",
                active && "bg-teal-500 text-white",
                !done && !active && "bg-slate-100 text-gray-500",
              )}
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center">
                {done ? (
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                ) : (
                  i + 1
                )}
              </span>
              {step}
            </span>

            {/* Connector chevron between steps */}
            {!isLast ? (
              <span
                className="text-gray-300 text-xs select-none"
                aria-hidden="true"
              >
                &rsaquo;
              </span>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

export default Stepper;
