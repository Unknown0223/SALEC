"use client";

import { PageHeader } from "@/components/dashboard/page-header";
import { PageShell } from "@/components/dashboard/page-shell";
import { TableRowActionGroup } from "@/components/data-table/table-row-actions";
import { SettingsWorkspace } from "@/components/settings/settings-workspace";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { useAuthStore, useAuthStoreHydrated, useEffectiveRole } from "@/lib/auth-store";
import { cn } from "@/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

type UnitMeasure = {
  id: string;
  name: string;
  title?: string | null;
  code?: string | null;
  sort_order?: number | null;
  comment?: string | null;
  active?: boolean;
};

type TenantProfile = {
  references: {
    unit_measures?: UnitMeasure[];
  };
};

function newId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `u-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function sortUnits(units: UnitMeasure[]): UnitMeasure[] {
  return [...units].sort((a, b) => {
    const ao = typeof a.sort_order === "number" ? a.sort_order : Number.MAX_SAFE_INTEGER;
    const bo = typeof b.sort_order === "number" ? b.sort_order : Number.MAX_SAFE_INTEGER;
    if (ao !== bo) return ao - bo;
    return (a.name || "").toLocaleLowerCase().localeCompare((b.name || "").toLocaleLowerCase());
  });
}

export default function UnitsSettingsPage() {
  const tenantSlug = useAuthStore((s) => s.tenantSlug);
  const hydrated = useAuthStoreHydrated();
  const role = useEffectiveRole();
  const isAdmin = role === "admin";
  const qc = useQueryClient();

  const [tab, setTab] = useState<"active" | "inactive">("active");
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [code, setCode] = useState("");
  const [sortOrder, setSortOrder] = useState("");
  const [comment, setComment] = useState("");
  const [active, setActive] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);

  const profileQ = useQuery({
    queryKey: ["settings", "profile", tenantSlug],
    enabled: Boolean(tenantSlug),
    queryFn: async () => {
      const { data } = await api.get<TenantProfile>(`/api/${tenantSlug}/settings/profile`);
      return data;
    }
  });

  const units = useMemo(() => sortUnits(profileQ.data?.references?.unit_measures ?? []), [profileQ.data]);
  const filtered = useMemo(() => units.filter((x) => (tab === "active" ? x.active !== false : x.active === false)), [units, tab]);

  const saveMut = useMutation({
    mutationFn: async (next: UnitMeasure[]) => {
      if (!tenantSlug) throw new Error("no tenant");
      await api.patch(`/api/${tenantSlug}/settings/profile`, { references: { unit_measures: next } });
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
    setTitle("");
    setCode("");
    setSortOrder("");
    setComment("");
    setActive(true);
  }

  function openAdd() {
    resetForm();
    setOpen(true);
  }

  function openEdit(u: UnitMeasure) {
    setEditId(u.id);
    setName(u.name ?? "");
    setTitle(u.title ?? "");
    setCode(u.code ?? "");
    setSortOrder(u.sort_order == null ? "" : String(u.sort_order));
    setComment(u.comment ?? "");
    setActive(u.active !== false);
    setOpen(true);
  }

  function submitForm() {
    const n = name.trim();
    if (!n) return;
    const normalizedCode = code.trim().toUpperCase();
    const next: UnitMeasure = {
      id: editId ?? newId(),
      name: n,
      title: title.trim() || null,
      code: normalizedCode || null,
      sort_order: sortOrder.trim() ? Number(sortOrder.trim()) : null,
      comment: comment.trim() || null,
      active
    };
    const existing = units;
    const merged = editId ? existing.map((x) => (x.id === editId ? next : x)) : [...existing, next];
    saveMut.mutate(sortUnits(merged));
    setOpen(false);
    resetForm();
  }

  if (!hydrated) return <PageShell><p className="text-sm text-muted-foreground">Sessiya...</p></PageShell>;
  if (!tenantSlug) return <PageShell><p className="text-sm text-destructive"><Link href="/login" className="underline">Kirish</Link></p></PageShell>;

  return (
    <PageShell className="max-w-6xl">
      <PageHeader
        title="Единицы измерения"
        description="Aktiv/noaktiv ro'yxat, sortirovka va kod bilan."
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
                  <th className="px-3 py-2 font-medium">Сортировка</th>
                  <th className="px-3 py-2 font-medium">Заголовок</th>
                  <th className="px-3 py-2 font-medium">Код</th>
                  <th className="px-3 py-2 font-medium">Комментарий</th>
                  <th className="px-3 py-2 font-medium text-right">...</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((u) => (
                  <tr key={u.id} className="border-t">
                    <td className="px-3 py-2">{u.name}</td>
                    <td className="px-3 py-2">{u.sort_order ?? "-"}</td>
                    <td className="px-3 py-2">{u.title ?? "-"}</td>
                    <td className="px-3 py-2">{u.code ?? "-"}</td>
                    <td className="px-3 py-2">{u.comment ?? "-"}</td>
                    <td className="px-3 py-2 text-right">
                      {isAdmin ? (
                        <TableRowActionGroup className="justify-end" ariaLabel="O‘lchov birligi">
                          <Button
                            variant="outline"
                            size="icon-sm"
                            type="button"
                            className="text-muted-foreground hover:text-foreground"
                            title="Tahrirlash"
                            aria-label="Tahrirlash"
                            onClick={() => openEdit(u)}
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
                    <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">Ma’lumot yo‘q</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </SettingsWorkspace>

      {msg ? <p className="text-sm text-muted-foreground">{msg}</p> : null}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[520px]" showCloseButton>
          <DialogHeader>
            <DialogTitle>{editId ? "Редактировать" : "Добавить"}</DialogTitle>
            <DialogDescription>Sortirovka faqat son bo‘lishi kerak.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label>Названия</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>Заголовок</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <div className="flex items-center justify-between">
                <Label>Код</Label>
                <span className="text-xs text-muted-foreground">{code.length} / 20</span>
              </div>
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "").slice(0, 20))}
              />
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
    </PageShell>
  );
}
