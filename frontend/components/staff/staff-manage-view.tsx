"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";
import { FilterSelect } from "@/components/ui/filter-select";
import { Input } from "@/components/ui/input";
import Link from "next/link";

export type StaffKind = "agent" | "expeditor" | "supervisor";

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
  supervisor_user_id: number | null;
  supervisor_name: string | null;
  supervisee_count: number;
  supervisees?: Array<{ id: number; fio: string; code: string | null }>;
};

type Props = {
  kind: StaffKind;
  tenantSlug: string;
};

function listSegment(kind: StaffKind): string {
  if (kind === "agent") return "agents";
  if (kind === "supervisor") return "supervisors";
  return "expeditors";
}

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
  "Клиенты",
  "Супервайзер"
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

const supervisorColumns = ["Ф.И.О", "Логин", "Телефон", "Агентлар", "Holat"];

export function StaffManageView({ kind, tenantSlug }: Props) {
  const [search, setSearch] = useState("");
  const qc = useQueryClient();
  const seg = listSegment(kind);

  const newHref =
    kind === "agent"
      ? "/settings/spravochnik/agents/new"
      : kind === "supervisor"
        ? "/settings/spravochnik/supervisors/new"
        : "/settings/spravochnik/expeditors/new";

  const listQ = useQuery({
    queryKey: [kind, tenantSlug],
    queryFn: async () => {
      const { data } = await api.get<{ data: StaffRow[] }>(`/api/${tenantSlug}/${seg}`);
      return data.data;
    }
  });

  const supervisorsQ = useQuery({
    queryKey: ["supervisors", tenantSlug, "staff-agent-dropdown"],
    enabled: kind === "agent" && Boolean(tenantSlug),
    queryFn: async () => {
      const { data } = await api.get<{ data: StaffRow[] }>(`/api/${tenantSlug}/supervisors`);
      return data.data;
    }
  });

  const supervisorMut = useMutation({
    mutationFn: async (vars: { agentId: number; supervisor_user_id: number | null }) => {
      const { data } = await api.patch<StaffRow>(
        `/api/${tenantSlug}/agents/${vars.agentId}`,
        { supervisor_user_id: vars.supervisor_user_id }
      );
      return data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [kind, tenantSlug] });
      void qc.invalidateQueries({ queryKey: ["supervisors", tenantSlug, "clients-toolbar"] });
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

  const columns = kind === "agent" ? agentColumns : kind === "supervisor" ? supervisorColumns : expeditorColumns;

  const addLabel =
    kind === "agent" ? "Добавить агент" : kind === "supervisor" ? "Добавить супервайзер" : "Добавить";

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
          {addLabel}
        </Link>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table
          className={cn("w-full text-xs", kind === "supervisor" ? "min-w-[32rem]" : "min-w-[1200px]")}
        >
          <thead className="bg-muted/50">
            <tr>
              {columns.map((c) => (
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
                    <td className="min-w-[12rem] px-2 py-2">
                      <FilterSelect
                        className="h-8 min-w-[10rem] max-w-[14rem] rounded-md border border-input bg-background px-2 text-xs disabled:opacity-50"
                        aria-label="Супервайзер"
                        emptyLabel="Супервайзер"
                        disabled={supervisorMut.isPending || supervisorsQ.isLoading}
                        value={r.supervisor_user_id != null ? String(r.supervisor_user_id) : ""}
                        onChange={(e) => {
                          const raw = e.target.value;
                          const supervisor_user_id = raw === "" ? null : Number.parseInt(raw, 10);
                          supervisorMut.mutate({ agentId: r.id, supervisor_user_id });
                        }}
                      >
                        {(supervisorsQ.data ?? []).filter((u) => u.is_active).map((u) => (
                          <option key={u.id} value={String(u.id)}>
                            {u.fio} ({u.login})
                          </option>
                        ))}
                      </FilterSelect>
                    </td>
                  </>
                ) : kind === "supervisor" ? (
                  <>
                    <td className="px-2 py-2">{r.fio}</td>
                    <td className="px-2 py-2 font-mono">{r.login}</td>
                    <td className="px-2 py-2">{r.phone ?? "—"}</td>
                    <td className="px-2 py-2">{r.supervisee_count}</td>
                    <td className="px-2 py-2">{r.is_active ? "Faol" : "Nofaol"}</td>
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
