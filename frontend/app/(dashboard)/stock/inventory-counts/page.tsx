"use client";

import { InventoryTakeEditor } from "@/components/stock/inventory-take-editor";
import { PageHeader } from "@/components/dashboard/page-header";
import { PageShell } from "@/components/dashboard/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuthStore } from "@/lib/auth-store";
import { api } from "@/lib/api";
import { getUserFacingError } from "@/lib/error-utils";
import { STALE } from "@/lib/query-stale";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

type TakeRow = {
  id: number;
  status: string;
  title: string | null;
  warehouse: { id: number; name: string };
  lines: { product: { id: number; sku: string; name: string }; system_qty: string; counted_qty: string | null }[];
};

function statusBadgeVariant(status: string): "secondary" | "success" | "destructive" | "outline" | "warning" {
  if (status === "posted") return "success";
  if (status === "cancelled") return "destructive";
  if (status === "draft") return "warning";
  return "outline";
}

export default function InventoryCountsPage() {
  const tenantSlug = useAuthStore((s) => s.tenantSlug);
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [warehouseId, setWarehouseId] = useState("");
  const [title, setTitle] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);

  const whQ = useQuery({
    queryKey: ["warehouses", tenantSlug, "inv"],
    enabled: Boolean(tenantSlug),
    staleTime: STALE.reference,
    queryFn: async () => {
      const { data } = await api.get<{ data: { id: number; name: string }[] }>(`/api/${tenantSlug}/warehouses`);
      return data.data.filter((w) => w);
    }
  });

  const warehouses = useMemo(() => whQ.data ?? [], [whQ.data]);

  useEffect(() => {
    if (warehouseId || warehouses.length !== 1) return;
    setWarehouseId(String(warehouses[0].id));
  }, [warehouses, warehouseId]);

  const listQ = useQuery({
    queryKey: ["stock-takes", tenantSlug],
    enabled: Boolean(tenantSlug),
    staleTime: STALE.list,
    queryFn: async () => {
      const { data } = await api.get<{ data: TakeRow[]; total: number }>(
        `/api/${tenantSlug}/stock-takes?limit=40`
      );
      return data.data;
    }
  });

  const createMut = useMutation({
    mutationFn: async () => {
      const wid = Number.parseInt(warehouseId, 10);
      const { data } = await api.post<{ data: TakeRow }>(`/api/${tenantSlug}/stock-takes`, {
        warehouse_id: wid,
        title: title.trim() || null
      });
      return data.data;
    },
    onSuccess: async (row) => {
      setTitle("");
      setCreateError(null);
      await qc.invalidateQueries({ queryKey: ["stock-takes", tenantSlug] });
      setSelectedId(row.id);
    },
    onError: (e) => setCreateError(getUserFacingError(e, "Не удалось создать документ"))
  });

  return (
    <PageShell>
      <PageHeader
        title="Инвентаризация"
        description="Черновик: добавьте товары, укажите фактические количества, сохраните строки (фиксируются остатки в системе), затем проведите документ — склад обновится."
      />
      <div className="orders-hub-section orders-hub-section--table mb-6">
        <Card className="overflow-hidden rounded-none border-0 bg-transparent shadow-none hover:shadow-none">
          <CardContent className="p-0">
            <div className="grid gap-0 lg:grid-cols-2 lg:divide-x lg:divide-border">
              <div className="space-y-3 p-4 sm:p-5">
                <h2 className="text-sm font-semibold">Новый документ</h2>
                {createError ? (
                  <p className="text-sm text-destructive">{createError}</p>
                ) : null}
                <div className="space-y-2">
                  <Label>Склад</Label>
                  <select
                    className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                    value={warehouseId}
                    onChange={(e) => {
                      setWarehouseId(e.target.value);
                      setCreateError(null);
                    }}
                  >
                    <option value="">—</option>
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                      </option>
                    ))}
                  </select>
                </div>
                <Input
                  placeholder="Название (необязательно)"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
                <Button
                  type="button"
                  disabled={!warehouseId || createMut.isPending}
                  onClick={() => void createMut.mutate()}
                >
                  Создать черновик
                </Button>
              </div>
              <div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="app-table-thead">
                      <tr>
                        <th className="px-3 py-2 text-left">ID</th>
                        <th className="px-3 py-2 text-left">Склад</th>
                        <th className="px-3 py-2 text-left">Название</th>
                        <th className="px-3 py-2 text-left">Статус</th>
                        <th className="px-3 py-2 text-right" />
                      </tr>
                    </thead>
                    <tbody>
                      {(listQ.data ?? []).map((t) => (
                        <tr key={t.id} className="border-t border-border/80">
                          <td className="px-3 py-2">{t.id}</td>
                          <td className="px-3 py-2">{t.warehouse.name}</td>
                          <td
                            className="max-w-[140px] truncate px-3 py-2 text-muted-foreground"
                            title={t.title ?? ""}
                          >
                            {t.title ?? "—"}
                          </td>
                          <td className="px-3 py-2">
                            <Badge variant={statusBadgeVariant(t.status)}>{t.status}</Badge>
                          </td>
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
                {listQ.data?.length === 0 ? (
                  <p className="text-muted-foreground border-t border-border/80 px-3 py-4 text-center text-sm">
                    Нет документов
                  </p>
                ) : null}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {selectedId != null && tenantSlug ? (
        <InventoryTakeEditor tenantSlug={tenantSlug} takeId={selectedId} onClose={() => setSelectedId(null)} />
      ) : null}
    </PageShell>
  );
}
