import { Check } from "lucide-react";
import { cn } from "@/lib/cn";

export interface StepperProps {
  steps: string[];
  /** Zero-based index of the active step. */
  current: number;
  className?: string;
}

export function Stepper({ steps, current, className }: StepperProps) {
  return (
    <ol className={cn("flex items-center", className)}>
      {steps.map((step, i) => {
        const done = i < current;
        const active = i === current;
        const isLast = i === steps.length - 1;
        return (
          <li
            key={step}
            className={cn("flex items-center", !isLast && "flex-1")}
          >
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
                  done && "bg-teal-500 text-white",
                  active && "bg-teal-500 text-white ring-4 ring-teal-100",
                  !done && !active && "bg-slate-100 text-gray-500",
                )}
              >
                {done ? <Check className="h-4 w-4" aria-hidden="true" /> : i + 1}
              </span>
              <span
                className={cn(
                  "text-sm font-medium",
                  active ? "text-gray-900" : "text-gray-500",
                )}
              >
                {step}
              </span>
            </div>
            {!isLast ? (
              <span
                className={cn(
                  "mx-3 h-px flex-1",
                  done ? "bg-teal-500" : "bg-slate-200",
                )}
                aria-hidden="true"
              />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

export default Stepper;
