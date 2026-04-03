"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { downloadXlsxSheet } from "@/lib/download-xlsx";
import { Pencil, RefreshCw } from "lucide-react";

export type SalesChannelRow = {
  id: number;
  name: string;
  code: string | null;
  comment: string | null;
  sort_order: number;
  is_active: boolean;
};

type Props = { tenantSlug: string };

export function SalesChannelsWorkspace({ tenantSlug }: Props) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"active" | "inactive">("active");
  const [search, setSearch] = useState("");
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  const [addOpen, setAddOpen] = useState(false);
  const [editRow, setEditRow] = useState<SalesChannelRow | null>(null);

  const listQ = useQuery({
    queryKey: ["sales-channels-catalog", tenantSlug, tab],
    enabled: Boolean(tenantSlug),
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("is_active", tab === "active" ? "true" : "false");
      const { data } = await api.get<{ data: SalesChannelRow[] }>(
        `/api/${tenantSlug}/sales-channels?${params.toString()}`
      );
      return data.data;
    }
  });

  const createMut = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      await api.post(`/api/${tenantSlug}/sales-channels`, body);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["sales-channels-catalog", tenantSlug] });
      void qc.invalidateQueries({ queryKey: ["settings", "profile", tenantSlug] });
      void qc.invalidateQueries({ queryKey: ["clients-references", tenantSlug] });
      setAddOpen(false);
    }
  });

  const patchMut = useMutation({
    mutationFn: async ({ id, body }: { id: number; body: Record<string, unknown> }) => {
      await api.patch(`/api/${tenantSlug}/sales-channels/${id}`, body);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["sales-channels-catalog", tenantSlug] });
      void qc.invalidateQueries({ queryKey: ["settings", "profile", tenantSlug] });
      void qc.invalidateQueries({ queryKey: ["clients-references", tenantSlug] });
      setEditRow(null);
    }
  });

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = listQ.data ?? [];
    if (!q) return rows;
    return rows.filter((r) => [r.name, r.code ?? ""].join(" ").toLowerCase().includes(q));
  }, [listQ.data, search]);

  const total = filteredRows.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, pageCount);
  const pageRows = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, safePage, pageSize]);

  useEffect(() => setPage(1), [tab, search, pageSize]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2 border-b border-border">
          <button
            type="button"
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm font-medium",
              tab === "active" ? "border-primary text-primary" : "border-transparent text-muted-foreground"
            )}
            onClick={() => setTab("active")}
          >
            Активный
          </button>
          <button
            type="button"
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm font-medium",
              tab === "inactive" ? "border-primary text-primary" : "border-transparent text-muted-foreground"
            )}
            onClick={() => setTab("inactive")}
          >
            Не активный
          </button>
        </div>
        <Button type="button" size="sm" onClick={() => setAddOpen(true)}>
          Добавить
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select
          className="h-8 rounded-md border border-input bg-background px-2 text-xs"
          value={pageSize}
          onChange={(e) => setPageSize(Number.parseInt(e.target.value, 10))}
        >
          {[10, 25, 50].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <Input placeholder="Поиск" value={search} onChange={(e) => setSearch(e.target.value)} className="h-8 max-w-xs text-xs" />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 text-xs"
          onClick={() => {
            const headers = ["Название", "Код"];
            const rows = filteredRows.map((r) => [r.name, r.code ?? ""]);
            downloadXlsxSheet(
              `sales_channels_${tab}_${new Date().toISOString().slice(0, 10)}.xlsx`,
              "Каналы",
              headers,
              rows
            );
          }}
        >
          Excel
        </Button>
        <Button type="button" variant="ghost" size="icon-sm" className="h-8 w-8" onClick={() => void listQ.refetch()}>
          <RefreshCw className={cn("size-4", listQ.isFetching && "animate-spin")} />
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[480px] text-xs">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-2 py-2 text-left font-medium text-muted-foreground">Название</th>
              <th className="px-2 py-2 text-left font-medium text-muted-foreground">Код</th>
              <th className="w-12 px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {pageRows.map((r) => (
              <tr key={r.id} className="border-t even:bg-muted/20">
                <td className="px-2 py-2 font-medium">{r.name}</td>
                <td className="px-2 py-2 font-mono">{r.code ?? "—"}</td>
                <td className="px-2 py-2">
                  <Button type="button" variant="ghost" size="icon-sm" title="Редактировать" onClick={() => setEditRow(r)}>
                    <Pencil className="size-3.5 text-amber-600" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted-foreground">
        Показано {pageRows.length ? (safePage - 1) * pageSize + 1 : 0} – {(safePage - 1) * pageSize + pageRows.length} / {total}
      </p>
      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" size="sm" className="h-7" disabled={safePage <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
          ‹
        </Button>
        <span className="text-xs tabular-nums">
          {safePage} / {pageCount}
        </span>
        <Button type="button" variant="outline" size="sm" className="h-7" disabled={safePage >= pageCount} onClick={() => setPage((p) => Math.min(pageCount, p + 1))}>
          ›
        </Button>
      </div>

      <ChannelFormDialog
        mode="add"
        open={addOpen}
        onOpenChange={setAddOpen}
        saving={createMut.isPending}
        onSave={(body) => createMut.mutate(body)}
      />
      <ChannelFormDialog
        mode="edit"
        open={Boolean(editRow)}
        row={editRow}
        onOpenChange={(o) => !o && setEditRow(null)}
        saving={patchMut.isPending}
        onSave={(body) => editRow && patchMut.mutate({ id: editRow.id, body })}
      />
    </div>
  );
}

