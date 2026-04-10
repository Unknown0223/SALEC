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
  querySuffix,
  stackClassName
}: {
  title: string;
  tenantSlug: string;
  selectedIds: number[];
  onSelectedIdsChange: (ids: number[]) => void;
  formDisabled: boolean;
  selectionDisabled: boolean;
  selectionHint?: string;
  querySuffix: string;
  /** Ikki ustun ustma-ust tushganda bosishlar chap ustunga tushishi uchun */
  stackClassName?: string;
}) {
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);

  return (
    <div
      className={cn(
        "relative flex min-h-[18rem] min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm",
        stackClassName ?? "z-0",
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
      <div className="min-h-[12rem] max-h-[min(22rem,42vh)] min-w-0 flex-1 overflow-y-auto overflow-x-hidden px-2 py-2">
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
  /** true bo‘lsa trigger SKU lar o‘rniga faqat kategoriya filtri */
  onlyByCategory?: boolean;
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
  onlyByCategory = false,
  showTriggerColumn,
  showBonusColumn,
  disabled = false
}: BonusRuleProductDualPanelsProps) {
  const formDisabled = Boolean(disabled);
  const triggerPickEnabled = onlyByAssortment || onlyByCategory;

  return (
    <div
      className={cn(
        "grid min-w-0 gap-4",
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
          selectionDisabled={!triggerPickEnabled}
          selectionHint={
            onlyByCategory
              ? "Kategoriya + tanlangan SKU: yuqoridagi kategoriyalar va chapdagi belgilar birgalikda — zakazda faqat shu mahsulotlar shartga kiradi."
              : !onlyByAssortment
                ? "Ikkala cheklov ham o‘chiq — barcha mahsulotlar trigger. SKU yoki kategoriya bilan cheklash uchun «Faqat assortiment» yoki «Kategoriya»ni yoqing."
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
