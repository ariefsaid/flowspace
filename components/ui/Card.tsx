import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

type CardVariant = "default" | "highlight" | "info" | "muted";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
  children: ReactNode;
}

const variantClasses: Record<CardVariant, string> = {
  default: "border border-slate-200 bg-white shadow-sm",
  highlight: "border-2 border-teal-500 bg-white shadow-md",
  info: "border border-blue-200 bg-blue-50",
  muted: "border border-slate-200 bg-slate-50",
};

export function Card({
  variant = "default",
  className,
  children,
  ...props
}: CardProps) {
  return (
    <div
      className={cn("rounded-xl p-4", variantClasses[variant], className)}
      {...props}
    >
      {children}
    </div>
  );
}

export default Card;
