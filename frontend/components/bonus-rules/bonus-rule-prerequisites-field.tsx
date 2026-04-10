"use client";

import type { BonusRuleRow } from "@/components/bonus-rules/bonus-rule-types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog";
import { api } from "@/lib/api";
import { STALE } from "@/lib/query-stale";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { Link2, Plus } from "lucide-react";
import { useMemo, useState } from "react";

type ListResponse = { data: BonusRuleRow[]; total: number };

function usePrereqRuleOptions(tenantSlug: string, types: string, enabled: boolean) {
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

function typeShortLabel(t: string): string {
  if (t === "qty") return "Miqdor";
  if (t === "sum") return "Summa";
  if (t === "discount") return "Chegirma";
  return t;
}

type Props = {
  tenantSlug: string;
  excludeRuleId: number | null;
  value: number[];
  onChange: (ids: number[]) => void;
  disabled?: boolean;
};

export function BonusRulePrerequisitesField({ tenantSlug, excludeRuleId, value, onChange, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const qtyQ = usePrereqRuleOptions(tenantSlug, "qty", open);
  const skidQ = usePrereqRuleOptions(tenantSlug, "sum,discount", open);

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
          <p className="px-2 py-4 text-xs text-muted-foreground">Yuklanmoqda…</p>
        ) : rows.length === 0 ? (
          <p className="px-2 py-4 text-xs text-muted-foreground">Ro‘yxat bo‘sh</p>
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
                      #{r.id} · {typeShortLabel(r.type)} · ustunlik {r.priority}
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
    <Dialog open={open} onOpenChange={setOpen}>
      <div className="flex flex-wrap items-center gap-3">
        <DialogTrigger
          render={<Button type="button" variant="outline" size="sm" disabled={disabled} className="gap-1.5" />}
        >
          <Plus className="size-3.5" />
          Bog‘lash
        </DialogTrigger>
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <Link2 className="size-3.5 shrink-0 opacity-70" />
          {value.length > 0 ? `${value.length} ta qoida` : "Oldindan shart yo‘q"}
        </span>
      </div>
      <DialogContent className="max-w-3xl gap-0 p-0 sm:max-w-3xl" showCloseButton>
        <DialogHeader className="border-b border-border/60 px-4 py-3">
          <DialogTitle className="text-base">Oldindan bajarilishi kerak bo‘lgan qoidalar</DialogTitle>
          <p className="text-xs font-normal text-muted-foreground">
            Bonuslar (miqdor) va chegirmalar (summa / %) alohida ustun — ixtiyoriy aralash tanlash mumkin. Har biri shu
            zakazda o‘z turiga mos avtomatik tekshiruvdan o‘tmasa, joriy qoida qo‘llanmaydi.
          </p>
        </DialogHeader>
        <div className="flex flex-col sm:flex-row sm:divide-x sm:divide-border/60">
          {renderCol("Bonuslar (miqdor)", qtyRows, qtyQ.isLoading)}
          {renderCol("Chegirmalar (summa · %)", skidRows, skidQ.isLoading)}
        </div>
        <div className="flex justify-end border-t border-border/60 bg-muted/30 px-3 py-2">
          <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(false)}>
            Tayyor
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
