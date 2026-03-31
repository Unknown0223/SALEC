"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Kind = "agent" | "expeditor";

type StaffRow = {
  id: number;
  fio: string;
  product: string | null;
  agent_type: string | null;
  code: string | null;
  pinfl: string | null;
  consignment: boolean;
  apk_version: string | null;
  device_name: string | null;
  last_sync_at: string | null;
  phone: string | null;
  can_authorize: boolean;
  price_type: string | null;
  warehouse: string | null;
  trade_direction: string | null;
  branch: string | null;
  position: string | null;
  created_at: string;
  app_access: boolean;
  territory: string | null;
  login: string;
  is_active: boolean;
  client_count: number;
};

type Props = {
  kind: Kind;
  tenantSlug: string;
};

const agentColumns = [
  "Ф.И.О",
  "Продукт",
  "Тип агента",
  "Код",
  "ПИНФЛ",
  "Консигнация",
  "Версия APK",
  "Название устройства",
  "Последняя синхронизация",
  "Телефон",
  "Авторизоваться",
  "Тип цены",
  "Склад",
  "Направление торговли",
  "Филиал",
  "Должность",
  "Дата создания",
  "Доступ к приложение",
  "Клиенты"
];

const expeditorColumns = [
  "Ф.И.О",
  "Авторизоваться",
  "Телефон",
  "Код",
  "Склад",
  "Версия APK",
  "ПИНФЛ",
  "Территория",
  "Название устройства",
  "Последняя синхронизация",
  "Филиал",
  "Должность",
  "Доступ к приложение"
];

