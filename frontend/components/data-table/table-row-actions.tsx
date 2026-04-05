"use client";

import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

/** 2 ta ikon tugma (masalan tahrir + kartochka) — sticky o‘ng ustun */
export const dataTableStickyActionsTh2 =
  "sticky right-0 z-20 w-[6.25rem] min-w-[6.25rem] bg-muted/95 text-center shadow-[inset_1px_0_0_hsl(var(--border))]";

export const dataTableStickyActionsTd2 =
  "sticky right-0 z-20 w-[6.25rem] min-w-[6.25rem] border-l border-border/80 bg-background shadow-[2px_0_8px_-4px_rgba(0,0,0,0.08)]";

/** 3 ta ikon (masalan tahrir + o‘chirish + yana biri) */
export const dataTableStickyActionsTh3 =
  "sticky right-0 z-10 w-[6.75rem] min-w-[6.75rem] bg-muted/95 text-center shadow-[inset_1px_0_0_hsl(var(--border))]";

export const dataTableStickyActionsTd3 =
  "sticky right-0 z-10 w-[6.75rem] min-w-[6.75rem] bg-background shadow-[inset_1px_0_0_hsl(var(--border))]";

/** Bitta «ko‘rish / tafsilot» ikonkasi */
export const dataTableActionsThSingle =
  "w-11 min-w-[2.75rem] px-2 py-2 text-center font-medium";

export const dataTableActionsTdSingle = "w-11 min-w-[2.75rem] px-2 py-2";

/** Gorizontal scroll ichida o‘ngda qotirilgan bitta amal ustuni */
export const dataTableStickyActionsThSingle =
  "sticky right-0 z-20 w-11 min-w-[2.75rem] bg-muted/95 px-2 py-2 text-center font-medium shadow-[inset_1px_0_0_hsl(var(--border))]";

export const dataTableStickyActionsTdSingle =
  "sticky right-0 z-20 w-11 min-w-[2.75rem] border-l border-border/80 bg-background px-2 py-2 shadow-[2px_0_8px_-4px_rgba(0,0,0,0.08)]";

/**
 * Jadval qatoridagi ixcham amallar guruhi (ikon tugmalar).
 * `justify-center` — tor sticky ustunlar; odatda o‘ng tomonda bo‘lsa `justify-end` bering.
 */
export function TableRowActionGroup({
  children,
  className,
  ariaLabel = "Amallar"
}: {
  children: ReactNode;
  className?: string;
  /** Masalan: "Amallar" / "Harakatlar" */
  ariaLabel?: string;
}) {
  return (
    <div
      className={cn("flex items-center justify-center gap-0.5", className)}
      role="group"
      aria-label={ariaLabel}
    >
      {children}
    </div>
  );
}