function ChannelFormDialog({
  mode,
  open,
  row,
  onOpenChange,
  saving,
  onSave
}: {
  mode: "add" | "edit";
  open: boolean;
  row?: SalesChannelRow | null;
  onOpenChange: (o: boolean) => void;
  saving: boolean;
  onSave: (body: Record<string, unknown>) => void;
}) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [comment, setComment] = useState("");
  const [sort_order, setSort] = useState("0");
  const [is_active, setActive] = useState(true);

  useEffect(() => {
    if (!open) return;
    if (mode === "add") {
      setName("");
      setCode("");
      setComment("");
      setSort("0");
      setActive(true);
    } else if (row) {
      setName(row.name);
      setCode(row.code ?? "");
      setComment(row.comment ?? "");
      setSort(String(row.sort_order));
      setActive(row.is_active);
    }
  }, [open, mode, row]);

  const submit = () => {
    const so = Number.parseInt(sort_order, 10);
    onSave({
      name: name.trim(),
      code: code.trim() || null,
      comment: comment.trim() || null,
      sort_order: Number.isFinite(so) ? so : 0,
      is_active
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{mode === "add" ? "Добавить" : "Редактировать"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <label className="text-xs text-muted-foreground">
            Название
            <Input className="mt-1" value={name} onChange={(e) => setName(e.target.value)} placeholder="Название *" />
          </label>
          <label className="text-xs text-muted-foreground">
            Код
            <Input className="mt-1 font-mono" value={code} onChange={(e) => setCode(e.target.value)} maxLength={20} />
            <span className="text-[10px]">{code.length} / 20</span>
          </label>
          <label className="text-xs text-muted-foreground">
            Комментарий
            <textarea
              className="mt-1 min-h-[56px] w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
          </label>
          <label className="text-xs text-muted-foreground">
            Сортировка
            <Input className="mt-1" type="number" value={sort_order} onChange={(e) => setSort(e.target.value)} />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={is_active} onChange={(e) => setActive(e.target.checked)} />
            Активный
          </label>
        </div>
        <DialogFooter>
          <Button type="button" className="w-full" disabled={saving || !name.trim()} onClick={submit}>
            {mode === "add" ? "Добавить" : "Сохранить"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
