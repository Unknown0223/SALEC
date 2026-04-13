"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  buildPaymentFilterVisibilityMeta,
  clampPaymentFilterVisibilityToTerritoryLevels,
  DEFAULT_PAYMENT_FILTER_VISIBILITY,
  type PaymentFilterVisibility,
  savePaymentFilterVisibility
} from "@/lib/payment-filters-visibility";
import { useEffect, useMemo, useState } from "react";

type TerritoryRow = { key: keyof PaymentFilterVisibility; label: string };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: PaymentFilterVisibility;
  onChange: (next: PaymentFilterVisibility) => void;
  /** Profil/sozlamadagi hudud sarlavhalari — faqat shu qatorlar modalda ko‘rinadi */
  territoryRows: TerritoryRow[];
  territoryLevelCount: number;
};

export function PaymentFiltersVisibilityDialog({
  open,
  onOpenChange,
  value,
  onChange,
  territoryRows,
  territoryLevelCount
}: Props) {
  const [draft, setDraft] = useState<PaymentFilterVisibility>(value);
  const [q, setQ] = useState("");

  const fullMeta = useMemo(() => buildPaymentFilterVisibilityMeta(territoryRows), [territoryRows]);

  useEffect(() => {
    if (open) {
      setDraft(clampPaymentFilterVisibilityToTerritoryLevels(value, territoryLevelCount));
      setQ("");
    }
  }, [open, value, territoryLevelCount]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return fullMeta;
    return fullMeta.filter((x) => x.label.toLowerCase().includes(s));
  }, [q, fullMeta]);

  const setAll = (on: boolean) => {
    setDraft(() => {
      const next = { ...DEFAULT_PAYMENT_FILTER_VISIBILITY };
      (Object.keys(next) as (keyof PaymentFilterVisibility)[]).forEach((k) => {
        next[k] = on;
      });
      return clampPaymentFilterVisibilityToTerritoryLevels(next, territoryLevelCount);
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-h-[min(90vh,560px)] w-full max-w-md flex-col gap-0 overflow-hidden p-0 sm:max-w-md"
        showCloseButton
      >
        <DialogHeader className="shrink-0 border-b border-border/60 px-4 py-3 pr-10 text-left">
          <DialogTitle className="text-base">Видимость фильтров</DialogTitle>
          <DialogDescription className="text-xs">
            Отметьте, какие поля показывать на панели. Сохраняется в браузере.
          </DialogDescription>
        </DialogHeader>

        <div className="shrink-0 space-y-2 px-4 py-2">
          <Input
            className="h-8 text-sm"
            placeholder="Поиск…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="xs" className="text-xs" onClick={() => setAll(true)}>
              Выбрать все
            </Button>
            <Button type="button" variant="outline" size="xs" className="text-xs" onClick={() => setAll(false)}>
              Скрыть все
            </Button>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto overscroll-contain px-4 py-1">
          {filtered.map(({ key, label }) => (
            <label
              key={key}
              className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/60"
            >
              <input
                type="checkbox"
                className="size-4 accent-primary"
                checked={draft[key]}
                onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.checked }))}
              />
              {label}
            </label>
          ))}
        </div>

        <DialogFooter className="mx-0 mb-0 flex shrink-0 flex-col gap-2 rounded-b-xl border-t border-border/60 bg-muted/50 px-4 py-3 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => {
              const clamped = clampPaymentFilterVisibilityToTerritoryLevels(draft, territoryLevelCount);
              savePaymentFilterVisibility(clamped);
              onChange(clamped);
              onOpenChange(false);
            }}
          >
            Сохранить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
