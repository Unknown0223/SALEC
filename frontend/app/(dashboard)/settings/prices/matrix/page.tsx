"use client";

import { PageHeader } from "@/components/dashboard/page-header";
import { PageShell } from "@/components/dashboard/page-shell";
import { SettingsWorkspace } from "@/components/settings/settings-workspace";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { useAuthStore, useAuthStoreHydrated, useEffectiveRole } from "@/lib/auth-store";
import { cn } from "@/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Cat = { id: number; name: string; parent_id: number | null };

type MatrixRow = {
  product_id: number;
  name: string;
  sku: string;
  price: string | null;
  currency: string;
};

function flattenCategories(rows: Cat[]): { id: number; label: string }[] {
  const byParent = new Map<number | null, Cat[]>();
  for (const r of rows) {
    const k = r.parent_id ?? null;
    if (!byParent.has(k)) byParent.set(k, []);
    byParent.get(k)!.push(r);
  }
  Array.from(byParent.values()).forEach((list) => {
    list.sort((a: Cat, b: Cat) => a.name.localeCompare(b.name, "uz"));
  });
  const out: { id: number; label: string }[] = [];
  const walk = (parentId: number | null, prefix: string) => {
    const kids = byParent.get(parentId) ?? [];
    for (const c of kids) {
      const label = prefix ? `${prefix} / ${c.name}` : c.name;
      out.push({ id: c.id, label });
      walk(c.id, label);
    }
  };
  walk(null, "");
  return out;
}

