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
import { Label } from "@/components/ui/label";
import {
  DEFAULT_PAYMENT_RECEIPT_PRINT_PREFS,
  type PaymentReceiptPrintPrefs,
  savePaymentReceiptPrintPrefs
} from "@/lib/payment-receipt-print-prefs";
import { useEffect, useState } from "react";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prefs: PaymentReceiptPrintPrefs;
  onSave: (next: PaymentReceiptPrintPrefs) => void;
};

const GROUP_LABELS: { id: PaymentReceiptPrintPrefs["groupBy"]; label: string }[] = [
  { id: "none", label: "Подряд (без групп)" },
  { id: "territory", label: "По территории клиента (область / город / район)" },
  { id: "agent", label: "По агенту" },
  { id: "expeditor", label: "По экспедитору (из заказа)" }
];

export function PaymentReceiptPrintSettingsDialog({ open, onOpenChange, prefs, onSave }: Props) {
  const [draft, setDraft] = useState<PaymentReceiptPrintPrefs>(prefs);

  useEffect(() => {
    if (open) setDraft(prefs);
  }, [open, prefs]);

  const toggle = (k: keyof Omit<PaymentReceiptPrintPrefs, "groupBy">) => {
    setDraft((d) => ({ ...d, [k]: !d[k] }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(90vh,720px)] max-w-lg overflow-y-auto sm:max-w-lg" showCloseButton>
        <DialogHeader>
          <DialogTitle>Печать чеков (касса)</DialogTitle>
          <DialogDescription>
            Настройки сохраняются в этом браузере. Выберите платежи в таблице галочками, затем «Печать чеков» —
            все отмеченные выйдут одним заданием на печать (удобно в конце смены).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <fieldset className="space-y-2">
            <legend className="text-xs font-medium text-muted-foreground">Группировка на листе</legend>
            {GROUP_LABELS.map((g) => (
              <label key={g.id} className="flex cursor-pointer items-start gap-2 text-sm">
                <input
                  type="radio"
                  className="mt-1 accent-primary"
                  name="pay-receipt-group"
                  checked={draft.groupBy === g.id}
                  onChange={() => setDraft((d) => ({ ...d, groupBy: g.id }))}
                />
                <span>{g.label}</span>
              </label>
            ))}
          </fieldset>

          <div className="space-y-2 border-t border-border pt-3">
            <Label className="text-xs font-medium text-muted-foreground">Поля на чеке</Label>
            <div className="grid gap-2 sm:grid-cols-2">
              {(
                [
                  ["showPaymentId", "№ платежа"],
                  ["showDates", "Даты"],
                  ["showClient", "Клиент"],
                  ["showClientCode", "Код клиента"],
                  ["showLegalName", "Юр. название"],
                  ["showAmount", "Сумма"],
                  ["showMethod", "Способ оплаты"],
                  ["showCashDesk", "Касса"],
                  ["showAgent", "Агент"],
                  ["showExpeditor", "Экспедитор"],
                  ["showTerritory", "Территория"],
                  ["showTradeDirection", "Направление торговли"],
                  ["showConsignment", "Консигнация"],
                  ["showNote", "Комментарий"]
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="size-4 accent-primary"
                    checked={draft[key]}
                    onChange={() => toggle(key)}
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => setDraft(DEFAULT_PAYMENT_RECEIPT_PRINT_PREFS)}
          >
            Сбросить
          </Button>
          <Button
            type="button"
            onClick={() => {
              savePaymentReceiptPrintPrefs(draft);
              onSave(draft);
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
