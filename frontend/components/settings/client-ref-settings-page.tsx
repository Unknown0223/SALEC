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
import type { ClientRefEntry } from "@/lib/client-ref-entries";
import { legacyStringsToEntries, sortClientRefEntries } from "@/lib/client-ref-entries";
import { useAuthStore, useAuthStoreHydrated, useEffectiveRole } from "@/lib/auth-store";
import { cn } from "@/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

type RefProfileKey = "client_format_entries" | "client_type_entries" | "client_category_entries";
type LegacyKey = "client_formats" | "client_type_codes" | "client_categories";

type TenantProfile = {
  references: Record<string, unknown>;
};

function newId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `cr-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export type ClientRefSettingsConfig = {
  title: string;
  profileRefKey: RefProfileKey;
  legacyKey: LegacyKey;
  legacyIdPrefix: string;
  showColor: boolean;
};

export function ClientRefSettingsPage({ config }: { config: ClientRefSettingsConfig }) {
  const { title, profileRefKey, legacyKey, legacyIdPrefix, showColor } = config;
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
    }
  });

  const rows = useMemo(() => {
    const ref = profileQ.data?.references;
    if (!ref) return [];
    const raw = ref[profileRefKey];
    let list: ClientRefEntry[] = [];
    if (Array.isArray(raw) && raw.length > 0) {
      list = raw
        .map((x) => {
          if (x == null || typeof x !== "object" || Array.isArray(x)) return null;
          const o = x as Record<string, unknown>;
          const id = typeof o.id === "string" ? o.id.trim() : "";
          const n = typeof o.name === "string" ? o.name.trim() : "";
          if (!id || !n) return null;
          const codeRaw = typeof o.code === "string" ? o.code.trim().toUpperCase() : "";
          const codeVal = codeRaw && /^[A-Z0-9_]+$/.test(codeRaw) ? codeRaw.slice(0, 20) : null;
          const sort_order =
            typeof o.sort_order === "number" && Number.isInteger(o.sort_order) ? o.sort_order : null;
          const commentVal = typeof o.comment === "string" ? o.comment.trim() : "";
          const activeVal = typeof o.active === "boolean" ? o.active : true;
          const colorVal = typeof o.color === "string" ? o.color.trim() : "";
          return {
            id,
            name: n,
            code: codeVal,
            sort_order,
            comment: commentVal || null,
            active: activeVal,
            color: colorVal || null
          } satisfies ClientRefEntry;
        })
        .filter((x): x is ClientRefEntry => x != null);
    } else {
      const legacy = ref[legacyKey];
      const strings = Array.isArray(legacy)
        ? legacy.filter((s): s is string => typeof s === "string" && s.trim() !== "").map((s) => s.trim())
        : [];
      list = legacyStringsToEntries(strings, legacyIdPrefix);
    }
    return sortClientRefEntries(list);
  }, [profileQ.data, profileRefKey, legacyKey, legacyIdPrefix]);

  const filtered = useMemo(
    () => rows.filter((x) => (tab === "active" ? x.active !== false : x.active === false)),
    [rows, tab]
  );

  const saveMut = useMutation({
    mutationFn: async (next: ClientRefEntry[]) => {
      if (!tenantSlug) throw new Error("no tenant");
      await api.patch(`/api/${tenantSlug}/settings/profile`, {
        references: { [profileRefKey]: next }
      });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["settings", "profile", tenantSlug] });
      await qc.invalidateQueries({ queryKey: ["clients-references", tenantSlug] });
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
    setColor("");
  }

  function openAdd() {
    resetForm();
    setOpen(true);
  }

  function openEdit(row: ClientRefEntry) {
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
    const normalizedCode = code.trim().toUpperCase();
    const next: ClientRefEntry = {
      id: editId ?? newId(),
      name: n,
      code: normalizedCode || null,
      sort_order: sortOrder.trim() ? Number(sortOrder.trim()) : null,
      comment: comment.trim() || null,
      active,
      color: showColor ? (color.trim() || null) : null
    };
    const merged = editId ? rows.map((x) => (x.id === editId ? next : x)) : [...rows, next];
    saveMut.mutate(sortClientRefEntries(merged));
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
        description="Активный / не активный, modal orqali qo‘shish va tahrirlash."
        actions={
          <div className="flex gap-2">
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
              className={cn("rounded px-3 py-1 text-sm", tab === "active" ? "bg-primary text-primary-foreground" : "bg-muted")}
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
                  <th className="px-3 py-2 font-medium">Названия</th>
                  {showColor ? <th className="px-3 py-2 font-medium">Цвет</th> : null}
                  <th className="px-3 py-2 font-medium">Код</th>
                  <th className="px-3 py-2 font-medium">Сортировка</th>
                  <th className="px-3 py-2 font-medium">Комментарий</th>
                  <th className="px-3 py-2 font-medium text-right">...</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="px-3 py-2">{r.name}</td>
                    {showColor ? (
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
                    ) : null}
                    <td className="px-3 py-2">{r.code ?? "—"}</td>
                    <td className="px-3 py-2">{r.sort_order ?? "—"}</td>
                    <td className="px-3 py-2">{r.comment ?? "—"}</td>
                    <td className="px-3 py-2 text-right">
                      {isAdmin ? (
                        <TableRowActionGroup className="justify-end" ariaLabel="Yozuv">
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
                    <td
                      colSpan={showColor ? 6 : 5}
                      className="px-3 py-6 text-center text-muted-foreground"
                    >
                      Ma&apos;lumot yo&apos;q
                    </td>
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
            <DialogDescription>Код: A–Z, 0–9, _ (max 20). Сортировка — faqat son.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label>Названия</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            {showColor ? (
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
            ) : null}
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
              <Input
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value.replace(/[^0-9]/g, ""))}
                inputMode="numeric"
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Комментарий</Label>
              <textarea
                className="min-h-[72px] rounded-md border bg-background px-3 py-2 text-sm"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
            </div>
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
