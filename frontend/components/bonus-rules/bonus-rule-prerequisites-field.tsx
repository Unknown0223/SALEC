"use client";

import { BonusRulePrerequisitesPickerPanels } from "@/components/bonus-rules/bonus-rule-prerequisites-picker-panels";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog";
import { Link2, Plus } from "lucide-react";
import { useState } from "react";

type Props = {
  tenantSlug: string;
  excludeRuleId: number | null;
  value: number[];
  onChange: (ids: number[]) => void;
  disabled?: boolean;
};

export function BonusRulePrerequisitesField({ tenantSlug, excludeRuleId, value, onChange, disabled }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <div className="flex flex-wrap items-center gap-3">
        <DialogTrigger
          render={<Button type="button" variant="outline" size="sm" disabled={disabled} className="gap-1.5" />}
        >
          <Plus className="size-3.5" />
          Связать
        </DialogTrigger>
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <Link2 className="size-3.5 shrink-0 opacity-70" />
          {value.length > 0 ? `${value.length} правил` : "Нет предварительных условий"}
        </span>
      </div>
      <DialogContent className="max-w-3xl gap-0 p-0 sm:max-w-3xl" showCloseButton>
        <DialogHeader className="border-b border-border/60 px-4 py-3">
          <DialogTitle className="text-base">Правила, которые должны выполниться заранее</DialogTitle>
          <p className="text-xs font-normal text-muted-foreground">
            Бонусы (по количеству) и скидки (сумма / %) в отдельных колонках — можно комбинировать. Если в заказе не
            сработает автоматическая проверка своего типа для любого из выбранных, текущее правило не применится.
          </p>
        </DialogHeader>
        <BonusRulePrerequisitesPickerPanels
          tenantSlug={tenantSlug}
          excludeRuleId={excludeRuleId}
          value={value}
          onChange={onChange}
          fetchEnabled={open}
        />
        <div className="flex justify-end border-t border-border/60 bg-muted/30 px-3 py-2">
          <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(false)}>
            Готово
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