export function StaffManageView({ kind, tenantSlug }: Props) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    middle_name: "",
    phone: "",
    territory: "",
    code: "",
    pinfl: "",
    branch: "",
    position: "",
    login: "",
    password: "",
    product: "",
    agent_type: "",
    price_type: "",
    trade_direction: "",
    warehouse_id: "",
    return_warehouse_id: "",
    can_authorize: true,
    app_access: true,
    consignment: false
  });

  const warehousesQ = useQuery({
    queryKey: ["warehouses", tenantSlug, "staff"],
    queryFn: async () => {
      const { data } = await api.get<{ data: { id: number; name: string }[] }>(`/api/${tenantSlug}/warehouses`);
      return data.data;
    }
  });

  const listQ = useQuery({
    queryKey: [kind, tenantSlug],
    queryFn: async () => {
      const { data } = await api.get<{ data: StaffRow[] }>(`/api/${tenantSlug}/${kind === "agent" ? "agents" : "expeditors"}`);
      return data.data;
    }
  });

  const createMut = useMutation({
    mutationFn: async () => {
      await api.post(`/api/${tenantSlug}/${kind === "agent" ? "agents" : "expeditors"}`, {
        first_name: form.first_name,
        last_name: form.last_name || null,
        middle_name: form.middle_name || null,
        phone: form.phone || null,
        territory: form.territory || null,
        code: form.code || null,
        pinfl: form.pinfl || null,
        branch: form.branch || null,
        position: form.position || null,
        login: form.login,
        password: form.password,
        product: form.product || null,
        agent_type: form.agent_type || null,
        price_type: form.price_type || null,
        trade_direction: form.trade_direction || null,
        warehouse_id: form.warehouse_id ? Number.parseInt(form.warehouse_id, 10) : null,
        return_warehouse_id: form.return_warehouse_id ? Number.parseInt(form.return_warehouse_id, 10) : null,
        can_authorize: form.can_authorize,
        app_access: form.app_access,
        consignment: form.consignment
      });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: [kind, tenantSlug] });
      setOpen(false);
      setForm({
        first_name: "",
        last_name: "",
        middle_name: "",
        phone: "",
        territory: "",
        code: "",
        pinfl: "",
        branch: "",
        position: "",
        login: "",
        password: "",
        product: "",
        agent_type: "",
        price_type: "",
        trade_direction: "",
        warehouse_id: "",
        return_warehouse_id: "",
        can_authorize: true,
        app_access: true,
        consignment: false
      });
    }
  });

  const rows = useMemo(() => {
    const source = listQ.data ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return source;
    return source.filter((r) =>
      [r.fio, r.phone ?? "", r.code ?? "", r.login, r.territory ?? "", r.branch ?? ""].join(" ").toLowerCase().includes(q)
    );
  }, [listQ.data, search]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Qidiruv..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <Button size="sm" onClick={() => setOpen(true)}>
          {kind === "agent" ? "Добавить агент" : "Добавить"}
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="min-w-[1200px] w-full text-xs">
          <thead className="bg-muted/50">
            <tr>
              {(kind === "agent" ? agentColumns : expeditorColumns).map((c) => (
                <th key={c} className="px-2 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t">
                {kind === "agent" ? (
                  <>
                    <td className="px-2 py-2">{r.fio}</td>
                    <td className="px-2 py-2">{r.product ?? "—"}</td>
                    <td className="px-2 py-2">{r.agent_type ?? "—"}</td>
                    <td className="px-2 py-2">{r.code ?? "—"}</td>
                    <td className="px-2 py-2">{r.pinfl ?? "—"}</td>
                    <td className="px-2 py-2">{r.consignment ? "Да" : "Нет"}</td>
                    <td className="px-2 py-2">{r.apk_version ?? "—"}</td>
                    <td className="px-2 py-2">{r.device_name ?? "—"}</td>
                    <td className="px-2 py-2">{r.last_sync_at ? new Date(r.last_sync_at).toLocaleString() : "—"}</td>
                    <td className="px-2 py-2">{r.phone ?? "—"}</td>
                    <td className="px-2 py-2">{r.can_authorize ? "Да" : "Нет"}</td>
                    <td className="px-2 py-2">{r.price_type ?? "—"}</td>
                    <td className="px-2 py-2">{r.warehouse ?? "—"}</td>
                    <td className="px-2 py-2">{r.trade_direction ?? "—"}</td>
                    <td className="px-2 py-2">{r.branch ?? "—"}</td>
                    <td className="px-2 py-2">{r.position ?? "—"}</td>
                    <td className="px-2 py-2">{new Date(r.created_at).toLocaleDateString()}</td>
                    <td className="px-2 py-2">{r.app_access ? "Да" : "Нет"}</td>
                    <td className="px-2 py-2">{r.client_count}</td>
                  </>
                ) : (
                  <>
                    <td className="px-2 py-2">{r.fio}</td>
                    <td className="px-2 py-2">{r.can_authorize ? "Да" : "Нет"}</td>
                    <td className="px-2 py-2">{r.phone ?? "—"}</td>
                    <td className="px-2 py-2">{r.code ?? "—"}</td>
                    <td className="px-2 py-2">{r.warehouse ?? "—"}</td>
                    <td className="px-2 py-2">{r.apk_version ?? "—"}</td>
                    <td className="px-2 py-2">{r.pinfl ?? "—"}</td>
                    <td className="px-2 py-2">{r.territory ?? "—"}</td>
                    <td className="px-2 py-2">{r.device_name ?? "—"}</td>
                    <td className="px-2 py-2">{r.last_sync_at ? new Date(r.last_sync_at).toLocaleString() : "—"}</td>
                    <td className="px-2 py-2">{r.branch ?? "—"}</td>
                    <td className="px-2 py-2">{r.position ?? "—"}</td>
                    <td className="px-2 py-2">{r.app_access ? "Да" : "Нет"}</td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Добавить</DialogTitle>
          </DialogHeader>
          <div className="grid gap-2">
            <Input placeholder="Имя" value={form.first_name} onChange={(e) => setForm((p) => ({ ...p, first_name: e.target.value }))} />
            <Input placeholder="Фамилия" value={form.last_name} onChange={(e) => setForm((p) => ({ ...p, last_name: e.target.value }))} />
            <Input placeholder="Отчество" value={form.middle_name} onChange={(e) => setForm((p) => ({ ...p, middle_name: e.target.value }))} />
            <Input placeholder="Телефон" value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} />
            <Input placeholder="Территория" value={form.territory} onChange={(e) => setForm((p) => ({ ...p, territory: e.target.value }))} />
            <select className="h-9 rounded-md border px-2 text-sm" value={form.warehouse_id} onChange={(e) => setForm((p) => ({ ...p, warehouse_id: e.target.value }))}>
              <option value="">Склад</option>
              {(warehousesQ.data ?? []).map((w) => (
                <option key={w.id} value={String(w.id)}>{w.name}</option>
              ))}
            </select>
            <Input placeholder="Код" value={form.code} onChange={(e) => setForm((p) => ({ ...p, code: e.target.value }))} />
            <Input placeholder="ПИНФЛ" value={form.pinfl} onChange={(e) => setForm((p) => ({ ...p, pinfl: e.target.value }))} />
            <Input placeholder="Филиал" value={form.branch} onChange={(e) => setForm((p) => ({ ...p, branch: e.target.value }))} />
            <Input placeholder="Должность" value={form.position} onChange={(e) => setForm((p) => ({ ...p, position: e.target.value }))} />
            <Input placeholder="Логин" value={form.login} onChange={(e) => setForm((p) => ({ ...p, login: e.target.value }))} />
            <Input placeholder="Пароль" type="password" value={form.password} onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))} />
            {kind === "agent" ? (
              <>
                <Input placeholder="Продукт" value={form.product} onChange={(e) => setForm((p) => ({ ...p, product: e.target.value }))} />
                <Input placeholder="Тип агента" value={form.agent_type} onChange={(e) => setForm((p) => ({ ...p, agent_type: e.target.value }))} />
                <Input placeholder="Тип цены" value={form.price_type} onChange={(e) => setForm((p) => ({ ...p, price_type: e.target.value }))} />
              </>
            ) : null}
            <div className="flex items-center justify-between text-xs">
              <label className="inline-flex items-center gap-2">
                <input type="checkbox" checked={form.can_authorize} onChange={(e) => setForm((p) => ({ ...p, can_authorize: e.target.checked }))} />
                Активный
              </label>
              <label className="inline-flex items-center gap-2">
                <input type="checkbox" checked={form.app_access} onChange={(e) => setForm((p) => ({ ...p, app_access: e.target.checked }))} />
                Доступ к приложение
              </label>
            </div>
            <Button onClick={() => createMut.mutate()} disabled={createMut.isPending}>
              {createMut.isPending ? "Сохранение..." : "Добавить"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
