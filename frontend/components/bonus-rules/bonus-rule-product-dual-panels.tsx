"use client";

import { useDeferredValue, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { BonusRuleProductCategoryTree } from "@/components/bonus-rules/bonus-rule-product-category-tree";

function ProductTreeColumn({
  title,
  tenantSlug,
  selectedIds,
  onSelectedIdsChange,
  formDisabled,
  selectionDisabled,
  selectionHint,
  querySuffix
}: {
  title: string;
  tenantSlug: string;
  selectedIds: number[];
  onSelectedIdsChange: (ids: number[]) => void;
  formDisabled: boolean;
  selectionDisabled: boolean;
  selectionHint?: string;
  querySuffix: string;
}) {
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);

  return (
    <div
      className={cn(
        "flex min-h-[18rem] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm",
        formDisabled && "opacity-70"
      )}
    >
      <div className="border-b border-border bg-muted/30 px-3 py-2">
        <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
      </div>
      <div className="space-y-2 border-b border-border/80 p-3">
        <Input
          className="h-9"
          placeholder="Qidirish… (nom yoki SKU)"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          disabled={formDisabled}
          aria-label={`${title} qidiruv`}
        />
        {selectionHint ? (
          <p className="text-xs leading-snug text-amber-800 dark:text-amber-200/95">{selectionHint}</p>
        ) : null}
        <p className="text-[11px] text-muted-foreground">
          Kategoriyani bosing — ochiladi; mahsulot yonidagi belgi bilan tanlang.
        </p>
      </div>
      <div className="min-h-[12rem] max-h-[min(22rem,42vh)] flex-1 overflow-y-auto px-2 py-2">
        <BonusRuleProductCategoryTree
          tenantSlug={tenantSlug}
          value={selectedIds}
          onChange={onSelectedIdsChange}
          disabled={formDisabled}
          selectionDisabled={selectionDisabled}
          search={deferredSearch}
          querySuffix={querySuffix}
        />
      </div>
      <div className="border-t border-border/80 px-3 py-1.5 text-[11px] text-muted-foreground">
        Tanlangan: {selectedIds.length} ta
        {selectionDisabled ? (
          <span className="ml-1 text-amber-800/90 dark:text-amber-200/80">(saqlashda qo‘llanmaydi)</span>
        ) : null}
      </div>
    </div>
  );
}

export type BonusRuleProductDualPanelsProps = {
  tenantSlug: string;
  triggerProductIds: number[];
  bonusProductIds: number[];
  onTriggerChange: (ids: number[]) => void;
  onBonusChange: (ids: number[]) => void;
  onlyByAssortment: boolean;
  showTriggerColumn: boolean;
  showBonusColumn: boolean;
  disabled?: boolean;
};

/**
 * Ikki ustun: chap — trigger mahsulotlar, o‘ng — bonus mahsulotlar.
 * Faol mahsulotlar kategoriya bo‘yicha ochiladi-yopiladi; qatorlarda checkbox.
 */
export function BonusRuleProductDualPanels({
  tenantSlug,
  triggerProductIds,
  bonusProductIds,
  onTriggerChange,
  onBonusChange,
  onlyByAssortment,
  showTriggerColumn,
  showBonusColumn,
  disabled = false
}: BonusRuleProductDualPanelsProps) {
  const formDisabled = Boolean(disabled);

  return (
    <div
      className={cn(
        "grid gap-4",
        showTriggerColumn && showBonusColumn ? "md:grid-cols-2" : "md:grid-cols-1"
      )}
    >
      {showTriggerColumn ? (
        <ProductTreeColumn
          title="Mahsulot (trigger)"
          tenantSlug={tenantSlug}
          selectedIds={triggerProductIds}
          onSelectedIdsChange={onTriggerChange}
          formDisabled={formDisabled}
          selectionDisabled={!onlyByAssortment}
          selectionHint={
            !onlyByAssortment
              ? "«Faqat assortiment» o‘chiq — trigger sifatida barcha mahsulotlar hisoblanadi. Cheklash uchun yuqoridagi «Faqat assortiment»ni yoqing."
              : undefined
          }
          querySuffix="dual-trigger"
        />
      ) : null}
      {showBonusColumn ? (
        <ProductTreeColumn
          title="Bonus mahsulotlari"
          tenantSlug={tenantSlug}
          selectedIds={bonusProductIds}
          onSelectedIdsChange={onBonusChange}
          formDisabled={formDisabled}
          selectionDisabled={false}
          querySuffix="dual-bonus"
        />
      ) : null}
    </div>
  );
}
