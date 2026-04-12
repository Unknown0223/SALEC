"use client";

import { buttonVariants } from "@/components/ui/button-variants";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { STALE } from "@/lib/query-stale";
import { cn } from "@/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PlusCircle } from "lucide-react";
import { useState } from "react";

export type ClientEquipmentRow = {
  id: number;
  inventory_type: string;
  equipment_kind: string | null;
  serial_number: string | null;
  inventory_number: string | null;
  assigned_at: string;
  removed_at: string | null;
  note: string | null;
};

type Split = { active: ClientEquipmentRow[]; removed: ClientEquipmentRow[] };

function fmtShort(iso: string) {
  try {
    return new Date(iso).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
}

export function ClientProfileEquipmentTab({ tenantSlug, clientId }: { tenantSlug: string; clientId: number }) {
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [inventoryType, setInventoryType] = useState("");
  const [equipmentKind, setEquipmentKind] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [inventoryNumber, setInventoryNumber] = useState("");
  const [note, setNote] = useState("");

  const listQ = useQuery({
    queryKey: ["client-equipment", tenantSlug, clientId],
    staleTime: STALE.list,
    queryFn: async () => {
      const { data } = await api.get<Split>(`/api/${tenantSlug}/clients/${clientId}/equipment`);
      return data;
    }
  });

  const createM = useMutation({
    mutationFn: async () => {
      const { data } = await api.post<ClientEquipmentRow>(`/api/${tenantSlug}/clients/${clientId}/equipment`, {
        inventory_type: inventoryType.trim(),
        equipment_kind: equipmentKind.trim() || null,
        serial_number: serialNumber.trim() || null,
        inventory_number: inventoryNumber.trim() || null,
        note: note.trim() || null
      });
      return data;
    },
    onSuccess: () => {
      setAddOpen(false);
      setInventoryType("");
      setEquipmentKind("");
      setSerialNumber("");
      setInventoryNumber("");
      setNote("");
      void qc.invalidateQueries({ queryKey: ["client-equipment", tenantSlug, clientId] });
    }
  });

  const removeM = useMutation({
    mutationFn: async (equipmentId: number) => {
      await api.post(`/api/${tenantSlug}/clients/${clientId}/equipment/${equipmentId}/remove`, {});
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["client-equipment", tenantSlug, clientId] });
    }
  });

  const active = listQ.data?.active ?? [];
  const removed = listQ.data?.removed ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">Инвентарь у клиента</p>
        <button
          type="button"
          className={cn(buttonVariants({ size: "sm" }), "gap-1.5 bg-teal-600 text-white hover:bg-teal-700")}
          onClick={() => setAddOpen((v) => !v)}
        >
          <PlusCircle className="h-4 w-4" />
          Добавить
        </button>
      </div>

      {addOpen ? (
        <Card className="border border-border/90 shadow-panel">
          <CardContent className="grid gap-3 p-3 sm:grid-cols-2 sm:p-4">
            <div className="space-y-1 sm:col-span-2">
              <Label className="text-xs">Тип инвентаря *</Label>
              <Input
                className="h-9"
                value={inventoryType}
                onChange={(e) => setInventoryType(e.target.value)}
                placeholder="Напр. холодильник, стенд"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Тип / категория</Label>
              <Input className="h-9" value={equipmentKind} onChange={(e) => setEquipmentKind(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Серийный номер</Label>
              <Input className="h-9" value={serialNumber} onChange={(e) => setSerialNumber(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Инвентарный №</Label>
              <Input className="h-9" value={inventoryNumber} onChange={(e) => setInventoryNumber(e.target.value)} />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label className="text-xs">Примечание</Label>
              <Input className="h-9" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
            <div className="flex flex-wrap gap-2 sm:col-span-2">
              <button
                type="button"
                className={cn(buttonVariants({ size: "sm" }), "bg-teal-600 text-white hover:bg-teal-700")}
                disabled={!inventoryType.trim() || createM.isPending}
                onClick={() => void createM.mutateAsync()}
              >
                Сохранить
              </button>
              <button type="button" className={cn(buttonVariants({ variant: "outline", size: "sm" }))} onClick={() => setAddOpen(false)}>
                Отмена
              </button>
              {createM.isError ? <span className="text-xs text-destructive">Ошибка сохранения</span> : null}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card className="border border-border/90 shadow-panel">
        <CardContent className="p-0">
          <p className="border-b border-border/70 px-3 py-2 text-xs font-semibold text-muted-foreground">Активные</p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50 text-left text-xs text-muted-foreground">
                  <th className="px-3 py-2">№</th>
                  <th className="px-3 py-2">Тип инвентаря</th>
                  <th className="px-3 py-2">Тип</th>
                  <th className="px-3 py-2">Дата</th>
                  <th className="px-3 py-2">Серийный</th>
                  <th className="px-3 py-2">Инв. №</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {listQ.isLoading ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-6 text-center text-muted-foreground">
                      Загрузка…
                    </td>
                  </tr>
                ) : active.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-6 text-center text-muted-foreground">
                      Пусто
                    </td>
                  </tr>
                ) : (
                  active.map((r, i) => (
                    <tr key={r.id} className="border-b border-border/80">
                      <td className="px-3 py-2 text-xs">{i + 1}</td>
                      <td className="px-3 py-2 text-xs font-medium">{r.inventory_type}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{r.equipment_kind ?? "—"}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">{fmtShort(r.assigned_at)}</td>
                      <td className="px-3 py-2 font-mono text-xs">{r.serial_number ?? "—"}</td>
                      <td className="px-3 py-2 font-mono text-xs">{r.inventory_number ?? "—"}</td>
                      <td className="px-2 py-2">
                        <button
                          type="button"
                          className={cn(buttonVariants({ variant: "outline", size: "sm" }), "text-xs")}
                          disabled={removeM.isPending}
                          onClick={() => {
                            if (confirm("Отметить изъятием?")) void removeM.mutateAsync(r.id);
                          }}
                        >
                          Изъять
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card className="border border-border/90 shadow-panel">
        <CardContent className="p-0">
          <p className="border-b border-border/70 px-3 py-2 text-xs font-semibold text-muted-foreground">Изъятие</p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50 text-left text-xs text-muted-foreground">
                  <th className="px-3 py-2">№</th>
                  <th className="px-3 py-2">Тип инвентаря</th>
                  <th className="px-3 py-2">Тип</th>
                  <th className="px-3 py-2">Выдан</th>
                  <th className="px-3 py-2">Дата изъятия</th>
                  <th className="px-3 py-2">Серийный</th>
                  <th className="px-3 py-2">Инв. №</th>
                </tr>
              </thead>
              <tbody>
                {listQ.isLoading ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-6 text-center text-muted-foreground">
                      …
                    </td>
                  </tr>
                ) : removed.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-6 text-center text-muted-foreground">
                      Пусто
                    </td>
                  </tr>
                ) : (
                  removed.map((r, i) => (
                    <tr key={r.id} className="border-b border-border/80">
                      <td className="px-3 py-2 text-xs">{i + 1}</td>
                      <td className="px-3 py-2 text-xs font-medium">{r.inventory_type}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{r.equipment_kind ?? "—"}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">{fmtShort(r.assigned_at)}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">
                        {r.removed_at ? fmtShort(r.removed_at) : "—"}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">{r.serial_number ?? "—"}</td>
                      <td className="px-3 py-2 font-mono text-xs">{r.inventory_number ?? "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
