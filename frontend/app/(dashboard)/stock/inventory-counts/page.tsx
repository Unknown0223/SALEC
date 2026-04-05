"use client";

import { PageHeader } from "@/components/dashboard/page-header";
import { PageShell } from "@/components/dashboard/page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuthStore } from "@/lib/auth-store";
import { api } from "@/lib/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";

type TakeRow = {
  id: number;
  status: string;
  title: string | null;
  warehouse: { id: number; name: string };
  lines: { product: { id: number; sku: string; name: string }; system_qty: string; counted_qty: string | null }[];
};

export default function InventoryCountsPage() {
  const tenantSlug = useAuthStore((s) => s.tenantSlug);
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [warehouseId, setWarehouseId] = useState("");
  const [title, setTitle] = useState("");
  const [linesDraft, setLinesDraft] = useState("");

  const whQ = useQuery({
    queryKey: ["warehouses", tenantSlug, "inv"],
    enabled: Boolean(tenantSlug),
    queryFn: async () => {
      const { data } = await api.get<{ data: { id: number; name: string }[] }>(`/api/${tenantSlug}/warehouses`);
      return data.data.filter((w) => w);
    }
  });

  const listQ = useQuery({
    queryKey: ["stock-takes", tenantSlug],
    enabled: Boolean(tenantSlug),
    queryFn: async () => {
      const { data } = await api.get<{ data: TakeRow[]; total: number }>(
        `/api/${tenantSlug}/stock-takes?limit=40`
      );
      return data.data;
    }
  });

  const detailQ = useQuery({
    queryKey: ["stock-take", tenantSlug, selectedId],
    enabled: Boolean(tenantSlug) && selectedId != null,
    queryFn: async () => {
      const { data } = await api.get<{ data: TakeRow }>(`/api/${tenantSlug}/stock-takes/${selectedId}`);
      return data.data;
    }
  });

  const createMut = useMutation({
    mutationFn: async () => {
      const wid = Number.parseInt(warehouseId, 10);
      await api.post(`/api/${tenantSlug}/stock-takes`, {
        warehouse_id: wid,
        title: title.trim() || null
      });
    },
    onSuccess: async () => {
      setTitle("");
      await qc.invalidateQueries({ queryKey: ["stock-takes", tenantSlug] });
    }
  });

  const saveLinesMut = useMutation({
    mutationFn: async () => {
      let lines: { product_id: number; counted_qty: number | null }[];
      try {
        lines = JSON.parse(linesDraft) as { product_id: number; counted_qty: number | null }[];
        if (!Array.isArray(lines)) throw new Error("arr");
      } catch {
        throw new Error("json");
      }
      await api.put(`/api/${tenantSlug}/stock-takes/${selectedId}/lines`, { lines });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["stock-take", tenantSlug, selectedId] });
      await qc.invalidateQueries({ queryKey: ["stock-takes", tenantSlug] });
    }
  });

  const postMut = useMutation({
    mutationFn: async () => {
      await api.post(`/api/${tenantSlug}/stock-takes/${selectedId}/post`);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["stock-take", tenantSlug, selectedId] });
      await qc.invalidateQueries({ queryKey: ["stock-takes", tenantSlug] });
    }
  });

  const warehouses = useMemo(() => whQ.data ?? [], [whQ.data]);

  const detail = detailQ.data;
  const syncDraftFromDetail = () => {
    if (!detail?.lines?.length) {
      setLinesDraft("[]");
      return;
    }
    setLinesDraft(
      JSON.stringify(
        detail.lines.map((l) => ({
          product_id: l.product.id,
          counted_qty: l.counted_qty != null ? Number.parseFloat(l.counted_qty) : null
        })),
        null,
        2
      )
    );
  };

  return (
    <PageShell>
      <PageHeader
        title="Инвентаризация"
        description="Черновик → строки (product_id + counted_qty) → проведение обновляет остатки на складе."
      />
      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <div className="space-y-3 rounded-lg border bg-card p-4">
          <h2 className="text-sm font-semibold">Новый документ</h2>
          <div className="space-y-2">
            <Label>Склад</Label>
            <select
              className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              value={warehouseId}
              onChange={(e) => setWarehouseId(e.target.value)}
            >
              <option value="">—</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>
          <Input placeholder="Название (необязательно)" value={title} onChange={(e) => setTitle(e.target.value)} />
          <Button
            type="button"
            disabled={!warehouseId || createMut.isPending}
            onClick={() => void createMut.mutate()}
          >
            Создать черновик
          </Button>
        </div>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-3 py-2 text-left">ID</th>
                <th className="px-3 py-2 text-left">Склад</th>
                <th className="px-3 py-2 text-left">Статус</th>
                <th className="px-3 py-2 text-right" />
              </tr>
            </thead>
            <tbody>
              {(listQ.data ?? []).map((t) => (
                <tr key={t.id} className="border-t">
                  <td className="px-3 py-2">{t.id}</td>
                  <td className="px-3 py-2">{t.warehouse.name}</td>
                  <td className="px-3 py-2">{t.status}</td>
                  <td className="px-3 py-2 text-right">
                    <Button type="button" variant="outline" size="sm" onClick={() => setSelectedId(t.id)}>
                      Открыть
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {selectedId != null ? (
        <div className="space-y-3 rounded-lg border bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Документ #{selectedId}</h2>
            <div className="flex gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setSelectedId(null)}>
                Закрыть
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={syncDraftFromDetail} disabled={!detail}>
                Подставить строки
              </Button>
            </div>
          </div>
          {detailQ.isLoading ? (
            <p className="text-sm text-muted-foreground">Загрузка…</p>
          ) : detail ? (
            <>
              <p className="text-xs text-muted-foreground">
                Статус: {detail.status}. Системные количества зафиксированы в строках при сохранении.
              </p>
              <div className="space-y-2">
                <Label>Строки JSON: [&#123; &quot;product_id&quot;: 1, &quot;counted_qty&quot;: 10 &#125;, …]</Label>
                <textarea
                  className="min-h-[160px] w-full rounded-md border border-input bg-background p-2 font-mono text-xs"
                  value={linesDraft}
                  onChange={(e) => setLinesDraft(e.target.value)}
                  disabled={detail.status !== "draft"}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                {detail.status === "draft" ? (
                  <>
                    <Button type="button" disabled={saveLinesMut.isPending} onClick={() => void saveLinesMut.mutate()}>
                      Сохранить строки
                    </Button>
                    <Button type="button" variant="secondary" disabled={postMut.isPending} onClick={() => void postMut.mutate()}>
                      Провести
                    </Button>
                  </>
                ) : null}
              </div>
            </>
          ) : null}
        </div>
      ) : null}
    </PageShell>
  );
}