export default function PriceMatrixPage() {
  const tenantSlug = useAuthStore((s) => s.tenantSlug);
  const hydrated = useAuthStoreHydrated();
  const role = useEffectiveRole();
  const isAdmin = role === "admin" || role === "operator";
  const qc = useQueryClient();

  const [kind, setKind] = useState<"sale" | "purchase">("sale");
  const [priceType, setPriceType] = useState("");
  const [categoryId, setCategoryId] = useState<number | "">("");
  const [bulk, setBulk] = useState("");
  const [draft, setDraft] = useState<Record<number, string>>({});
  const [msg, setMsg] = useState<string | null>(null);

  const categoriesQ = useQuery({
    queryKey: ["product-categories", tenantSlug],
    enabled: Boolean(tenantSlug) && isAdmin,
    queryFn: async () => {
      const { data } = await api.get<{ data: Cat[] }>(`/api/${tenantSlug}/product-categories`);
      return data.data;
    }
  });

  const flatCats = useMemo(() => flattenCategories(categoriesQ.data ?? []), [categoriesQ.data]);

  const priceTypesQ = useQuery({
    queryKey: ["price-types", tenantSlug, kind],
    enabled: Boolean(tenantSlug) && isAdmin,
    queryFn: async () => {
      const { data } = await api.get<{ data: string[] }>(`/api/${tenantSlug}/price-types?kind=${kind}`);
      return data.data;
    }
  });

  const matrixQ = useQuery({
    queryKey: ["price-matrix", tenantSlug, categoryId, priceType],
    enabled: Boolean(tenantSlug) && isAdmin && categoryId !== "" && priceType.length > 0,
    queryFn: async () => {
      const { data } = await api.get<{ data: MatrixRow[]; currency: string }>(
        `/api/${tenantSlug}/products/prices/matrix?category_id=${categoryId}&price_type=${encodeURIComponent(priceType)}`
      );
      return data;
    }
  });

  useEffect(() => {
    const rows = matrixQ.data?.data ?? [];
    const next: Record<number, string> = {};
    for (const r of rows) {
      next[r.product_id] = r.price ?? "";
    }
    setDraft(next);
  }, [matrixQ.data?.data, categoryId, priceType]);

  useEffect(() => {
    const list = priceTypesQ.data ?? [];
    if (list.length && !list.includes(priceType)) {
      setPriceType(list[0]!);
    }
  }, [priceTypesQ.data, priceType, kind]);

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!tenantSlug || categoryId === "" || !priceType) throw new Error("bad");
      const rows = matrixQ.data?.data ?? [];
      const cur = matrixQ.data?.currency ?? "UZS";
      const items = rows
        .map((r) => {
          const raw = (draft[r.product_id] ?? "").trim();
          if (raw === "") return null;
          const n = Number.parseFloat(raw.replace(/\s/g, "").replace(",", "."));
          if (!Number.isFinite(n) || n < 0) return null;
          return { product_id: r.product_id, price: n };
        })
        .filter((x): x is { product_id: number; price: number } => x != null);
      if (items.length === 0) throw new Error("EMPTY");
      await api.patch(`/api/${tenantSlug}/products/prices/matrix`, {
        price_type: priceType,
        currency: cur,
        items
      });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["price-matrix", tenantSlug] });
      await qc.invalidateQueries({ queryKey: ["finance-price-overview", tenantSlug] });
      setMsg("Saqlandi.");
    },
    onError: (e) => {
      setMsg(e instanceof Error && e.message === "EMPTY" ? "Kamida bitta narx kiriting." : "Saqlashda xato.");
    }
  });

  function applyBulk() {
    const n = Number.parseFloat(String(bulk).replace(/\s/g, "").replace(",", "."));
    if (!Number.isFinite(n) || n < 0) return;
    const rows = matrixQ.data?.data ?? [];
    const next = { ...draft };
    for (const r of rows) {
      next[r.product_id] = String(n);
    }
    setDraft(next);
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
        title="Установка новых цен"
        description="Kategoriya va narx turini tanlang, jadvalni to‘ldiring, saqlang."
        actions={
          <div className="flex gap-2">
            <Button size="sm" disabled={!isAdmin || saveMut.isPending} onClick={() => saveMut.mutate()}>
              Сохранить
            </Button>
            <Link href="/settings/prices" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
              ← Цена
            </Link>
          </div>
        }
      />

      <SettingsWorkspace>
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <div className="grid gap-1">
            <span className="text-xs text-muted-foreground">Режим</span>
            <div className="flex gap-2">
              <button
                type="button"
                className={cn(
                  "rounded px-3 py-1 text-sm",
                  kind === "sale" ? "bg-primary text-primary-foreground" : "bg-muted"
                )}
                onClick={() => setKind("sale")}
              >
                Продажа
              </button>
              <button
                type="button"
                className={cn(
                  "rounded px-3 py-1 text-sm",
                  kind === "purchase" ? "bg-primary text-primary-foreground" : "bg-muted"
                )}
                onClick={() => setKind("purchase")}
              >
                Закуп
              </button>
            </div>
          </div>
          <div className="grid gap-1">
            <Label className="text-xs">Тип цены</Label>
            <select
              className="h-10 min-w-[200px] rounded-md border bg-background px-3 text-sm"
              value={priceType}
              onChange={(e) => setPriceType(e.target.value)}
            >
              {(priceTypesQ.data ?? []).map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-1">
            <Label className="text-xs">Категория</Label>
            <select
              className="h-10 min-w-[240px] rounded-md border bg-background px-3 text-sm"
              value={categoryId === "" ? "" : String(categoryId)}
              onChange={(e) => setCategoryId(e.target.value ? Number(e.target.value) : "")}
            >
              <option value="">—</option>
              {flatCats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mb-3 flex flex-wrap items-end gap-2">
          <div className="grid gap-1">
            <Label className="text-xs">Все строки (сумма)</Label>
            <div className="flex gap-2">
              <Input
                className="h-10 w-40"
                value={bulk}
                onChange={(e) => setBulk(e.target.value)}
                placeholder="0"
              />
              <Button type="button" variant="secondary" size="sm" className="h-10" onClick={applyBulk}>
                Qo‘llash
              </Button>
            </div>
          </div>
        </div>

        <div className="overflow-hidden rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left">
              <tr>
                <th className="px-3 py-2 font-medium">№</th>
                <th className="px-3 py-2 font-medium">Название</th>
                <th className="px-3 py-2 font-medium">SKU</th>
                <th className="px-3 py-2 font-medium">
                  Сумма ({matrixQ.data?.currency ?? "…"})
                </th>
              </tr>
            </thead>
            <tbody>
              {matrixQ.isLoading ? (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-muted-foreground">
                    Yuklanmoqda…
                  </td>
                </tr>
              ) : categoryId === "" || !priceType ? (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">
                    Kategoriya va narx turini tanlang.
                  </td>
                </tr>
              ) : (
                (matrixQ.data?.data ?? []).map((r, i) => (
                  <tr key={r.product_id} className="border-t">
                    <td className="px-3 py-2">{i + 1}</td>
                    <td className="px-3 py-2">{r.name}</td>
                    <td className="px-3 py-2 font-mono text-xs">{r.sku}</td>
                    <td className="px-3 py-2">
                      <Input
                        className="h-8 max-w-[160px]"
                        value={draft[r.product_id] ?? ""}
                        onChange={(e) =>
                          setDraft((p) => ({
                            ...p,
                            [r.product_id]: e.target.value
                          }))
                        }
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {msg ? <p className="mt-3 text-sm text-muted-foreground">{msg}</p> : null}
      </SettingsWorkspace>
    </PageShell>
  );
}
