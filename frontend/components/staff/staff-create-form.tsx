"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { STALE } from "@/lib/query-stale";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/dashboard/page-header";
import { FilterSelect } from "@/components/ui/filter-select";
import { messageFromStaffCreateError } from "@/lib/staff-api-errors";

type Kind = "agent" | "expeditor" | "supervisor";

type Props = {
  kind: Kind;
  tenantSlug: string;
  onSuccess: () => void;
  onCancel: () => void;
};

type TenantProfile = {
  references: {
    branches?: Array<{ id: string; name: string; active?: boolean }>;
  };
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
  trade_direction_id: "",
  warehouse_id: "",
  return_warehouse_id: "",
  can_authorize: true,
  app_access: true,
  consignment: false
};

export function StaffCreateForm({ kind, tenantSlug, onSuccess, onCancel }: Props) {
  const qc = useQueryClient();
  const [form, setForm] = useState(emptyForm);
  const [localError, setLocalError] = useState<string | null>(null);

  const warehousesQ = useQuery({
    queryKey: ["warehouses", tenantSlug, "staff-create"],
    enabled: kind !== "supervisor",
    staleTime: STALE.reference,
    queryFn: async () => {
      const { data } = await api.get<{ data: { id: number; name: string }[] }>(`/api/${tenantSlug}/warehouses`);
      return data.data;
    }
  });

  const branchesQ = useQuery({
    queryKey: ["settings", "profile", tenantSlug, "staff-create-branches"],
    enabled: Boolean(tenantSlug) && kind !== "supervisor",
    staleTime: STALE.profile,
    queryFn: async () => {
      const { data } = await api.get<TenantProfile>(`/api/${tenantSlug}/settings/profile`);
      return (data.references.branches ?? []).filter((b) => b.active !== false);
    }
  });

  const priceTypesQ = useQuery({
    queryKey: ["price-types", tenantSlug, "staff-create"],
    enabled: Boolean(tenantSlug) && kind === "agent",
    staleTime: STALE.reference,
    queryFn: async () => {
      const { data } = await api.get<{ data: string[] }>(`/api/${tenantSlug}/price-types?kind=sale`);
      return data.data;
    }
  });

  const tradeDirectionsQ = useQuery({
    queryKey: ["trade-directions", tenantSlug, "staff-create"],
    enabled: Boolean(tenantSlug) && (kind === "agent" || kind === "expeditor"),
    staleTime: STALE.reference,
    queryFn: async () => {
      const { data } = await api.get<{
        data: Array<{ id: number; name: string; code: string | null }>;
      }>(`/api/${tenantSlug}/trade-directions?is_active=true`);
      return data.data;
    }
  });

  const createMut = useMutation({
    mutationFn: async () => {
      const path =
        kind === "agent" ? "agents" : kind === "supervisor" ? "supervisors" : "expeditors";
      await api.post(`/api/${tenantSlug}/${path}`, {
        first_name: form.first_name,
        last_name: form.last_name || null,
        middle_name: form.middle_name || null,
        phone: form.phone || null,
        territory: kind === "supervisor" ? null : form.territory || null,
        code: kind === "supervisor" ? null : form.code || null,
        pinfl: kind === "supervisor" ? null : form.pinfl || null,
        branch: kind === "supervisor" ? null : form.branch || null,
        position: kind === "supervisor" ? null : form.position || null,
        login: form.login,
        password: form.password,
        product: kind === "supervisor" ? null : form.product || null,
        agent_type: kind === "supervisor" ? null : form.agent_type || null,
        price_type: kind === "supervisor" ? null : form.price_type || null,
        trade_direction_id:
          kind === "supervisor"
            ? null
            : form.trade_direction_id.trim()
              ? Number.parseInt(form.trade_direction_id.trim(), 10)
              : null,
        warehouse_id:
          kind === "supervisor" ? null : form.warehouse_id ? Number.parseInt(form.warehouse_id, 10) : null,
        return_warehouse_id:
          kind === "supervisor"
            ? null
            : form.return_warehouse_id
              ? Number.parseInt(form.return_warehouse_id, 10)
              : null,
        can_authorize: form.can_authorize,
        app_access: kind === "supervisor" ? true : form.app_access,
        consignment: kind === "supervisor" ? false : form.consignment
      });
    },
    onSuccess: async () => {
      setLocalError(null);
      await qc.invalidateQueries({ queryKey: [kind, tenantSlug] });
      if (kind === "supervisor") {
        await qc.invalidateQueries({ queryKey: ["supervisors", tenantSlug, "clients-toolbar"] });
      }
      setForm(emptyForm);
      onSuccess();
    },
    onError: (e: Error) => {
      const m = messageFromStaffCreateError(e);
      setLocalError(m ?? e.message ?? "Xatolik");
    }
  });

  const title =
    kind === "agent" ? "Yangi agent" : kind === "supervisor" ? "Yangi supervizor" : "Yangi ekseditor";

  if (kind === "supervisor") {
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-6 pb-10">
        <PageHeader
          title={title}
          description="Faqat kirish uchun kerakli maydonlar"
          actions={
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" size="sm" onClick={onCancel}>
                Orqaga
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={createMut.isPending}
                onClick={() => {
                  setLocalError(null);
                  createMut.mutate();
                }}
              >
                {createMut.isPending ? "Saqlanmoqda…" : "Qo‘shish"}
              </Button>
            </div>
          }
        />
        {localError ? (
          <p className="text-sm text-destructive" role="alert">
            {localError}
          </p>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            className="sm:col-span-2"
            placeholder="Ism *"
            value={form.first_name}
            onChange={(e) => setForm((p) => ({ ...p, first_name: e.target.value }))}
          />
          <Input
            placeholder="Familiya"
            value={form.last_name}
            onChange={(e) => setForm((p) => ({ ...p, last_name: e.target.value }))}
          />
          <Input
            placeholder="Telefon"
            value={form.phone}
            onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
          />
          <Input
            className="font-mono sm:col-span-2"
            placeholder="Login *"
            value={form.login}
            onChange={(e) => setForm((p) => ({ ...p, login: e.target.value }))}
            autoComplete="off"
          />
          <Input
            className="sm:col-span-2"
            placeholder="Parol * (min. 6)"
            type="password"
            value={form.password}
            onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
            autoComplete="new-password"
          />
          <label className="inline-flex items-center gap-2 text-xs sm:col-span-2">
            <input
              type="checkbox"
              checked={form.can_authorize}
              onChange={(e) => setForm((p) => ({ ...p, can_authorize: e.target.checked }))}
            />
            Tizimga kirish ruxsati
          </label>
          <p className="text-xs text-muted-foreground sm:col-span-2">
            Agentlar ro‘yxatida «Супервайзер» ustunidan ushbu foydalanuvchini tanlang.
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
          <Button type="button" variant="outline" onClick={onCancel}>
            Bekor
          </Button>
          <Button
            onClick={() => {
              setLocalError(null);
              createMut.mutate();
            }}
            disabled={createMut.isPending}
          >
            {createMut.isPending ? "Saqlanmoqda…" : "Qo‘shish"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 pb-10">
      <PageHeader
        title={title}
        description="To‘liq sahifada qo‘shish"
        actions={
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onCancel}>
              Orqaga
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={createMut.isPending}
              onClick={() => {
                setLocalError(null);
                createMut.mutate();
              }}
            >
              {createMut.isPending ? "Saqlanmoqda…" : "Qo‘shish"}
            </Button>
          </div>
        }
      />

      {localError ? (
        <p className="text-sm text-destructive" role="alert">
          {localError}
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
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
        <select
          className="h-9 rounded-md border px-2 text-sm"
          value={form.branch}
          onChange={(e) => setForm((p) => ({ ...p, branch: e.target.value }))}
        >
          <option value="">Филиал</option>
          {(branchesQ.data ?? []).map((b) => (
            <option key={b.id} value={b.name}>
              {b.name}
            </option>
          ))}
        </select>
        <Input
          placeholder="Должность"
          value={form.position}
          onChange={(e) => setForm((p) => ({ ...p, position: e.target.value }))}
        />
        {kind === "agent" || kind === "expeditor" ? (
          <FilterSelect
            className="h-10 w-full min-w-0 max-w-none rounded-md border border-input bg-background px-2 text-sm sm:col-span-2"
            emptyLabel="Savdo yo‘nalishi (spravochnik)"
            aria-label="Savdo yo‘nalishi"
            value={form.trade_direction_id}
            onChange={(e) => setForm((p) => ({ ...p, trade_direction_id: e.target.value }))}
          >
            {(tradeDirectionsQ.data ?? []).map((t) => (
              <option key={t.id} value={String(t.id)}>
                {t.name}
                {t.code ? ` (${t.code})` : ""}
              </option>
            ))}
          </FilterSelect>
        ) : null}
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
            <FilterSelect
              className="h-10 w-full min-w-0 max-w-none rounded-md border border-input bg-background px-2 text-sm"
              emptyLabel="Тип цены"
              aria-label="Тип цены"
              value={form.price_type}
              onChange={(e) => setForm((p) => ({ ...p, price_type: e.target.value }))}
            >
              {(priceTypesQ.data ?? []).map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </FilterSelect>
          </>
        ) : null}
        <div className="flex items-center justify-between text-xs sm:col-span-2">
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
        {kind === "agent" ? (
          <label className="inline-flex items-center gap-2 text-xs sm:col-span-2">
            <input
              type="checkbox"
              checked={form.consignment}
              onChange={(e) => setForm((p) => ({ ...p, consignment: e.target.checked }))}
            />
            Консигнация
          </label>
        ) : null}
        <div className="flex flex-wrap justify-end gap-2 border-t pt-4 sm:col-span-2">
          <Button type="button" variant="outline" onClick={onCancel}>
            Bekor
          </Button>
          <Button
            onClick={() => {
              setLocalError(null);
              createMut.mutate();
            }}
            disabled={createMut.isPending}
          >
            {createMut.isPending ? "Сохранение..." : "Добавить"}
          </Button>
        </div>
      </div>
    </div>
  );
}
