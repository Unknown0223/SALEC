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

type CurrencyEntry = {
  id: string;
  name: string;
  code: string;
  active: boolean;
  is_default: boolean;
};

type PaymentMethodEntry = {
  id: string;
  name: string;
  code: string | null;
  currency_code: string;
  sort_order: number | null;
  comment: string | null;
  color: string | null;
  active: boolean;
};

type TenantProfile = {
  references: {
    currency_entries?: CurrencyEntry[];
    payment_method_entries?: PaymentMethodEntry[];
  };
};

function newId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `pay-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function sortRows(list: PaymentMethodEntry[]): PaymentMethodEntry[] {
  return [...list].sort((a, b) => {
    const ao = a.sort_order ?? 1e6;
    const bo = b.sort_order ?? 1e6;
    if (ao !== bo) return ao - bo;
    return a.name.localeCompare(b.name, "uz");
  });
}

export function FinancePaymentMethodsSettings() {
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
  const [color, setColor] = useState("");
  const [currencyCode, setCurrencyCode] = useState("UZS");
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

  const currencies = useMemo(
    () => profileQ.data?.references?.currency_entries?.filter((c) => c.active !== false) ?? [],
    [profileQ.data]
  );

  const rows = useMemo(() => sortRows(profileQ.data?.references?.payment_method_entries ?? []), [profileQ.data]);

  const filtered = useMemo(
    () => rows.filter((x) => (tab === "active" ? x.active !== false : x.active === false)),
    [rows, tab]
  );

  const currencyLabel = (code: string) => {
    const c = currencies.find((x) => x.code === code);
    return c ? `${c.name} (${c.code})` : code;
  };

  const saveMut = useMutation({
    mutationFn: async (next: PaymentMethodEntry[]) => {
      if (!tenantSlug) throw new Error("no tenant");
      await api.patch(`/api/${tenantSlug}/settings/profile`, {
        references: { payment_method_entries: next }
      });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["settings", "profile", tenantSlug] });
      setMsg("Saqlandi. To‘lov turlari (bonus/kompaniya) nomlar bilan yangilandi.");
    },
    onError: () => setMsg("Saqlashda xatolik.")
  });

  function resetForm() {
    setEditId(null);
    setName("");
    setCode("");
    setSortOrder("");
    setComment("");
    setColor("");
    const def = currencies.find((c) => c.is_default)?.code ?? currencies[0]?.code ?? "UZS";
    setCurrencyCode(def);
    setActive(true);
  }

  function openAdd() {
    resetForm();
    setOpen(true);
  }

  function openEdit(row: PaymentMethodEntry) {
    setEditId(row.id);
    setName(row.name);
    setCode(row.code ?? "");
    setSortOrder(row.sort_order == null ? "" : String(row.sort_order));
    setComment(row.comment ?? "");
    setColor(row.color ?? "");
    setCurrencyCode(row.currency_code);
    setActive(row.active !== false);
    setOpen(true);
  }

  function submitForm() {
    const n = name.trim();
    if (!n) return;
    const slug = code.trim().toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 30);
    const cc = currencyCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 20);
    if (cc.length < 2) return;
    const nextRow: PaymentMethodEntry = {
      id: editId ?? newId(),
      name: n,
      code: slug || null,
      currency_code: cc,
      sort_order: sortOrder.trim() ? Number(sortOrder.trim()) : null,
      comment: comment.trim() || null,
      color: color.trim().slice(0, 32) || null,
      active
    };
    const merged = editId ? rows.map((x) => (x.id === editId ? nextRow : x)) : [...rows, nextRow];
    saveMut.mutate(sortRows(merged));
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
        title="Способ оплаты"
        description="Har bir usul valyutaga bog‘langan; saqlanganda kompaniya «to‘lov turlari» ro‘yxati yangilanadi."
        actions={
          <div className="flex gap-2">
            <Button size="sm" disabled={!isAdmin} onClick={openAdd}>
              Добавить
            </Button>
            <Link href="/settings/currencies" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
              Валюты
            </Link>
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
                  <th className="px-3 py-2 font-medium">Название</th>
                  <th className="px-3 py-2 font-medium">Валюта</th>
                  <th className="px-3 py-2 font-medium">Сортировка</th>
                  <th className="px-3 py-2 font-medium">Код</th>
                  <th className="px-3 py-2 font-medium">Цвет</th>
                  <th className="px-3 py-2 text-right font-medium">...</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="px-3 py-2">{r.name}</td>
                    <td className="px-3 py-2">{currencyLabel(r.currency_code)}</td>
                    <td className="px-3 py-2">{r.sort_order ?? "—"}</td>
                    <td className="px-3 py-2 font-mono text-xs">{r.code ?? "—"}</td>
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
                    <td className="px-3 py-2 text-right">
                      {isAdmin ? (
                        <TableRowActionGroup className="justify-end" ariaLabel="To‘lov usuli">
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
                    <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
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
            <DialogDescription>Ichki kod: a–z, 0–9, _ (max 30). Valyutani oldin «Валюты» bo‘limida yarating.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label>Название</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
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
              <div className="flex items-center justify-between">
                <Label>Код</Label>
                <span className="text-xs text-muted-foreground">{code.length} / 30</span>
              </div>
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 30))}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Валюта</Label>
              <select
                className="h-10 rounded-md border bg-background px-3 text-sm"
                value={currencyCode}
                onChange={(e) => setCurrencyCode(e.target.value)}
              >
                {currencies.length === 0 ? (
                  <option value="UZS">UZS</option>
                ) : (
                  currencies.map((c) => (
                    <option key={c.id} value={c.code}>
                      {c.name} ({c.code})
                    </option>
                  ))
                )}
              </select>
            </div>
            <div className="grid gap-1.5">
              <Label>Комментарий</Label>
              <textarea
                className="min-h-[72px] rounded-md border bg-background px-3 py-2 text-sm"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
            </div>
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
