"use client";

import { PageHeader } from "@/components/dashboard/page-header";
import { PageShell } from "@/components/dashboard/page-shell";
import { TableRowActionGroup } from "@/components/data-table/table-row-actions";
import { SettingsWorkspace } from "@/components/settings/settings-workspace";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FilterSelect } from "@/components/ui/filter-select";
import { api } from "@/lib/api";
import { useAuthStore, useAuthStoreHydrated, useEffectiveRole } from "@/lib/auth-store";
import { cn } from "@/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Pencil, Users } from "lucide-react";

type TerritoryNode = {
  id: string;
  name: string;
  children: TerritoryNode[];
};

type Branch = {
  id: string;
  name: string;
  code?: string | null;
  sort_order?: number | null;
  comment?: string | null;
  active?: boolean;
  territory?: string | null;
  city?: string | null;
  cashbox?: string | null;
  user_links?: { role: string; user_ids: number[] }[];
};

type TenantProfile = {
  references: {
    territory_nodes?: TerritoryNode[];
    branches?: Branch[];
  };
};

type SystemUser = {
  id: number;
  login: string;
  name: string;
  role: string;
};

function newId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `b-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function sortRows(rows: Branch[]): Branch[] {
  return [...rows].sort((a, b) => {
    const ao = typeof a.sort_order === "number" ? a.sort_order : Number.MAX_SAFE_INTEGER;
    const bo = typeof b.sort_order === "number" ? b.sort_order : Number.MAX_SAFE_INTEGER;
    if (ao !== bo) return ao - bo;
    return (a.name || "").toLocaleLowerCase().localeCompare((b.name || "").toLocaleLowerCase());
  });
}

function collectDepth(nodes: TerritoryNode[], depth: number, targetDepth: number, out: Set<string>) {
  for (const n of nodes) {
    if (depth === targetDepth && n.name.trim()) out.add(n.name.trim());
    if (n.children.length) collectDepth(n.children, depth + 1, targetDepth, out);
  }
}

export default function BranchesSettingsPage() {
  const tenantSlug = useAuthStore((s) => s.tenantSlug);
  const hydrated = useAuthStoreHydrated();
  const role = useEffectiveRole();
  const isAdmin = role === "admin";
  const qc = useQueryClient();

  const [tab, setTab] = useState<"active" | "inactive">("active");
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [sortOrder, setSortOrder] = useState("");
  const [comment, setComment] = useState("");
  const [active, setActive] = useState(true);
  const [territory, setTerritory] = useState("");
  const [city, setCity] = useState("");
  const [cashbox, setCashbox] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [usersOpen, setUsersOpen] = useState(false);
  const [usersBranchId, setUsersBranchId] = useState<string | null>(null);
  const [usersSelected, setUsersSelected] = useState<Record<string, Set<number>>>({});
  const [expandedRoles, setExpandedRoles] = useState<Set<string>>(new Set());

  const profileQ = useQuery({
    queryKey: ["settings", "profile", tenantSlug],
    enabled: Boolean(tenantSlug),
    queryFn: async () => {
      const { data } = await api.get<TenantProfile>(`/api/${tenantSlug}/settings/profile`);
      return data;
    }
  });

  const usersQ = useQuery({
    queryKey: ["ref-users", tenantSlug, "branches-users"],
    enabled: Boolean(tenantSlug),
    queryFn: async () => {
      const { data } = await api.get<{ data: SystemUser[] }>(`/api/${tenantSlug}/users`);
      return data.data;
    }
  });

  const rows = useMemo(() => sortRows(profileQ.data?.references?.branches ?? []), [profileQ.data]);
  const filtered = useMemo(() => rows.filter((x) => (tab === "active" ? x.active !== false : x.active === false)), [rows, tab]);

  const territoryOptions = useMemo(() => {
    const roots = new Set<string>();
    collectDepth(profileQ.data?.references?.territory_nodes ?? [], 0, 0, roots);
    return Array.from(roots).sort((a, b) => a.localeCompare(b));
  }, [profileQ.data]);

  const cityOptions = useMemo(() => {
    const cities = new Set<string>();
    const src = profileQ.data?.references?.territory_nodes ?? [];
    collectDepth(src, 0, 1, cities);
    collectDepth(src, 0, 2, cities);
    return Array.from(cities).sort((a, b) => a.localeCompare(b));
  }, [profileQ.data]);

  const usersByRole = useMemo(() => {
    const grouped = new Map<string, SystemUser[]>();
    for (const u of usersQ.data ?? []) {
      const role = (u.role || "other").trim();
      if (!grouped.has(role)) grouped.set(role, []);
      grouped.get(role)!.push(u);
    }
    return Array.from(grouped.entries()).map(([role, list]) => ({
      role,
      users: list.sort((a, b) => a.name.localeCompare(b.name))
    }));
  }, [usersQ.data]);

  const saveMut = useMutation({
    mutationFn: async (next: Branch[]) => {
      if (!tenantSlug) throw new Error("no tenant");
      await api.patch(`/api/${tenantSlug}/settings/profile`, { references: { branches: next } });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["settings", "profile", tenantSlug] });
      setMsg("Saqlandi.");
    },
    onError: () => setMsg("Saqlashda xatolik.")
  });

  function resetForm() {
    setEditId(null);
    setName("");
    setCode("");
    setSortOrder("");
    setComment("");
    setActive(true);
    setTerritory("");
    setCity("");
    setCashbox("");
  }

  function openAdd() {
    resetForm();
    setOpen(true);
  }

  function openEdit(row: Branch) {
    setEditId(row.id);
    setName(row.name ?? "");
    setCode(row.code ?? "");
    setSortOrder(row.sort_order == null ? "" : String(row.sort_order));
    setComment(row.comment ?? "");
    setActive(row.active !== false);
    setTerritory(row.territory ?? "");
    setCity(row.city ?? "");
    setCashbox(row.cashbox ?? "");
    setOpen(true);
  }

  function submitForm() {
    const n = name.trim();
    if (!n) return;
    const normalizedCode = code.trim().toUpperCase();
    const next: Branch = {
      id: editId ?? newId(),
      name: n,
      code: normalizedCode || null,
      sort_order: sortOrder.trim() ? Number(sortOrder.trim()) : null,
      comment: comment.trim() || null,
      active,
      territory: territory.trim() || null,
      city: city.trim() || null,
      cashbox: cashbox.trim() || null
    };
    const merged = editId ? rows.map((x) => (x.id === editId ? next : x)) : [...rows, next];
    saveMut.mutate(sortRows(merged));
    setOpen(false);
    resetForm();
  }

  function openUsersModal(row: Branch) {
    setUsersBranchId(row.id);
    const selected: Record<string, Set<number>> = {};
    for (const link of row.user_links ?? []) {
      selected[link.role] = new Set(link.user_ids);
    }
    setUsersSelected(selected);
    setExpandedRoles(new Set((row.user_links ?? []).map((x) => x.role)));
    setUsersOpen(true);
  }

  function toggleRole(role: string) {
    setExpandedRoles((prev) => {
      const next = new Set(prev);
      if (next.has(role)) next.delete(role);
      else next.add(role);
      return next;
    });
  }

  function toggleUser(role: string, userId: number) {
    setUsersSelected((prev) => {
      const next: Record<string, Set<number>> = { ...prev };
      const set = new Set(next[role] ?? []);
      if (set.has(userId)) set.delete(userId);
      else set.add(userId);
      next[role] = set;
      return next;
    });
  }

  function applyUsersToBranch() {
    if (!usersBranchId) return;
    const links = Object.entries(usersSelected)
      .map(([role, ids]) => ({ role, user_ids: Array.from(ids).sort((a, b) => a - b) }))
      .filter((x) => x.user_ids.length > 0);
    const merged = rows.map((r) => (r.id === usersBranchId ? { ...r, user_links: links } : r));
    saveMut.mutate(sortRows(merged));
    setUsersOpen(false);
    setUsersBranchId(null);
  }

  if (!hydrated) return <PageShell><p className="text-sm text-muted-foreground">Sessiya...</p></PageShell>;
  if (!tenantSlug) return <PageShell><p className="text-sm text-destructive"><Link href="/login" className="underline">Kirish</Link></p></PageShell>;

  return (
    <PageShell className="max-w-6xl">
      <PageHeader
        title="Филиалы"
        description="Filiallar, territoriya/shahar va kassa bog'lanishi."
        actions={
          <div className="flex gap-2">
            <Button size="sm" disabled={!isAdmin} onClick={openAdd}>Добавить</Button>
            <Link href="/settings" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>Katalog</Link>
          </div>
        }
      />

      <SettingsWorkspace>
        <div className="rounded-lg border bg-card p-4">
          <div className="mb-3 flex gap-2">
            <button className={cn("rounded px-3 py-1 text-sm", tab === "active" ? "bg-primary text-primary-foreground" : "bg-muted")} onClick={() => setTab("active")}>Активный</button>
            <button className={cn("rounded px-3 py-1 text-sm", tab === "inactive" ? "bg-primary text-primary-foreground" : "bg-muted")} onClick={() => setTab("inactive")}>Не активный</button>
          </div>

          <div className="overflow-hidden rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">Названия</th>
                  <th className="px-3 py-2 font-medium">Территория</th>
                  <th className="px-3 py-2 font-medium">Город</th>
                  <th className="px-3 py-2 font-medium">Касса</th>
                  <th className="px-3 py-2 font-medium">Сортировка</th>
                  <th className="px-3 py-2 font-medium">Код</th>
                  <th className="px-3 py-2 font-medium">Комментарий</th>
                  <th className="px-3 py-2 font-medium text-right">...</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="px-3 py-2">{r.name}</td>
                    <td className="px-3 py-2">{r.territory ?? "-"}</td>
                    <td className="px-3 py-2">{r.city ?? "-"}</td>
                    <td className="px-3 py-2">{r.cashbox ?? "-"}</td>
                    <td className="px-3 py-2">{r.sort_order ?? "-"}</td>
                    <td className="px-3 py-2">{r.code ?? "-"}</td>
                    <td className="px-3 py-2">{r.comment ?? "-"}</td>
                    <td className="px-3 py-2 text-right">
                      {isAdmin ? (
                        <TableRowActionGroup className="justify-end" ariaLabel="Filial">
                          <Button
                            variant="outline"
                            size="icon-sm"
                            className="text-muted-foreground hover:text-foreground"
                            type="button"
                            title="Foydalanuvchilar"
                            aria-label="Foydalanuvchilar"
                            onClick={() => openUsersModal(r)}
                          >
                            <Users className="size-3.5" aria-hidden />
                          </Button>
                          <Button
                            variant="outline"
                            size="icon-sm"
                            className="text-muted-foreground hover:text-foreground"
                            type="button"
                            title="Tahrirlash"
                            aria-label="Tahrirlash"
                            onClick={() => openEdit(r)}
                          >
                            <Pencil className="size-3.5" aria-hidden />
                          </Button>
                        </TableRowActionGroup>
                      ) : null}
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">Ma'lumot yo'q</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </SettingsWorkspace>

      {msg ? <p className="text-sm text-muted-foreground">{msg}</p> : null}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[460px]" showCloseButton>
          <DialogHeader>
            <DialogTitle>{editId ? "Редактировать" : "Добавить"}</DialogTitle>
            <DialogDescription>Kichik modal: filial + bog'lanishlar.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label>Названия</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>Территория</Label>
              <FilterSelect
                className="h-9 w-full min-w-0 max-w-none rounded-md border border-input bg-background px-2 text-sm"
                emptyLabel="Территория"
                aria-label="Территория"
                value={territory}
                onChange={(e) => setTerritory(e.target.value)}
              >
                {territoryOptions.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </FilterSelect>
            </div>
            <div className="grid gap-1.5">
              <Label>Город</Label>
              <FilterSelect
                className="h-9 w-full min-w-0 max-w-none rounded-md border border-input bg-background px-2 text-sm"
                emptyLabel="Город"
                aria-label="Город"
                value={city}
                onChange={(e) => setCity(e.target.value)}
              >
                {cityOptions.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </FilterSelect>
            </div>
            <div className="grid gap-1.5">
              <Label>Касса</Label>
              <Input value={cashbox} onChange={(e) => setCashbox(e.target.value)} placeholder="Masalan: Kassa-1" />
            </div>
            <div className="grid gap-1.5">
              <div className="flex items-center justify-between">
                <Label>Код</Label>
                <span className="text-xs text-muted-foreground">{code.length} / 20</span>
              </div>
              <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "").slice(0, 20))} />
            </div>
            <div className="grid gap-1.5">
              <Label>Сортировка</Label>
              <Input value={sortOrder} onChange={(e) => setSortOrder(e.target.value.replace(/[^0-9]/g, ""))} inputMode="numeric" />
            </div>
            <div className="grid gap-1.5">
              <Label>Комментарий</Label>
              <textarea className="min-h-[72px] rounded-md border bg-background px-3 py-2 text-sm" value={comment} onChange={(e) => setComment(e.target.value)} />
            </div>
            <label className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
              <span>Активный</span>
              <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            </label>
            <Button onClick={submitForm} disabled={saveMut.isPending || !isAdmin}>{editId ? "Сохранить" : "Добавить"}</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={usersOpen}
        onOpenChange={(o) => {
          setUsersOpen(o);
          if (!o) setUsersBranchId(null);
        }}
      >
        <DialogContent className="max-h-[85vh] sm:max-w-[860px]" showCloseButton>
          <DialogHeader>
            <DialogTitle>Прикрепить пользователей</DialogTitle>
            <DialogDescription>Rol ustiga bosing — hodimlar ro'yxati ochiladi.</DialogDescription>
          </DialogHeader>

          <div className="space-y-2 overflow-y-auto pr-1">
            {usersByRole.map((group) => {
              const isOpen = expandedRoles.has(group.role);
              const selectedCount = usersSelected[group.role]?.size ?? 0;
              return (
                <div key={group.role} className="rounded-md border">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted/40"
                    onClick={() => toggleRole(group.role)}
                  >
                    <div className="flex items-center gap-2">
                      {isOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                      <span className="font-medium">{group.role}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">{selectedCount} tanlangan</span>
                  </button>
                  {isOpen ? (
                    <div className="max-h-56 space-y-1 overflow-y-auto border-t px-3 py-2">
                      {group.users.map((u) => {
                        const checked = usersSelected[group.role]?.has(u.id) ?? false;
                        return (
                          <label key={u.id} className="flex items-center justify-between gap-2 rounded px-2 py-1.5 hover:bg-muted/50">
                            <span className="text-sm">{u.name} <span className="text-xs text-muted-foreground">({u.login})</span></span>
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleUser(group.role, u.id)}
                            />
                          </label>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setUsersOpen(false)}>Отменить</Button>
            <Button type="button" onClick={applyUsersToBranch} disabled={!isAdmin || saveMut.isPending}>Сохранить</Button>
          </div>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}

