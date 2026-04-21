"use client";

import { cn } from "@/lib/utils";

type ProgressProps = {
  value: number;
  className?: string;
  indicatorClassName?: string;
};

export function Progress({ value, className, indicatorClassName }: ProgressProps) {
  const safe = Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
  return (
    <div
      className={cn("h-2 w-full overflow-hidden rounded-full bg-muted", className)}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(safe)}
    >
      <div
        className={cn("h-full bg-primary transition-[width] duration-300 ease-out", indicatorClassName)}
        style={{ width: `${safe}%` }}
      />
    </div>
  );
}
