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
  DEFAULT_NAKLADNOY_EXPORT_PREFS,
  type NakladnoyExportPrefs,
  saveNakladnoyExportPrefs
} from "@/lib/order-nakladnoy";
import { useEffect, useState } from "react";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prefs: NakladnoyExportPrefs;
  onSave: (next: NakladnoyExportPrefs) => void;
};

export function NakladnoyExportSettingsDialog({ open, onOpenChange, prefs, onSave }: Props) {
  const [draft, setDraft] = useState<NakladnoyExportPrefs>(prefs);

  useEffect(() => {
    if (open) setDraft(prefs);
  }, [open, prefs]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md sm:max-w-md" showCloseButton>
        <DialogHeader>
          <DialogTitle>Nakladnoy eksport sozlamalari</DialogTitle>
          <DialogDescription>
            SKU/shtrix-kod, «Загруз зав.склада 5.1.8» va «Накладные 2.1.0» uchun varaqlar bo‘yicha ajratish
            (bitta fayl ichida).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <fieldset className="space-y-2">
            <legend className="text-xs font-medium text-muted-foreground">Выберите тип кода</legend>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="radio"
                name="nakladnoy-code"
                checked={draft.codeColumn === "sku"}
                onChange={() => setDraft((d) => ({ ...d, codeColumn: "sku" }))}
              />
              Код (SKU)
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="radio"
                name="nakladnoy-code"
                checked={draft.codeColumn === "barcode"}
                onChange={() => setDraft((d) => ({ ...d, codeColumn: "barcode" }))}
              />
              Штрих-код (bo‘sh bo‘lsa SKU)
            </label>
          </fieldset>

          <div className="space-y-2 border-t border-border pt-3">
            <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={draft.separateSheets}
                onChange={(e) => setDraft((d) => ({ ...d, separateSheets: e.target.checked }))}
              />
              Varqlarga ajratish (Отделить по листам)
            </label>
            <p className="text-xs text-muted-foreground">
              Ochiq bo‘lsa, har bir guruh alohida varaqda (5.1.8 va 2.1.0). Yopiq bo‘lsa, 5.1.8da bitta jadval,
              2.1.0da esa bitta varaqda zakazlar tepadan pastga (har birida chap/o‘ng 2 nusxa).
            </p>
          </div>

          <fieldset
            className={`space-y-2 ${!draft.separateSheets ? "pointer-events-none opacity-50" : ""}`}
          >
            <legend className="text-xs font-medium text-muted-foreground">Выберите тип фильтрации</legend>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="radio"
                name="nakladnoy-group"
                checked={draft.groupBy === "territory"}
                disabled={!draft.separateSheets}
                onChange={() => setDraft((d) => ({ ...d, groupBy: "territory" }))}
              />
              По территории
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="radio"
                name="nakladnoy-group"
                checked={draft.groupBy === "agent"}
                disabled={!draft.separateSheets}
                onChange={() => setDraft((d) => ({ ...d, groupBy: "agent" }))}
              />
              По агентам
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="radio"
                name="nakladnoy-group"
                checked={draft.groupBy === "expeditor"}
                disabled={!draft.separateSheets}
                onChange={() => setDraft((d) => ({ ...d, groupBy: "expeditor" }))}
              />
              По экспедиторам (доставщик)
            </label>
          </fieldset>

          <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            <Label className="text-[11px] uppercase tracking-wide">Накладные 2.1.0</Label>
            <p className="mt-1">
              Chop: A4 portrait, ikki nusxa yonma-yon. Yuqorida chapda nomlar, o‘ngda qiymatlar. «Varaqlarga
              ajratish» yopiq — barcha zakazlar bitta varaqda ustma-ust; ochiq — agent / hudud / ekspeditor
              bo‘yicha alohida varaqlar. (Консигнация — keyingi bosqich, hozir emas.)
            </p>
          </div>
        </div>

        <DialogFooter className="border-0 bg-transparent p-0 sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setDraft(DEFAULT_NAKLADNOY_EXPORT_PREFS);
            }}
          >
            Standart
          </Button>
          <Button
            type="button"
            className="bg-teal-700 text-white hover:bg-teal-800"
            onClick={() => {
              saveNakladnoyExportPrefs(draft);
              onSave(draft);
              onOpenChange(false);
            }}
          >
            Saqlash
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
