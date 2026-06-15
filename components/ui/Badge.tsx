import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

type BadgeTone =
  | "completed"
  | "pending"
  | "active"
  | "cancelled"
  | "paid"
  | "info"
  | "neutral";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone: BadgeTone;
  children: ReactNode;
}

const toneClasses: Record<BadgeTone, string> = {
  completed: "bg-green-100 text-green-700",
  pending: "bg-amber-100 text-amber-700",
  active: "bg-teal-100 text-teal-700",
  cancelled: "bg-red-100 text-red-700",
  paid: "bg-blue-100 text-blue-700",
  info: "bg-blue-100 text-blue-700",
  neutral: "bg-slate-100 text-slate-700",
};

export function Badge({ tone, className, children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        toneClasses[tone],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}

export default Badge;
