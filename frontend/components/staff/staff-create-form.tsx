"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/dashboard/page-header";

type Kind = "agent" | "expeditor";

type Props = {
  kind: Kind;
  tenantSlug: string;
  onSuccess: () => void;
  onCancel: () => void;
};

const emptyForm = {
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
};

export function StaffCreateForm({ kind, tenantSlug, onSuccess, onCancel }: Props) {
  const qc = useQueryClient();
  const [form, setForm] = useState(emptyForm);

  const warehousesQ = useQuery({
    queryKey: ["warehouses", tenantSlug, "staff-create"],
    queryFn: async () => {
      const { data } = await api.get<{ data: { id: number; name: string }[] }>(`/api/${tenantSlug}/warehouses`);
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
      setForm(emptyForm);
      onSuccess();
    }
  });

  const title = kind === "agent" ? "Yangi agent" : "Yangi ekseditor";

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 pb-10">
      <PageHeader
        title={title}
        description="To‘liq sahifada qo‘shish"
        actions={
          <Button type="button" variant="outline" size="sm" onClick={onCancel}>
            Orqaga
          </Button>
        }
      />

      <div className="grid gap-2">
        <Input
          placeholder="Имя"
          value={form.first_name}
          onChange={(e) => setForm((p) => ({ ...p, first_name: e.target.value }))}
        />
        <Input
          placeholder="Фамилия"
          value={form.last_name}
          onChange={(e) => setForm((p) => ({ ...p, last_name: e.target.value }))}
        />
        <Input
          placeholder="Отчество"
          value={form.middle_name}
          onChange={(e) => setForm((p) => ({ ...p, middle_name: e.target.value }))}
        />
        <Input placeholder="Телефон" value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} />
        <Input
          placeholder="Территория"
          value={form.territory}
          onChange={(e) => setForm((p) => ({ ...p, territory: e.target.value }))}
        />
        <select
          className="h-9 rounded-md border px-2 text-sm"
          value={form.warehouse_id}
          onChange={(e) => setForm((p) => ({ ...p, warehouse_id: e.target.value }))}
        >
          <option value="">Склад</option>
          {(warehousesQ.data ?? []).map((w) => (
            <option key={w.id} value={String(w.id)}>
              {w.name}
            </option>
          ))}
        </select>
        <Input placeholder="Код" value={form.code} onChange={(e) => setForm((p) => ({ ...p, code: e.target.value }))} />
        <Input placeholder="ПИНФЛ" value={form.pinfl} onChange={(e) => setForm((p) => ({ ...p, pinfl: e.target.value }))} />
        <Input placeholder="Филиал" value={form.branch} onChange={(e) => setForm((p) => ({ ...p, branch: e.target.value }))} />
        <Input
          placeholder="Должность"
          value={form.position}
          onChange={(e) => setForm((p) => ({ ...p, position: e.target.value }))}
        />
        <Input placeholder="Логин" value={form.login} onChange={(e) => setForm((p) => ({ ...p, login: e.target.value }))} />
        <Input
          placeholder="Пароль"
          type="password"
          value={form.password}
          onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
        />
        {kind === "agent" ? (
          <>
            <Input
              placeholder="Продукт"
              value={form.product}
              onChange={(e) => setForm((p) => ({ ...p, product: e.target.value }))}
            />
            <Input
              placeholder="Тип агента"
              value={form.agent_type}
              onChange={(e) => setForm((p) => ({ ...p, agent_type: e.target.value }))}
            />
            <Input
              placeholder="Тип цены"
              value={form.price_type}
              onChange={(e) => setForm((p) => ({ ...p, price_type: e.target.value }))}
            />
          </>
        ) : null}
        <div className="flex items-center justify-between text-xs">
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.can_authorize}
              onChange={(e) => setForm((p) => ({ ...p, can_authorize: e.target.checked }))}
            />
            Активный
          </label>
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.app_access}
              onChange={(e) => setForm((p) => ({ ...p, app_access: e.target.checked }))}
            />
            Доступ к приложение
          </label>
        </div>
        <Button onClick={() => createMut.mutate()} disabled={createMut.isPending}>
          {createMut.isPending ? "Сохранение..." : "Добавить"}
        </Button>
      </div>
    </div>
  );
}
