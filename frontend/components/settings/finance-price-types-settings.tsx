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
import { api } from "@/lib/api";
import { useAuthStore, useAuthStoreHydrated, useEffectiveRole } from "@/lib/auth-store";
import { cn } from "@/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

type PaymentMethodEntry = { id: string; name: string; active: boolean };

type PriceTypeEntry = {
  id: string;
  name: string;
  code: string | null;
  payment_method_id: string;
  kind: "sale" | "purchase";
  sort_order: number | null;
  comment: string | null;
  active: boolean;
  manual: boolean;
  attached_clients_only: boolean;
};

type TenantProfile = {
  references: {
    payment_method_entries?: PaymentMethodEntry[];
    price_type_entries?: PriceTypeEntry[];
  };
};

function newId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `pt-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function sortRows(list: PriceTypeEntry[]): PriceTypeEntry[] {
  return [...list].sort((a, b) => {
    const ao = a.sort_order ?? 1e6;
    const bo = b.sort_order ?? 1e6;
    if (ao !== bo) return ao - bo;
    return a.name.localeCompare(b.name, "uz");
  });
}

function priceKey(e: PriceTypeEntry): string {
  return (e.code?.trim() || e.name.trim()) || e.name;
}

export function FinancePriceTypesSettings() {
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
  const [paymentMethodId, setPaymentMethodId] = useState("");
  const [kind, setKind] = useState<"sale" | "purchase">("sale");
  const [active, setActive] = useState(true);
  const [manual, setManual] = useState(false);
  const [attachedOnly, setAttachedOnly] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const profileQ = useQuery({
    queryKey: ["settings", "profile", tenantSlug],
    enabled: Boolean(tenantSlug),
    queryFn: async () => {
      const { data } = await api.get<TenantProfile>(`/api/${tenantSlug}/settings/profile`);
      return data;
    }
  });

  const payList = useMemo(
    () => profileQ.data?.references?.payment_method_entries?.filter((p) => p.active !== false) ?? [],
    [profileQ.data]
  );

  const rows = useMemo(() => sortRows(profileQ.data?.references?.price_type_entries ?? []), [profileQ.data]);

  const filtered = useMemo(
    () => rows.filter((x) => (tab === "active" ? x.active !== false : x.active === false)),
    [rows, tab]
  );

  const payName = (id: string) => payList.find((p) => p.id === id)?.name ?? "—";

  const saveMut = useMutation({
    mutationFn: async (next: PriceTypeEntry[]) => {
      if (!tenantSlug) throw new Error("no tenant");
      await api.patch(`/api/${tenantSlug}/settings/profile`, {
        references: { price_type_entries: next }
      });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["settings", "profile", tenantSlug] });
      await qc.invalidateQueries({ queryKey: ["price-types", tenantSlug] });
      await qc.invalidateQueries({ queryKey: ["finance-price-overview", tenantSlug] });
      setMsg("Saqlandi. Narx turi kaliti mahsulot narxlari (price_type) bilan mos kelishi kerak.");
    },
    onError: () => setMsg("Saqlashda xatolik.")
  });

  function resetForm() {
    setEditId(null);
    setName("");
    setCode("");
    setSortOrder("");
    setComment("");
    setPaymentMethodId(payList[0]?.id ?? "");
    setKind("sale");
    setActive(true);
    setManual(false);
    setAttachedOnly(false);
  }

  function openAdd() {
    resetForm();
    setOpen(true);
  }

  function openEdit(row: PriceTypeEntry) {
    setEditId(row.id);
    setName(row.name);
    setCode(row.code ?? "");
    setSortOrder(row.sort_order == null ? "" : String(row.sort_order));
    setComment(row.comment ?? "");
    setPaymentMethodId(row.payment_method_id);
    setKind(row.kind === "purchase" ? "purchase" : "sale");
    setActive(row.active !== false);
    setManual(row.manual === true);
    setAttachedOnly(row.attached_clients_only === true);
    setOpen(true);
  }

  function submitForm() {
    const n = name.trim();
    if (!n || !paymentMethodId) return;
    const codeNorm = code.trim().toUpperCase().replace(/[^A-Z0-9_]/g, "").slice(0, 20);
    const nextRow: PriceTypeEntry = {
      id: editId ?? newId(),
      name: n,
      code: codeNorm || null,
      payment_method_id: paymentMethodId,
      kind,
      sort_order: sortOrder.trim() ? Number(sortOrder.trim()) : null,
      comment: comment.trim() || null,
      active,
      manual,
      attached_clients_only: attachedOnly
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
    <PageShell className="max-w-6xl">
      <PageHeader
        title="Тип цены"
        description="Sotish/yoki xarid; to‘lov usuli bilan bog‘langan. Kalit: kod bo‘lsa kod, aks holda nom (product_prices.price_type)."
        actions={
          <div className="flex gap-2">
            <Button size="sm" disabled={!isAdmin || payList.length === 0} onClick={openAdd}>
              Добавить
            </Button>
            <Link
              href="/settings/payment-methods"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            >
              Способ оплаты
            </Link>
            <Link href="/settings" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
              Katalog
            </Link>
          </div>
        }
      />

      {payList.length === 0 ? (
        <p className="text-sm text-amber-600 dark:text-amber-400">
          Avval{" "}
          <Link href="/settings/payment-methods" className="underline">
            to‘lov usullarini
          </Link>{" "}
          qo‘shing.
        </p>
      ) : null}

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
              <thead className="bg-muted/40 text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">Название</th>
                  <th className="px-3 py-2 font-medium">Способ оплаты</th>
                  <th className="px-3 py-2 font-medium">Тип</th>
                  <th className="px-3 py-2 font-medium">Ключ (DB)</th>
                  <th className="px-3 py-2 text-right font-medium">...</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="px-3 py-2">{r.name}</td>
                    <td className="px-3 py-2">{payName(r.payment_method_id)}</td>
                    <td className="px-3 py-2">{r.kind === "purchase" ? "Покупка" : "Продажа"}</td>
                    <td className="px-3 py-2 font-mono text-xs">{priceKey(r)}</td>
                    <td className="px-3 py-2 text-right">
                      {isAdmin ? (
                        <TableRowActionGroup className="justify-end" ariaLabel="Narx turi">
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
                    <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
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
            <DialogDescription>Kod ixtiyoriy (A–Z, 0–9, _). Bo‘sh bo‘lsa kalit sifatida nom ishlatiladi.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label>Название</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>Способ оплаты</Label>
              <select
                className="h-10 rounded-md border bg-background px-3 text-sm"
                value={paymentMethodId}
                onChange={(e) => setPaymentMethodId(e.target.value)}
              >
                {payList.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-1.5">
              <Label>Тип</Label>
              <select
                className="h-10 rounded-md border bg-background px-3 text-sm"
                value={kind}
                onChange={(e) => setKind(e.target.value === "purchase" ? "purchase" : "sale")}
              >
                <option value="sale">Продажа</option>
                <option value="purchase">Покупка</option>
              </select>
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
            <label className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
              <span>Ручной</span>
              <input type="checkbox" checked={manual} onChange={(e) => setManual(e.target.checked)} />
            </label>
            <label className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
              <span>Доступно только для прикрепленных клиентов</span>
              <input type="checkbox" checked={attachedOnly} onChange={(e) => setAttachedOnly(e.target.checked)} />
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
