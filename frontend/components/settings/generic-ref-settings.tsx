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
  DialogTitle,
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

export type GenericRefEntry = {
  id: string;
  name: string;
  code: string | null;
  sort_order: number | null;
  comment: string | null;
  active: boolean;
  color: string | null;
};

function generateId(prefix = "gr") {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function sortEntries(rows: GenericRefEntry[]): GenericRefEntry[] {
  return [...rows].sort((a, b) => {
    const ao = typeof a.sort_order === "number" ? a.sort_order : Number.MAX_SAFE_INTEGER;
    const bo = typeof b.sort_order === "number" ? b.sort_order : Number.MAX_SAFE_INTEGER;
    if (ao !== bo) return ao - bo;
    return (a.name || "").toLocaleLowerCase().localeCompare((b.name || "").toLocaleLowerCase());
  });
}

type TenantProfile = {
  references: Record<string, GenericRefEntry[] | unknown>;
};

export type GenericRefConfig = {
  title: string;
  description?: string;
  profileRefKey: string;
  /** Jadvalda ko'rsatiladigan ustunlar */
  showCode?: boolean;
  showColor?: boolean;
  showComment?: boolean;
  showSortOrder?: boolean;
  /** Yangi yozuv qo'shganda prefix */
  idPrefix?: string;
  /** Qo'shimcha quick-link tugmalar */
  extraActions?: React.ReactNode;
};

export function GenericRefSettingsPage({ config }: { config: GenericRefConfig }) {
  const {
    title,
    description,
    profileRefKey,
    showCode = true,
    showColor = false,
    showComment = true,
    showSortOrder = true,
    idPrefix = "gr",
    extraActions,
  } = config;

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
  const [color, setColor] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const profileQ = useQuery({
    queryKey: ["settings", "profile", tenantSlug],
    enabled: Boolean(tenantSlug),
    queryFn: async () => {
      const { data } = await api.get<TenantProfile>(`/api/${tenantSlug}/settings/profile`);
      return data;
    },
  });

  const rows = useMemo(() => {
    const ref = profileQ.data?.references;
    if (!ref) return [];
    const raw = ref[profileRefKey];
    if (!Array.isArray(raw)) return [];
    const list: GenericRefEntry[] = raw
      .map((x) => {
        if (x == null || typeof x !== "object" || Array.isArray(x)) return null;
        const o = x as Record<string, unknown>;
        const id = typeof o.id === "string" ? o.id.trim() : "";
        const n = typeof o.name === "string" ? o.name.trim() : "";
        if (!id || !n) return null;
        const codeVal = typeof o.code === "string" ? o.code.trim().toUpperCase() : null;
        const sortVal =
          typeof o.sort_order === "number" && Number.isInteger(o.sort_order) ? o.sort_order : null;
        const commentVal = typeof o.comment === "string" ? o.comment.trim() : null;
        const activeVal = typeof o.active === "boolean" ? o.active : true;
        const colorVal = typeof o.color === "string" ? o.color.trim() : null;
        return {
          id,
          name: n,
          code: codeVal,
          sort_order: sortVal,
          comment: commentVal,
          active: activeVal,
          color: colorVal,
        };
      })
      .filter((x): x is GenericRefEntry => x != null);
    return sortEntries(list);
  }, [profileQ.data, profileRefKey]);

  const filtered = useMemo(
    () => rows.filter((x) => (tab === "active" ? x.active !== false : x.active === false)),
    [rows, tab]
  );

  const colCount =
    2 + (showCode ? 1 : 0) + (showColor ? 1 : 0) + (showSortOrder ? 1 : 0) + (showComment ? 1 : 0) + 1;

  const saveMut = useMutation({
    mutationFn: async (next: GenericRefEntry[]) => {
      if (!tenantSlug) throw new Error("no tenant");
      await api.patch(`/api/${tenantSlug}/settings/profile`, {
        references: { [profileRefKey]: next },
      });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["settings", "profile", tenantSlug] });
      setMsg("Saqlandi.");
    },
    onError: () => setMsg("Saqlashda xatolik."),
  });

  function resetForm() {
    setEditId(null);
    setName("");
    setCode("");
    setSortOrder("");
    setComment("");
    setActive(true);
    setColor("");
  }

  function openAdd() {
    resetForm();
    setOpen(true);
  }

  function openEdit(row: GenericRefEntry) {
    setEditId(row.id);
    setName(row.name ?? "");
    setCode(row.code ?? "");
    setSortOrder(row.sort_order == null ? "" : String(row.sort_order));
    setComment(row.comment ?? "");
    setActive(row.active !== false);
    setColor(row.color ?? "");
    setOpen(true);
  }

  function submitForm() {
    const n = name.trim();
    if (!n) return;
    const normalizedCode = showCode ? code.trim().toUpperCase() : null;
    const next: GenericRefEntry = {
      id: editId ?? generateId(idPrefix),
      name: n,
      code: normalizedCode || null,
      sort_order: showSortOrder && sortOrder.trim() ? Number(sortOrder.trim()) : null,
      comment: showComment ? (comment.trim() || null) : null,
      active,
      color: showColor ? (color.trim() || null) : null,
    };
    const merged = editId ? rows.map((x) => (x.id === editId ? next : x)) : [...rows, next];
    saveMut.mutate(sortEntries(merged));
    setOpen(false);
    resetForm();
  }

  if (!hydrated) {
    return (
      <PageShell>
        <p className="text-sm text-muted-foreground">Sessiya...</p>
      </PageShell>
    );
  }
  if (!tenantSlug) {
    return (
      <PageShell>
        <p className="text-sm text-destructive">
          <Link href="/login" className="underline">
            Kirish
          </Link>
        </p>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <PageHeader
        title={title}
        description={description ?? "Akтив / не активный, modal orqali qo'shish va tahrirlash."}
        actions={
          <div className="flex flex-wrap gap-2">
            {extraActions}
            <Button size="sm" disabled={!isAdmin} onClick={openAdd}>
              Добавить
            </Button>
            <Link href="/settings" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
              Katalog
            </Link>
          </div>
        }
      />

      <SettingsWorkspace>
        <div className="rounded-lg border bg-card p-4">
          <div className="mb-3 flex gap-2">
            <button
              type="button"
              className={cn(
                "rounded px-3 py-1 text-sm",
                tab === "active" ? "bg-primary text-primary-foreground" : "bg-muted"
              )}
              onClick={() => setTab("active")}
            >
              Активный
            </button>
            <button
              type="button"
              className={cn(
                "rounded px-3 py-1 text-sm",
                tab === "inactive" ? "bg-primary text-primary-foreground" : "bg-muted"
              )}
              onClick={() => setTab("inactive")}
            >
              Не активный
            </button>
          </div>

          <div className="overflow-hidden rounded-md border">
            <table className="w-full text-sm">
              <thead className="app-table-thead text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">Название</th>
                  {showCode && <th className="px-3 py-2 font-medium">Код</th>}
                  {showSortOrder && <th className="px-3 py-2 font-medium">Сортировка</th>}
                  {showColor && <th className="px-3 py-2 font-medium">Цвет</th>}
                  {showComment && <th className="px-3 py-2 font-medium">Комментарий</th>}
                  <th className="px-3 py-2 font-medium text-right">...</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="px-3 py-2">{r.name}</td>
                    {showCode && <td className="px-3 py-2">{r.code ?? "—"}</td>}
                    {showSortOrder && <td className="px-3 py-2">{r.sort_order ?? "—"}</td>}
                    {showColor && (
                      <td className="px-3 py-2">
                        {r.color ? (
                          <span
                            className="inline-block size-5 rounded border"
                            style={{ backgroundColor: r.color }}
                            title={r.color}
                          />
                        ) : (
                          "—"
                        )}
                      </td>
                    )}
                    {showComment && <td className="px-3 py-2">{r.comment ?? "—"}</td>}
                    <td className="px-3 py-2 text-right">
                      {isAdmin ? (
                        <TableRowActionGroup className="justify-end" ariaLabel={title}>
                          <Button
                            variant="outline"
                            size="icon-sm"
                            type="button"
                            className="text-muted-foreground hover:text-foreground"
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
                    <td colSpan={colCount} className="px-3 py-6 text-center text-muted-foreground">
                      Ma&apos;lumot yo&apos;q
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </SettingsWorkspace>

      {msg ? <p className="mt-3 text-sm text-muted-foreground">{msg}</p> : null}
      {!isAdmin ? (
        <p className="mt-2 text-xs text-muted-foreground">Tahrirlash faqat admin uchun.</p>
      ) : null}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[520px]" showCloseButton>
          <DialogHeader>
            <DialogTitle>{editId ? "Редактировать" : "Добавить"}</DialogTitle>
            <DialogDescription>
              {showCode ? "Код: A–Z, 0–9, _ (max 20). " : ""}Сортировка — faqat son.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label>Название</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            {showCode && (
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
            )}
            {showSortOrder && (
              <div className="grid gap-1.5">
                <Label>Сортировка</Label>
                <Input
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value.replace(/[^0-9]/g, ""))}
                  inputMode="numeric"
                />
              </div>
            )}
            {showColor && (
              <div className="grid gap-1.5">
                <Label>Цвет</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="color"
                    className="h-9 w-14 cursor-pointer border p-1"
                    value={color || "#6b7280"}
                    onChange={(e) => setColor(e.target.value)}
                  />
                  <Input value={color} onChange={(e) => setColor(e.target.value)} placeholder="#RRGGBB" />
                </div>
              </div>
            )}
            {showComment && (
              <div className="grid gap-1.5">
                <Label>Комментарий</Label>
                <textarea
                  className="min-h-[72px] rounded-md border bg-background px-3 py-2 text-sm"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                />
              </div>
            )}
            <label className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
              <span>Активный</span>
              <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            </label>
            <Button onClick={submitForm} disabled={saveMut.isPending || !isAdmin}>
              {editId ? "Сохранить" : "Добавить"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
