"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import Link from "next/link";

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
  const [search, setSearch] = useState("");

  const newHref = kind === "agent" ? "/settings/spravochnik/agents/new" : "/settings/spravochnik/expeditors/new";

  const listQ = useQuery({
    queryKey: [kind, tenantSlug],
    queryFn: async () => {
      const { data } = await api.get<{ data: StaffRow[] }>(
        `/api/${tenantSlug}/${kind === "agent" ? "agents" : "expeditors"}`
      );
      return data.data;
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
        <Link href={newHref} className={cn(buttonVariants({ size: "sm" }))}>
          {kind === "agent" ? "Добавить агент" : "Добавить"}
        </Link>
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
    </div>
  );
}
