"use client";

import { cn } from "@/lib/utils";

const checkboxCls = "mt-0.5 h-4 w-4 shrink-0 rounded border border-input accent-primary";

type Props = {
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  disabled?: boolean;
};

/** «Kategoriya» rejimini yoqish/o‘chirish (alohida katalog ro‘yxati yo‘q — trigger mahsulotlar pastdagi kartada). */
export function BonusRuleCategoryHoverField({ checked, onCheckedChange, disabled = false }: Props) {
  return (
    <label
      className={cn("flex cursor-pointer items-center gap-2 text-sm", disabled && "cursor-not-allowed opacity-70")}
    >
      <input
        type="checkbox"
        className={checkboxCls}
        checked={checked}
        disabled={disabled}
        onChange={(e) => onCheckedChange(e.target.checked)}
      />
      Категория
    </label>
  );
}
