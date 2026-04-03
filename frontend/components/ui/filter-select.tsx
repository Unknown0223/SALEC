"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/** Jadval ustidagi filtrlash `<select>`lari uchun bir xil balandlik va minimal kenglik */
export const filterSelectClassName =
  "h-9 min-w-[12rem] max-w-[18rem] w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm text-foreground shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

/** Keng filtr panellari (masalan, mijozlar qatori) */
export const filterPanelSelectClassName =
  "h-10 min-w-[12rem] max-w-[20rem] w-full rounded-lg border border-input bg-background px-2 text-sm text-foreground shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

export type FilterSelectProps = React.ComponentPropsWithoutRef<"select"> & {
  /** Bo‘sh qiymatda tanlangan ko‘rinishdagi matn (odatda filter nomi) */
  emptyLabel: string;
  children?: React.ReactNode;
};

/**
 * Birinchi `<option value="">` bo‘sh qiymatni `emptyLabel` bilan ko‘rsatadi
 * (oddiy `—` o‘rniga filter nomi ko‘rinadi).
 */
export const FilterSelect = React.forwardRef<HTMLSelectElement, FilterSelectProps>(
  ({ emptyLabel, className, children, ...props }, ref) => (
    <select ref={ref} className={cn(filterSelectClassName, className)} {...props}>
      <option value="">{emptyLabel}</option>
      {children}
    </select>
  )
);
FilterSelect.displayName = "FilterSelect";
