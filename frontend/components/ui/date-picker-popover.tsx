"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject
} from "react";
import { createPortal } from "react-dom";

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function localYmd(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function parseYmd(s: string): Date | null {
  const t = s?.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return null;
  const [y, m, day] = t.split("-").map(Number);
  const d = new Date(y, m - 1, day);
  if (d.getFullYear() !== y || d.getMonth() !== m - 1 || d.getDate() !== day) return null;
  return d;
}

export function formatRuDateButton(iso: string): string {
  const d = parseYmd(iso);
  if (!d) return "";
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
}

const RU_WD = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"];

function daysMatrix(year: number, month: number): (number | null)[][] {
  const first = new Date(year, month, 1);
  let start = first.getDay() - 1;
  if (start < 0) start = 6;
  const dim = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < start; i++) cells.push(null);
  for (let d = 1; d <= dim; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  const rows: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
  return rows;
}

function shiftMonthYm(y: number, m0: number, delta: number): { y: number; m: number } {
  const d = new Date(y, m0 + delta, 1);
  return { y: d.getFullYear(), m: d.getMonth() };
}

function SingleMonthPanel({
  selected,
  onSelect,
  onClose
}: {
  selected: string;
  onSelect: (iso: string) => void;
  onClose: () => void;
}) {
  const [view, setView] = useState(() => {
    const d = parseYmd(selected) ?? new Date();
    return { y: d.getFullYear(), m: d.getMonth() };
  });
  useEffect(() => {
    const d = parseYmd(selected);
    if (d) setView({ y: d.getFullYear(), m: d.getMonth() });
  }, [selected]);
  const matrix = useMemo(() => daysMatrix(view.y, view.m), [view.y, view.m]);
  const title = new Date(view.y, view.m, 1).toLocaleDateString("ru-RU", {
    month: "long",
    year: "numeric"
  });
  const todayIso = localYmd(new Date());

  return (
    <div className="w-[17.5rem] max-w-[calc(100vw-2rem)] p-3">
      <div className="mb-3 flex items-center justify-between gap-2">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-8 w-8 shrink-0"
          aria-label="Предыдущий месяц"
          onClick={() => setView((v) => shiftMonthYm(v.y, v.m, -1))}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0 flex-1 truncate text-center text-sm font-semibold capitalize text-foreground">
          {title}
        </div>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-8 w-8 shrink-0"
          aria-label="Следующий месяц"
          onClick={() => setView((v) => shiftMonthYm(v.y, v.m, 1))}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
      <div className="grid grid-cols-7 gap-y-1 text-center text-xs">
        {RU_WD.map((w) => (
          <div key={w} className="py-1.5 font-medium text-muted-foreground">
            {w}
          </div>
        ))}
        {matrix.flatMap((row, ri) =>
          row.map((day, ci) => {
            if (day == null) {
              return <div key={`e-${ri}-${ci}`} className="h-9" />;
            }
            const iso = `${view.y}-${pad2(view.m + 1)}-${pad2(day)}`;
            const isSel = selected === iso;
            const isToday = todayIso === iso;
            return (
              <button
                key={iso}
                type="button"
                onClick={() => {
                  onSelect(iso);
                  onClose();
                }}
                className={cn(
                  "mx-auto flex h-9 w-9 items-center justify-center rounded-full text-sm font-medium transition-colors",
                  isSel &&
                    "bg-blue-600 text-white shadow-sm hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-600",
                  !isSel && isToday && "ring-1 ring-blue-400/70 ring-offset-1 ring-offset-background",
                  !isSel && !isToday && "text-foreground hover:bg-muted"
                )}
              >
                {day}
              </button>
            );
          })
        )}
      </div>
      <div className="mt-3 flex justify-end gap-2 border-t border-border/60 pt-3">
        <Button type="button" variant="ghost" size="sm" className="h-8 text-xs" onClick={onClose}>
          Закрыть
        </Button>
      </div>
    </div>
  );
}

export type DatePickerPopoverProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  anchorRef: RefObject<HTMLElement | null>;
  value: string;
  onChange: (isoYmd: string) => void;
};

export function DatePickerPopover({ open, onOpenChange, anchorRef, value, onChange }: DatePickerPopoverProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ top: 0, left: 0 });

  const reposition = useCallback(() => {
    if (!open) return;
    const el = anchorRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const measured = panelRef.current?.getBoundingClientRect().width ?? 280;
    const panelW = Math.min(measured, vw - 16);
    let left = r.left;
    if (left + panelW > vw - 8) left = Math.max(8, vw - 8 - panelW);
    if (left < 8) left = 8;
    let top = r.bottom + 6;
    const estH = 340;
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

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={panelRef}
      className="fixed z-[100] rounded-xl border border-border/80 bg-popover text-popover-foreground shadow-xl ring-1 ring-black/5 dark:ring-white/10"
      style={{ top: box.top, left: box.left }}
    >
      <SingleMonthPanel
        key={value || "empty"}
        selected={value}
        onSelect={onChange}
        onClose={() => onOpenChange(false)}
      />
    </div>,
    document.body
  );
}
