"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

const RU_MONTH_GRID = [
  "Янв.",
  "Февр.",
  "Март",
  "Апр.",
  "Май",
  "Июнь",
  "Июль",
  "Авг.",
  "Сент.",
  "Окт.",
  "Нояб.",
  "Дек."
] as const;

function ymIndex(y: number, m: number): number {
  return y * 12 + m;
}

export function parseYearMonthYm(s: string): { y: number; m: number } | null {
  const t = s?.trim();
  if (!/^\d{4}-\d{2}$/.test(t)) return null;
  const [ys, ms] = t.split("-");
  const y = Number(ys);
  const m = Number(ms) - 1;
  if (!Number.isFinite(y) || !Number.isFinite(m) || y < 1990 || y > 2100 || m < 0 || m > 11) {
    return null;
  }
  return { y, m };
}

export function toYearMonthString(y: number, m0: number): string {
  return `${y}-${pad2(m0 + 1)}`;
}

function SingleMonthYearPickPanel({
  valueYm,
  onSelectYm,
  onPickCurrentMonth,
  onClose
}: {
  valueYm: string;
  onSelectYm: (ym: string) => void;
  onPickCurrentMonth: () => void;
  onClose: () => void;
}) {
  const parsed = parseYearMonthYm(valueYm);
  const initial = parsed ?? { y: new Date().getFullYear(), m: new Date().getMonth() };
  const [pickYear, setPickYear] = useState(initial.y);

  useEffect(() => {
    const p = parseYearMonthYm(valueYm);
    if (p) setPickYear(p.y);
  }, [valueYm]);

  const selected = parseYearMonthYm(valueYm);
  const selIdx = selected != null ? ymIndex(selected.y, selected.m) : null;

  return (
    <div className="w-max max-w-[15.5rem] p-3">
      <div className="mb-2 flex items-center justify-between gap-1 px-0.5">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-8 w-8 shrink-0"
          aria-label="Предыдущий год"
          onClick={() => setPickYear((y) => y - 1)}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="min-w-[3.5rem] text-center text-sm font-semibold tabular-nums text-foreground">
          {pickYear}
        </span>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-8 w-8 shrink-0"
          aria-label="Следующий год"
          onClick={() => setPickYear((y) => y + 1)}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
      <div className="grid grid-cols-3 gap-1">
        {RU_MONTH_GRID.map((label, i) => {
          const idx = ymIndex(pickYear, i);
          const isSel = selIdx === idx;
          return (
            <button
              key={label}
              type="button"
              onClick={() => {
                onSelectYm(toYearMonthString(pickYear, i));
                onClose();
              }}
              className={cn(
                "rounded-md border px-1 py-2.5 text-center text-[0.7rem] font-medium leading-tight transition-colors",
                isSel &&
                  "border-primary bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 dark:hover:bg-primary/90",
                !isSel && "border-border/60 bg-background text-foreground hover:bg-muted"
              )}
            >
              {label}
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3">
        <Button type="button" variant="ghost" size="sm" className="h-8 text-xs" onClick={onPickCurrentMonth}>
          Текущий месяц
        </Button>
        <Button type="button" variant="ghost" size="sm" className="h-8 text-xs" onClick={onClose}>
          Закрыть
        </Button>
      </div>
    </div>
  );
}

export type MonthYearPickerPopoverProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  anchorRef: RefObject<HTMLElement | null>;
  /** `YYYY-MM` */
  value: string;
  onChange: (ym: string) => void;
};

export function MonthYearPickerPopover({
  open,
  onOpenChange,
  anchorRef,
  value,
  onChange
}: MonthYearPickerPopoverProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ top: 0, left: 0 });

  const reposition = useCallback(() => {
    if (!open) return;
    const el = anchorRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const measured = panelRef.current?.getBoundingClientRect().width ?? 260;
    const panelW = Math.min(measured, vw - 16);
    let left = r.left;
    if (left + panelW > vw - 8) left = Math.max(8, vw - 8 - panelW);
    if (left < 8) left = 8;
    let top = r.bottom + 6;
    const estH = 320;
    if (top + estH > vh - 8) {
      top = Math.max(8, r.top - 6 - estH);
    }
    setBox({ top, left });
  }, [open, anchorRef]);

  useLayoutEffect(() => {
    if (!open) return;
    reposition();
    const id = requestAnimationFrame(() => requestAnimationFrame(() => reposition()));
    return () => cancelAnimationFrame(id);
  }, [open, reposition, value]);

  useEffect(() => {
    if (!open) return;
    const onResize = () => reposition();
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
    };
  }, [open, reposition]);

  useEffect(() => {
    if (!open || !panelRef.current) return;
    const ro = new ResizeObserver(() => reposition());
    ro.observe(panelRef.current);
    return () => ro.disconnect();
  }, [open, reposition]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t)) return;
      if (anchorRef.current?.contains(t)) return;
      onOpenChange(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onOpenChange, anchorRef]);

  const pickCurrent = () => {
    const d = new Date();
    onChange(toYearMonthString(d.getFullYear(), d.getMonth()));
    onOpenChange(false);
  };

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={panelRef}
      className="fixed z-[100] rounded-xl border border-border/80 bg-popover text-popover-foreground shadow-xl ring-1 ring-black/5 dark:ring-white/10"
      style={{ top: box.top, left: box.left }}
    >
      <SingleMonthYearPickPanel
        key={value || "empty"}
        valueYm={value}
        onSelectYm={onChange}
        onPickCurrentMonth={pickCurrent}
        onClose={() => onOpenChange(false)}
      />
    </div>,
    document.body
  );
}
