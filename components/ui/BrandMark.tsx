import { Layers } from "lucide-react";
import { brand } from "@/brand.config";
import { cn } from "@/lib/cn";

export interface BrandMarkProps {
  /** Render the brand name beside the logo tile (default true). */
  showName?: boolean;
  /** Use light text — for dark backgrounds (e.g. the footer). */
  variant?: "default" | "light";
  className?: string;
}

export function BrandMark({
  showName = true,
  variant = "default",
  className,
}: BrandMarkProps) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-teal-500 to-teal-600 text-white shadow-sm">
        <Layers className="h-5 w-5" aria-hidden="true" />
      </span>
      {showName ? (
        <span
          className={cn(
            "text-lg font-bold tracking-tight",
            variant === "light" ? "text-white" : "text-gray-900",
          )}
        >
          {brand.name}
        </span>
      ) : null}
    </span>
  );
}

export default BrandMark;
