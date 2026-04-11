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
  DEFAULT_PAYMENT_FILTER_VISIBILITY,
  type PaymentFilterVisibility,
  PAYMENT_FILTER_VISIBILITY_META,
  savePaymentFilterVisibility
} from "@/lib/payment-filters-visibility";
import { useEffect, useMemo, useState } from "react";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: PaymentFilterVisibility;
  onChange: (next: PaymentFilterVisibility) => void;
};

export function PaymentFiltersVisibilityDialog({ open, onOpenChange, value, onChange }: Props) {
  const [draft, setDraft] = useState<PaymentFilterVisibility>(value);
  const [q, setQ] = useState("");

  useEffect(() => {
    if (open) {
      setDraft(value);
      setQ("");
    }
  }, [open, value]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return PAYMENT_FILTER_VISIBILITY_META;
    return PAYMENT_FILTER_VISIBILITY_META.filter((x) => x.label.toLowerCase().includes(s));
  }, [q]);

  const setAll = (on: boolean) => {
    setDraft(() => {
      const next = { ...DEFAULT_PAYMENT_FILTER_VISIBILITY };
      (Object.keys(next) as (keyof PaymentFilterVisibility)[]).forEach((k) => {
        next[k] = on;
      });
      return next;
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(85vh,520px)] max-w-md overflow-hidden p-0 sm:max-w-md" showCloseButton>
        <DialogHeader className="border-b border-border/60 px-4 py-3 text-left">
          <DialogTitle className="text-base">Видимость фильтров</DialogTitle>
          <DialogDescription className="text-xs">
            Отметьте, какие поля показывать на панели. Сохраняется в браузере.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 px-4 py-2">
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

        <div className="max-h-[min(45vh,280px)] space-y-0.5 overflow-y-auto px-4 pb-2">
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

        <DialogFooter className="border-t border-border/60 px-4 py-3">
          <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => {
              savePaymentFilterVisibility(draft);
              onChange(draft);
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
