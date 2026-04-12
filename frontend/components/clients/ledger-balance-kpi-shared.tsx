"use client";

import { Card, CardContent } from "@/components/ui/card";
import type { AgentBalanceCard } from "@/lib/client-balance-ledger-types";
import { formatNumberGrouped } from "@/lib/format-numbers";
import { cn } from "@/lib/utils";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from "react";

export const LEDGER_KPI_AMOUNT_FMT = { minFractionDigits: 0, maxFractionDigits: 0 } as const;

export const LEDGER_KPI_LANE_CLASS = "flex w-[11.5rem] shrink-0 flex-col self-stretch sm:w-[12.5rem]";

const KPI_TRIPLE_LABELS = ["Naqd", "Perechis", "Terminal"] as const;

const kpiTitleClass =
  "line-clamp-2 min-w-0 break-words text-[9px] font-semibold uppercase leading-tight tracking-wide text-muted-foreground";

export function parseLedgerKpiAmount(s: string): number {
  const t = String(s)
    .trim()
    .replace(/\u00a0/g, "")
    .replace(/\s/g, "")
    .replace(/\u2212/g, "-")
    .replace(/−/g, "-")
    .replace(/,/g, ".");
  const n = Number.parseFloat(t);
  return Number.isFinite(n) ? n : 0;
}

function normalizeKpiTriple(rows: { label: string; amount: string }[]): { label: string; amount: string }[] {
  const nrm = (l: string) => l.trim().toLowerCase().replace(/\s+/g, " ");
  const sum = [0, 0, 0];
  for (const r of rows) {
    const t = nrm(r.label);
    const v = parseLedgerKpiAmount(r.amount);
    let idx: number | null = null;
    if (t.includes("terminal") || t.includes("plastik") || t.includes("plastic") || t.includes("пласт") || t.includes("карт")) {
      idx = 2;
    } else if (
      t.includes("perechis") ||
      t.includes("перечис") ||
      (t.includes("bank") && !t.includes("plast")) ||
      t.includes("transfer")
    ) {
      idx = 1;
    } else if (t.includes("naqd") || t.includes("налич") || t.includes("cash") || t.includes("нақд")) {
      idx = 0;
    }
    if (idx != null) sum[idx] += v;
  }
  return KPI_TRIPLE_LABELS.map((label, i) => ({ label, amount: String(sum[i]) }));
}

function balanceRibbonBg(n: number): string {
  return n < 0 ? "bg-destructive" : "bg-primary";
}

/** Kartochka foni: ≥0 — yashil ohang, <0 — qizil. */
function balanceCardSurfaceClass(n: number): string {
  return n < 0 ? "bg-red-500/[0.07] dark:bg-red-950/30" : "bg-emerald-500/[0.08] dark:bg-emerald-950/25";
}

/** Tema: musbat — yashil (primary), manfiy — qizil. */
function balanceMainTextClass(n: number): string {
  return n < 0 ? "text-destructive" : "text-emerald-700 dark:text-emerald-400";
}

function sublineAmountClass(v: number): string {
  if (v < 0) return "text-destructive";
  if (v > 0) return "text-emerald-700 dark:text-emerald-400";
  return "text-muted-foreground";
}

