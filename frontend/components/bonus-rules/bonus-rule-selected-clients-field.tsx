"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import type { ClientRow } from "@/lib/client-types";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";

type Props = {
  tenantSlug: string;
  selectedIds: number[];
  /** Chip matni uchun (ixtiyoriy) */
  nameById: Record<number, string>;
  onChange: (nextIds: number[], namePatch: Record<number, string>) => void;
  disabled?: boolean;
  /** Узкая колонка в ряду настроек */
  compact?: boolean;
};

export function BonusRuleSelectedClientsField({
  tenantSlug,
  selectedIds,
  nameById,
  onChange,
  disabled,
  compact
}: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(search.trim()), 300);
    return () => window.clearTimeout(t);
  }, [search]);

  const listQ = useQuery({
    queryKey: ["bonus-rule-client-picker", tenantSlug, debounced],
    enabled: open && Boolean(tenantSlug),
    queryFn: async () => {
      const q = new URLSearchParams({
        page: "1",
        limit: "50",
        sort: "name",
        order: "asc",
        is_active: "true"
      });
      if (debounced) q.set("search", debounced);
      const { data } = await api.get<{ data: ClientRow[] }>(`/api/${tenantSlug}/clients?${q}`);
      return data.data ?? [];
    }
  });

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const toggleRow = (row: ClientRow, checked: boolean) => {
    if (checked) {
      onChange(
        [...selectedIds, row.id].sort((a, b) => a - b),
        { [row.id]: row.name }
      );
    } else {
      onChange(
        selectedIds.filter((x) => x !== row.id),
        { [row.id]: "" }
      );
    }
  };

  const removeChip = (id: number) => {
    onChange(
      selectedIds.filter((x) => x !== id),
      { [id]: "" }
    );
  };

  return (
    <div
      className={cn(
        "grid border-t border-border/60",
        compact ? "mt-2 gap-1.5 pt-2" : "mt-3 gap-2 pt-3"
      )}
    >
      <Label className={cn(compact ? "text-[10px]" : "text-xs")}>Клиенты</Label>
      {selectedIds.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {selectedIds.map((id) => (
            <span
              key={id}
              className="inline-flex max-w-full items-center gap-1 rounded-md border bg-background px-2 py-0.5 text-xs"
            >
              <span className="truncate" title={`#${id} ${nameById[id] ?? ""}`}>
                #{id}
                {nameById[id]?.trim() ? ` · ${nameById[id]}` : ""}
              </span>
              <button
                type="button"
                className="shrink-0 text-muted-foreground hover:text-foreground disabled:opacity-50"
                onClick={() => removeChip(id)}
                disabled={disabled}
                aria-label="Удалить клиента"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      ) : (
        <p className="text-[11px] text-muted-foreground">Никто не выбран — нажмите кнопку ниже.</p>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger
          render={<Button type="button" variant="outline" size="sm" disabled={disabled} />}
        >
          Выбрать клиентов…
        </DialogTrigger>
        <DialogContent className="flex max-h-[min(520px,85vh)] flex-col gap-3 overflow-hidden sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Выбор клиентов</DialogTitle>
          </DialogHeader>
          <Input
            className="h-9"
            placeholder="Поиск по имени, телефону…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            disabled={listQ.isFetching}
            autoFocus
          />
          <div className="min-h-0 flex-1 overflow-y-auto rounded-md border border-border/70">
            {listQ.isError ? (
              <p className="p-3 text-xs text-destructive">Не удалось загрузить список.</p>
            ) : listQ.isLoading ? (
              <p className="p-3 text-xs text-muted-foreground">Загрузка…</p>
            ) : (listQ.data?.length ?? 0) === 0 ? (
              <p className="p-3 text-xs text-muted-foreground">Ничего не найдено.</p>
            ) : (
              <ul className="divide-y divide-border/60">
                {listQ.data!.map((row) => (
                  <li key={row.id} className="flex items-center gap-2 px-3 py-2 hover:bg-muted/40">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-primary"
                      checked={selectedSet.has(row.id)}
                      onChange={(e) => toggleRow(row, e.target.checked)}
                      id={`br-client-${row.id}`}
                    />
                    <label htmlFor={`br-client-${row.id}`} className="min-w-0 flex-1 cursor-pointer text-sm">
                      <span className="font-medium">{row.name}</span>
                      <span className="ml-2 font-mono text-[11px] text-muted-foreground">#{row.id}</span>
                      {row.phone?.trim() ? (
                        <span className="mt-0.5 block text-[11px] text-muted-foreground">{row.phone}</span>
                      ) : null}
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
