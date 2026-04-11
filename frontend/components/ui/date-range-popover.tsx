"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

/** Mahalliy sana YYYY-MM-DD */
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

function formatDisplayRu(from: string, to: string): string {
  const a = parseYmd(from);
  const b = parseYmd(to);
  if (!a || !b) return `${from} — ${to}`;
  const fmt = (d: Date) =>
    d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
  return `${fmt(a)} — ${fmt(b)}`;
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

function ymIndex(y: number, m: number): number {
  return y * 12 + m;
}

function MonthCalendar({
  year,
  month,
  rangeFrom,
  rangeTo,
  onPick,
  onShiftMonth
}: {
  year: number;
  month: number;
  rangeFrom: string;
  rangeTo: string;
  onPick: (iso: string) => void;
  onShiftMonth: (delta: number) => void;
}) {
  const title = new Date(year, month, 1).toLocaleDateString("ru-RU", {
    month: "short",
    year: "numeric"
  });
  const matrix = useMemo(() => daysMatrix(year, month), [year, month]);

  const inRange = (day: number) => {
    const iso = `${year}-${pad2(month + 1)}-${pad2(day)}`;
    if (!rangeFrom || !rangeTo) return false;
    return iso >= rangeFrom && iso <= rangeTo;
  };

  return (
    <div className="w-[12rem] shrink-0 sm:w-[12.25rem]">
      <div className="mb-0.5 flex items-center justify-between gap-0.5">
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          className="h-6 w-6 shrink-0"
          aria-label="Предыдущий месяц"
          onClick={() => onShiftMonth(-1)}
        >
          <ChevronLeft className="h-3 w-3" />
        </Button>
        <div className="min-w-0 flex-1 truncate px-0.5 text-center text-[0.7rem] font-medium capitalize text-foreground">
          {title}
        </div>
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          className="h-6 w-6 shrink-0"
          aria-label="Следующий месяц"
          onClick={() => onShiftMonth(1)}
        >
          <ChevronRight className="h-3 w-3" />
        </Button>
      </div>
      <div className="grid grid-cols-7 gap-px text-[0.6rem] text-muted-foreground">
        {RU_WD.map((w) => (
          <div key={w} className="py-0.5 text-center font-medium">
            {w}
          </div>
        ))}
        {matrix.flatMap((row, ri) =>
          row.map((day, ci) => {
            if (day == null) {
              return <div key={`e-${ri}-${ci}`} className="h-6" />;
            }
            const iso = `${year}-${pad2(month + 1)}-${pad2(day)}`;
            const hit = inRange(day);
            return (
              <button
                key={iso}
                type="button"
                onClick={() => onPick(iso)}
                className={cn(
                  "flex h-6 items-center justify-center rounded-sm text-[0.65rem] transition-colors",
                  hit && "bg-primary font-medium text-primary-foreground hover:bg-primary/90",
                  !hit && "hover:bg-muted"
                )}
              >
                {day}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
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

function monthBoundsFromYm(y: number, m0: number): { from: string; to: string } {
  const from = `${y}-${pad2(m0 + 1)}-01`;
  const lastDay = new Date(y, m0 + 1, 0).getDate();
  const to = `${y}-${pad2(m0 + 1)}-${pad2(lastDay)}`;
  return { from, to };
}

function MonthYearGrid({
  year,
  onYearChange,
  df,
  dt,
  monthRangeAnchor,
  onPickMonth
}: {
  year: number;
  onYearChange: (y: number) => void;
  df: string;
  dt: string;
  monthRangeAnchor: { y: number; m: number } | null;
  onPickMonth: (monthIndex0: number) => void;
}) {
  const bounds = useMemo(() => {
    const a = parseYmd(df);
    const b = parseYmd(dt);
    if (!a || !b || df > dt) return null;
    return {
      from: { y: a.getFullYear(), m: a.getMonth() },
      to: { y: b.getFullYear(), m: b.getMonth() }
    };
  }, [df, dt]);

  return (
    <div className="w-max max-w-[15.5rem]">
      <div className="mb-1.5 flex items-center justify-between gap-1 px-0.5">
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          className="h-7 w-7 shrink-0"
          aria-label="Предыдущий год"
          onClick={() => onYearChange(year - 1)}
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </Button>
        <span className="min-w-[3.5rem] text-center text-xs font-semibold tabular-nums text-foreground">{year}</span>
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          className="h-7 w-7 shrink-0"
          aria-label="Следующий год"
          onClick={() => onYearChange(year + 1)}
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="grid grid-cols-3 gap-1">
        {RU_MONTH_GRID.map((label, i) => {
          const ri = ymIndex(year, i);
          let inRange = false;
          if (bounds) {
            const r0 = ymIndex(bounds.from.y, bounds.from.m);
            const r1 = ymIndex(bounds.to.y, bounds.to.m);
            inRange = ri >= r0 && ri <= r1;
          }
          const isPending =
            monthRangeAnchor != null && monthRangeAnchor.y === year && monthRangeAnchor.m === i;

          return (
            <button
              key={label}
              type="button"
              onClick={() => onPickMonth(i)}
              className={cn(
                "rounded-md border px-1 py-2 text-center text-[0.65rem] font-medium leading-tight transition-colors",
                isPending &&
                  "border-primary bg-primary text-primary-foreground ring-2 ring-primary/40 ring-offset-1 ring-offset-background hover:bg-primary/90",
                !isPending && inRange && "border-primary bg-primary text-primary-foreground hover:bg-primary/90",
                !isPending && !inRange && "border-border/60 bg-background text-foreground hover:bg-muted"
              )}
            >
              {label}
            </button>
          );
        })}
      </div>
      <p className="mt-1.5 text-[0.6rem] leading-snug text-muted-foreground">
        Два клика — диапазон месяцев (от и до включительно).
      </p>
    </div>
  );
}

function buildPresets(): { label: string; from: string; to: string }[] {
  const today = new Date();
  const y = (d: Date) => localYmd(d);

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const last7to = new Date(today);
  const last7from = new Date(today);
  last7from.setDate(last7from.getDate() - 6);

  const last30to = new Date(today);
  const last30from = new Date(today);
  last30from.setDate(last30from.getDate() - 29);

  const thisMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const thisMonthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);

  const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);

  return [
    { label: "Сегодня", from: y(today), to: y(today) },
    { label: "Вчера", from: y(yesterday), to: y(yesterday) },
    { label: "Последние 7 дней", from: y(last7from), to: y(last7to) },
    { label: "Последние 30 дней", from: y(last30from), to: y(last30to) },
    { label: "Этот месяц", from: y(thisMonthStart), to: y(thisMonthEnd) },
    { label: "Прошлый месяц", from: y(lastMonthStart), to: y(lastMonthEnd) }
  ];
}

/** Standart tugma / filter matni (ru-RU) */
export function formatDateRangeButton(from: string, to: string): string {
  return formatDisplayRu(from, to);
}

type PanelProps = {
  dateFrom: string;
  dateTo: string;
  onApply: (next: { dateFrom: string; dateTo: string }) => void;
  onClose: () => void;
};

function DateRangePanel({ dateFrom, dateTo, onApply, onClose }: PanelProps) {
  const [df, setDf] = useState(dateFrom);
  const [dt, setDt] = useState(dateTo);
  const [dayAnchor, setDayAnchor] = useState<string | null>(null);
  const [viewLeft, setViewLeft] = useState(() => {
    const p = parseYmd(dateFrom) ?? new Date();
    return { y: p.getFullYear(), m: p.getMonth() };
  });
  const [viewRight, setViewRight] = useState(() => {
    const f = parseYmd(dateFrom) ?? new Date();
    const t = parseYmd(dateTo) ?? new Date();
    if (f.getFullYear() === t.getFullYear() && f.getMonth() === t.getMonth()) {
      return shiftMonthYm(f.getFullYear(), f.getMonth(), 1);
    }
    return { y: t.getFullYear(), m: t.getMonth() };
  });
  const [panelMode, setPanelMode] = useState<"days" | "months">("days");
  const [pickYear, setPickYear] = useState(() => new Date().getFullYear());
  const [monthRangeAnchor, setMonthRangeAnchor] = useState<{ y: number; m: number } | null>(null);

  useEffect(() => {
    setDf(dateFrom);
    setDt(dateTo);
    setDayAnchor(null);
    setMonthRangeAnchor(null);
    setPanelMode("days");
    const f = parseYmd(dateFrom) ?? new Date();
    const t = parseYmd(dateTo) ?? new Date();
    setViewLeft({ y: f.getFullYear(), m: f.getMonth() });
    if (f.getFullYear() === t.getFullYear() && f.getMonth() === t.getMonth()) {
      setViewRight(shiftMonthYm(f.getFullYear(), f.getMonth(), 1));
    } else {
      setViewRight({ y: t.getFullYear(), m: t.getMonth() });
    }
    setPickYear(f.getFullYear());
  }, [dateFrom, dateTo]);

  const syncViewsFromRange = useCallback((from: string, to: string) => {
    const a = parseYmd(from) ?? new Date();
    const b = parseYmd(to) ?? new Date();
    setViewLeft({ y: a.getFullYear(), m: a.getMonth() });
    if (a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()) {
      setViewRight(shiftMonthYm(a.getFullYear(), a.getMonth(), 1));
    } else {
      setViewRight({ y: b.getFullYear(), m: b.getMonth() });
    }
  }, []);

  const pickDay = useCallback(
    (iso: string) => {
      if (!dayAnchor) {
        setDayAnchor(iso);
        setDf(iso);
        setDt(iso);
        return;
      }
      const a = dayAnchor < iso ? dayAnchor : iso;
      const b = dayAnchor < iso ? iso : dayAnchor;
      setDf(a);
      setDt(b);
      setDayAnchor(null);
    },
    [dayAnchor]
  );

  const handleMonthPick = useCallback(
    (monthIndex0: number) => {
      const y = pickYear;
      if (!monthRangeAnchor) {
        setMonthRangeAnchor({ y, m: monthIndex0 });
        const { from, to } = monthBoundsFromYm(y, monthIndex0);
        setDf(from);
        setDt(to);
        return;
      }
      const i1 = ymIndex(monthRangeAnchor.y, monthRangeAnchor.m);
      const i2 = ymIndex(y, monthIndex0);
      const fromYm = i1 <= i2 ? monthRangeAnchor : { y, m: monthIndex0 };
      const toYm = i1 <= i2 ? { y, m: monthIndex0 } : monthRangeAnchor;
      const fromStr = `${fromYm.y}-${pad2(fromYm.m + 1)}-01`;
      const lastD = new Date(toYm.y, toYm.m + 1, 0).getDate();
      const toStr = `${toYm.y}-${pad2(toYm.m + 1)}-${pad2(lastD)}`;
      setDf(fromStr);
      setDt(toStr);
      setMonthRangeAnchor(null);
      syncViewsFromRange(fromStr, toStr);
    },
    [pickYear, monthRangeAnchor, syncViewsFromRange]
  );

  const presets = useMemo(() => buildPresets(), []);

  return (
    <div
      className={cn(
        "flex min-w-0 flex-col",
        "w-max max-w-[min(628px,calc(100vw-1rem))]",
        panelMode === "days" && "min-w-[min(100%,38rem)]"
      )}
    >
      <div
        className={cn(
          "flex flex-col sm:flex-row",
          panelMode === "days" ? "sm:items-stretch" : "sm:items-start sm:justify-start"
        )}
      >
        <div
          className={cn(
            "space-y-2 border-border/50 p-2 sm:border-r",
            panelMode === "days"
              ? "min-w-0 flex-1 sm:min-w-[min(100%,25.5rem)] sm:pr-2.5"
              : "w-max max-w-full shrink-0 sm:pr-2"
          )}
        >
          <p className="border-b border-border/40 pb-1.5 text-xs font-medium text-foreground">Период</p>

          {panelMode === "days" ? (
            <>
              <div className="flex flex-wrap items-center gap-1.5 text-[0.65rem]">
                <span className="text-muted-foreground">Вручную:</span>
                <Input
                  type="date"
                  className="h-7 w-[8.75rem] text-[0.65rem]"
                  value={df}
                  onChange={(e) => setDf(e.target.value)}
                />
                <span className="text-muted-foreground">—</span>
                <Input
                  type="date"
                  className="h-7 w-[8.75rem] text-[0.65rem]"
                  value={dt}
                  onChange={(e) => setDt(e.target.value)}
                />
              </div>

              <div className="flex flex-row flex-nowrap items-start justify-center gap-2 overflow-x-auto pb-0.5 [scrollbar-gutter:stable]">
                <MonthCalendar
                  year={viewLeft.y}
                  month={viewLeft.m}
                  rangeFrom={df}
                  rangeTo={dt}
                  onPick={pickDay}
                  onShiftMonth={(delta) => setViewLeft((v) => shiftMonthYm(v.y, v.m, delta))}
                />
                <MonthCalendar
                  year={viewRight.y}
                  month={viewRight.m}
                  rangeFrom={df}
                  rangeTo={dt}
                  onPick={pickDay}
                  onShiftMonth={(delta) => setViewRight((v) => shiftMonthYm(v.y, v.m, delta))}
                />
              </div>
              <p className="text-[0.6rem] leading-snug text-muted-foreground">
                Два клика — интервал (в одном или двух календарях); весь диапазон одним цветом.
              </p>
            </>
          ) : (
            <MonthYearGrid
              year={pickYear}
              onYearChange={setPickYear}
              df={df}
              dt={dt}
              monthRangeAnchor={monthRangeAnchor}
              onPickMonth={handleMonthPick}
            />
          )}
        </div>

        <div
          className={cn(
            "w-full shrink-0 border-t border-border/50 px-2 pb-2 pt-2 sm:border-t-0 sm:border-l sm:pl-2 sm:pt-2",
            panelMode === "days" ? "sm:w-[11.25rem]" : "sm:w-[10rem]"
          )}
        >
          <p className="mb-1 text-[0.65rem] font-medium text-muted-foreground">Быстрый выбор</p>
          <div className="flex flex-col gap-px">
            {presets.map((p) => (
              <button
                key={p.label}
                type="button"
                className="rounded px-1.5 py-1 text-left text-[0.65rem] text-foreground hover:bg-muted"
                onClick={() => {
                  setDf(p.from);
                  setDt(p.to);
                  setDayAnchor(null);
                  setMonthRangeAnchor(null);
                  setPanelMode("days");
                  syncViewsFromRange(p.from, p.to);
                }}
              >
                {p.label}
              </button>
            ))}
            <button
              type="button"
              className={cn(
                "rounded px-1.5 py-1 text-left text-[0.65rem] transition-colors",
                panelMode === "months" ? "bg-primary/15 font-medium text-primary" : "text-foreground hover:bg-muted"
              )}
              onClick={() => {
                setPanelMode("months");
                setMonthRangeAnchor(null);
                const f = parseYmd(df) ?? new Date();
                setPickYear(f.getFullYear());
              }}
            >
              Выбрать месяц
            </button>
            <button
              type="button"
              className={cn(
                "rounded px-1.5 py-1 text-left text-[0.65rem] transition-colors",
                panelMode === "days" ? "bg-primary/15 font-medium text-primary" : "text-foreground hover:bg-muted"
              )}
              onClick={() => {
                setPanelMode("days");
                setMonthRangeAnchor(null);
              }}
            >
              Выбрать дату
            </button>
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-2 border-t border-border/50 bg-muted/30 px-2.5 py-2">
        <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={onClose}>
          Отмена
        </Button>
        <Button
          type="button"
          size="sm"
          className="h-7 text-xs"
          onClick={() => {
            onApply({ dateFrom: df, dateTo: dt });
            onClose();
          }}
        >
          Применить
        </Button>
      </div>
    </div>
  );
}

export type DateRangePopoverProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  anchorRef: RefObject<HTMLElement | null>;
  dateFrom: string;
  dateTo: string;
  onApply: (next: { dateFrom: string; dateTo: string }) => void;
};

export function DateRangePopover({
  open,
  onOpenChange,
  anchorRef,
  dateFrom,
  dateTo,
  onApply
}: DateRangePopoverProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ top: 0, left: 0 });

  const reposition = useCallback(() => {
    if (!open) return;
    const el = anchorRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const measured = panelRef.current?.getBoundingClientRect().width ?? 0;
    const panelW = measured > 48 ? measured : Math.min(628, vw - 16);
    let left = r.right - panelW;
    if (left < 8) left = 8;
    if (left + panelW > vw - 8) left = Math.max(8, vw - 8 - panelW);
    let top = r.bottom + 6;
    const maxH = Math.max(180, vh - top - 10);
    if (top + maxH > vh - 8) {
      top = Math.max(8, r.top - 8 - Math.min(maxH, vh * 0.85));
    }
    setBox({ top, left });
  }, [open, anchorRef]);

  useLayoutEffect(() => {
    if (!open) return;
    reposition();
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => reposition());
    });
    return () => cancelAnimationFrame(id);
  }, [open, reposition, dateFrom, dateTo]);

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
      className="fixed z-[100] w-max max-w-[min(628px,calc(100vw-1rem))] max-h-[min(85vh,calc(100vh-1rem))] overflow-y-auto overflow-x-auto rounded-lg border border-border/80 bg-popover text-popover-foreground shadow-lg ring-1 ring-black/5"
      style={{
        top: box.top,
        left: box.left
      }}
    >
      <DateRangePanel
        key={`${dateFrom}|${dateTo}`}
        dateFrom={dateFrom}
        dateTo={dateTo}
        onApply={onApply}
        onClose={() => onOpenChange(false)}
      />
    </div>,
    document.body
  );
}