export function CompactBalanceKpiCard({
  title,
  mainAmountStr,
  paymentByType
}: {
  title: string;
  mainAmountStr: string;
  paymentByType: AgentBalanceCard["payment_by_type"];
}) {
  const n = parseLedgerKpiAmount(mainAmountStr);
  const borderCls = n < 0 ? "border-t-destructive" : "border-t-primary";
  const sublinesResolved = normalizeKpiTriple(paymentByType.map((pt) => ({ label: pt.label, amount: pt.amount })));

  return (
    <Card
      className={cn(
        "flex h-full min-h-0 w-full flex-col rounded-lg border border-border text-card-foreground shadow-sm",
        balanceCardSurfaceClass(n),
        "border-t-4",
        borderCls
      )}
    >
      <CardContent className="relative flex min-h-0 flex-1 flex-col p-2 sm:p-2.5">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-0.5">
          <p className={kpiTitleClass}>{title}</p>
          <p
            className={cn(
              "line-clamp-2 max-w-full shrink-0 break-words text-left text-[12px] font-semibold tabular-nums leading-tight sm:text-[13px]",
              balanceMainTextClass(n)
            )}
            title={`${formatNumberGrouped(n, LEDGER_KPI_AMOUNT_FMT)} So'm`}
          >
            {formatNumberGrouped(n, LEDGER_KPI_AMOUNT_FMT)} So&apos;m
          </p>
          <div className={cn("mt-0.5 h-0.5 w-full shrink-0 rounded-full", balanceRibbonBg(n))} role="presentation" aria-hidden />
          <div className="shrink-0 space-y-px pt-1 text-[9px] leading-tight sm:text-[10px]">
            {sublinesResolved.map((s) => {
              const sn = parseLedgerKpiAmount(s.amount);
              return (
                <div key={s.label} className="flex items-baseline justify-between gap-1.5">
                  <span className="min-w-0 shrink truncate text-muted-foreground" title={s.label}>
                    {s.label}
                  </span>
                  <span
                    className={cn("shrink-0 text-right tabular-nums font-medium", sublineAmountClass(sn))}
                    title={`${formatNumberGrouped(sn, LEDGER_KPI_AMOUNT_FMT)} So'm`}
                  >
                    {formatNumberGrouped(sn, LEDGER_KPI_AMOUNT_FMT)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function LedgerKpiCheckbox({ checked, tone = "teal" }: { checked: boolean; tone?: "teal" | "red" }) {
  return (
    <span
      className={cn(
        "mt-0.5 flex size-[13px] shrink-0 items-center justify-center rounded border border-border bg-card shadow-sm",
        checked &&
          (tone === "red"
            ? "border-destructive bg-destructive text-white"
            : "border-primary bg-primary text-primary-foreground")
      )}
      aria-hidden
    >
      {checked ? <Check className="size-2.5" strokeWidth={3} /> : null}
    </span>
  );
}

/** Те же размеры, что «Общий» в шапке клиента; клик и чекбокс фильтруют таблицу. */
export function SelectableCompactBalanceKpiCard({
  title,
  mainAmountStr,
  paymentByType,
  checked,
  selectedTone = "teal",
  onToggle
}: {
  title: string;
  mainAmountStr: string;
  paymentByType: AgentBalanceCard["payment_by_type"];
  checked: boolean;
  selectedTone?: "teal" | "red";
  onToggle: () => void;
}) {
  const n = parseLedgerKpiAmount(mainAmountStr);
  const isNegative = n < 0;
  const borderCls = isNegative ? "border-t-destructive" : "border-t-primary";
  const sublinesResolved = normalizeKpiTriple(paymentByType.map((pt) => ({ label: pt.label, amount: pt.amount })));
  const checkboxTone = isNegative ? "red" : "teal";

  const card = (
    <Card
      className={cn(
        "flex h-full min-h-0 w-full flex-col rounded-lg border border-border text-card-foreground shadow-sm",
        balanceCardSurfaceClass(n),
        "border-t-4",
        borderCls,
        checked && selectedTone === "red" && "ring-2 ring-destructive/35 ring-offset-1 ring-offset-background",
        checked && selectedTone !== "red" && "ring-2 ring-emerald-600/35 ring-offset-1 ring-offset-background"
      )}
    >
      <CardContent className="relative flex min-h-0 flex-1 flex-col p-2 pr-2.5 sm:p-2.5 sm:pr-3">
        <div className="flex min-h-0 flex-1 gap-1.5">
          <LedgerKpiCheckbox checked={checked} tone={checkboxTone} />
          <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-0.5">
            <p className={kpiTitleClass}>{title}</p>
            <p
              className={cn(
                "line-clamp-2 max-w-full shrink-0 break-words text-left text-[12px] font-semibold tabular-nums leading-tight sm:text-[13px]",
                balanceMainTextClass(n)
              )}
            >
              {formatNumberGrouped(n, LEDGER_KPI_AMOUNT_FMT)} So&apos;m
            </p>
            <div className={cn("mt-0.5 h-0.5 w-full shrink-0 rounded-full", balanceRibbonBg(n))} aria-hidden />
            <div className="shrink-0 space-y-px pt-1 text-[9px] leading-tight sm:text-[10px]">
              {sublinesResolved.map((s) => {
                const sn = parseLedgerKpiAmount(s.amount);
                return (
                  <div key={s.label} className="flex items-baseline justify-between gap-1.5">
                    <span className="min-w-0 shrink truncate text-muted-foreground">{s.label}</span>
                    <span className={cn("shrink-0 text-right tabular-nums font-medium", sublineAmountClass(sn))}>
                      {formatNumberGrouped(sn, LEDGER_KPI_AMOUNT_FMT)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div
      role="button"
      tabIndex={0}
      className="block h-full min-h-0 w-full cursor-pointer rounded-lg text-left outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
      onClick={onToggle}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onToggle();
        }
      }}
    >
      {card}
    </div>
  );
}

export function StripScrollChevron({
  dir,
  disabled,
  onClick,
  label
}: {
  dir: "left" | "right";
  disabled: boolean;
  onClick: () => void;
  label: string;
}) {
  const Icon = dir === "left" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-full text-foreground/75 transition-colors",
        "hover:bg-accent hover:text-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        "disabled:pointer-events-none disabled:opacity-25",
        "active:scale-95"
      )}
    >
      <Icon className="size-[18px] stroke-[2.85]" aria-hidden strokeLinecap="round" strokeLinejoin="round" />
    </button>
  );
}

export function BalanceKpiScrollRow({ children, layoutSignature }: { children: ReactNode; layoutSignature: string }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  const updateScrollHints = useCallback(() => {
    const el = scrollRef.current;
    if (!el) {
      setCanLeft(false);
      setCanRight(false);
      return;
    }
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setCanLeft(scrollLeft > 2);
    setCanRight(scrollLeft + clientWidth < scrollWidth - 2);
  }, []);

  useLayoutEffect(() => {
    updateScrollHints();
    const el = scrollRef.current;
    if (!el) return;
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => updateScrollHints()) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, [updateScrollHints, layoutSignature]);

  const scrollByDir = (dir: -1 | 1) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.max(220, Math.floor(el.clientWidth * 0.85)), behavior: "smooth" });
    window.setTimeout(updateScrollHints, 320);
  };

  return (
    <div className="flex items-center gap-1">
      <StripScrollChevron dir="left" disabled={!canLeft} label="Прокрутить влево" onClick={() => scrollByDir(-1)} />
      <div
        ref={scrollRef}
        onScroll={updateScrollHints}
        className="flex min-h-[7.5rem] min-w-0 flex-1 flex-nowrap items-stretch gap-1.5 overflow-x-auto overflow-y-hidden py-0.5 [scrollbar-width:thin]"
      >
        {children}
      </div>
      <StripScrollChevron dir="right" disabled={!canRight} label="Прокрутить вправо" onClick={() => scrollByDir(1)} />
    </div>
  );
}
