"use client";

import type { BonusRuleRow } from "@/components/bonus-rules/bonus-rule-types";
import { api } from "@/lib/api";
import { STALE } from "@/lib/query-stale";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

type ListResponse = { data: BonusRuleRow[]; total: number };

export function usePrereqRuleOptions(tenantSlug: string, types: string, enabled: boolean) {
  return useQuery({
    queryKey: ["bonus-rules-prereq-picker", tenantSlug, types],
    enabled: Boolean(tenantSlug) && enabled,
    staleTime: STALE.reference,
    queryFn: async () => {
      const { data } = await api.get<ListResponse>(
        `/api/${tenantSlug}/bonus-rules?page=1&limit=500&is_active=true&manual=false&types=${encodeURIComponent(types)}`
      );
      return data.data ?? [];
    }
  });
}

export function typeShortLabel(t: string): string {
  if (t === "qty") return "Кол-во";
  if (t === "sum") return "Сумма";
  if (t === "discount") return "Скидка";
  return t;
}

export type PrerequisitesPickerPanelsProps = {
  tenantSlug: string;
  excludeRuleId: number | null;
  value: number[];
  onChange: (ids: number[]) => void;
  fetchEnabled: boolean;
};

export function BonusRulePrerequisitesPickerPanels({
  tenantSlug,
  excludeRuleId,
  value,
  onChange,
  fetchEnabled
}: PrerequisitesPickerPanelsProps) {
  const qtyQ = usePrereqRuleOptions(tenantSlug, "qty", fetchEnabled);
  const skidQ = usePrereqRuleOptions(tenantSlug, "sum,discount", fetchEnabled);

  const qtyRows = useMemo(
    () => (qtyQ.data ?? []).filter((r) => r.id !== excludeRuleId),
    [qtyQ.data, excludeRuleId]
  );
  const skidRows = useMemo(
    () => (skidQ.data ?? []).filter((r) => r.id !== excludeRuleId),
    [skidQ.data, excludeRuleId]
  );

  const selected = useMemo(() => new Set(value), [value]);

  const toggle = (id: number) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(Array.from(next).sort((a, b) => a - b));
  };

  const renderCol = (title: string, rows: BonusRuleRow[], loading: boolean) => (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col border-border/60 sm:border-r sm:last:border-r-0">
      <p className="shrink-0 border-b border-border/50 bg-muted/40 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      <div className="max-h-[min(52vh,420px)] min-h-[200px] overflow-y-auto px-2 py-2">
        {loading ? (
          <p className="px-2 py-4 text-xs text-muted-foreground">Загрузка…</p>
        ) : rows.length === 0 ? (
          <p className="px-2 py-4 text-xs text-muted-foreground">Список пуст</p>
        ) : (
          <ul className="space-y-1">
            {rows.map((r) => (
              <li key={r.id}>
                <label
                  className={cn(
                    "flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/60",
                    selected.has(r.id) && "bg-primary/8"
                  )}
                >
                  <input
                    type="checkbox"
                    className="mt-0.5 rounded border-input"
                    checked={selected.has(r.id)}
                    onChange={() => toggle(r.id)}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="font-medium leading-snug">{r.name}</span>
                    <span className="mt-0.5 block text-[10px] text-muted-foreground">
                      #{r.id} · {typeShortLabel(r.type)} · приор. {r.priority}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col sm:flex-row sm:divide-x sm:divide-border/60">
      {renderCol("Бонусы (количество)", qtyRows, qtyQ.isLoading)}
      {renderCol("Скидки (сумма · %)", skidRows, skidQ.isLoading)}
    </div>
  );
}
