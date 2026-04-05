"use client";

import { PageHeader } from "@/components/dashboard/page-header";
import { PageShell } from "@/components/dashboard/page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { api } from "@/lib/api";
import { useAuthStore, useAuthStoreHydrated } from "@/lib/auth-store";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, useMemo, useCallback } from "react";

type ReturnRow = {
  id: number;
  number: string;
  client_id: number | null;
  client_name: string | null;
  order_id: number | null;
  order_number: string | null;
  warehouse_id: number;
  warehouse_name: string;
  status: string;
  refund_amount: string | null;
  note: string | null;
  created_at: string;
};

type ClientReturnData = {
  orders: { id: number; number: string; status: string; total_sum: string; bonus_sum: string; created_at: string }[];
  items: {
    product_id: number; sku: string; name: string; unit: string;
    qty: string; price: string; total: string; is_bonus: boolean;
    order_id: number; order_number: string;
  }[];
  total_orders: number;
  total_returned_qty: string;
  total_paid_value: string;
  already_returned_value: string;
  max_returnable_value: string;
  client_balance: string;
  client_debt: string;
};

type ClientForSelect = { id: number; name: string };

function ReturnsPageContent() {
  const tenantSlug = useAuthStore((s) => s.tenantSlug);
  const hydrated = useAuthStoreHydrated();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [limit, setLimit] = useState(50);

  const activeTab = searchParams.get("tab") === "polki" ? "polki" : "list";

  // ─── Returns list ──────────────────────────────────────────────────────
  const listQ = useQuery({
    queryKey: ["returns", tenantSlug, limit],
    enabled: Boolean(tenantSlug) && hydrated && activeTab === "list",
    queryFn: async () => {
      const { data } = await api.get<{ data: ReturnRow[]; total: number }>(
        `/api/${tenantSlug}/returns?page=1&limit=${limit}`
      );
      return data;
    }
  });

  // ─── Polki form ───────────────────────────────────────────────────────
  const clientIdFromUrl = searchParams.get("client_id") ?? undefined;
  const client_id_num = clientIdFromUrl ? Number(clientIdFromUrl) : null;

  const [clientId, setClientId] = useState(client_id_num ? String(client_id_num) : "");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [note, setNote] = useState("");
  const [returnLines, setReturnLines] = useState<{ product_id: string; qty: string }[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Clients dropdown
  const clientsQ = useQuery({
    queryKey: ["clients", tenantSlug, "return-select"],
    enabled: Boolean(tenantSlug),
    queryFn: async () => {
      const { data } = await api.get<{ data: ClientForSelect[] }>(
        `/api/${tenantSlug}/clients?page=1&limit=500&is_active=true`
      );
      return data.data ?? [];
    }
  });

  // Return warehouses
  const warehouseQuery = useQuery({
    queryKey: ["warehouses", tenantSlug, "returns"],
    enabled: Boolean(tenantSlug),
    queryFn: async () => {
      const { data } = await api.get<{ data: { id: number; name: string; stock_purpose: string }[] }>(
        `/api/${tenantSlug}/warehouses`
      );
      return data.data ?? [];
    }
  });
  const returnWh = warehouseQuery.data?.find((w) => w.stock_purpose === "return");

  // Client data
  const clientDataQuery = useQuery({
    queryKey: ["returns-client-data", tenantSlug, clientId, dateFrom, dateTo],
    enabled: Boolean(tenantSlug && clientId && Number.isFinite(Number(clientId))),
    queryFn: async () => {
      const params = new URLSearchParams({ client_id: clientId });
      if (dateFrom) params.set("date_from", dateFrom);
      if (dateTo) params.set("date_to", dateTo);
      const { data } = await api.get<ClientReturnData>(
        `/api/${tenantSlug}/returns/client-data?${params.toString()}`
      );
      return data;
    }
  });

  const clientData = clientDataQuery.data;

  // Aggregate products by product_id
  const productMap = useMemo(() => {
    const map = new Map<number, {
      product_id: number; sku: string; name: string; unit: string;
      total_qty: number; has_bonus: boolean;
    }>();
    const _items = clientData?.items ?? [];
    for (const it of _items) {
      const cur = map.get(it.product_id);
      const qty = Number(it.qty);
      if (cur) {
        cur.total_qty += qty;
        if (it.is_bonus) cur.has_bonus = true;
      } else {
        map.set(it.product_id, {
          product_id: it.product_id, sku: it.sku, name: it.name,
          unit: it.unit, total_qty: qty, has_bonus: it.is_bonus
        });
      }
    }
    return map;
  }, [clientData?.items]);

  // Price by product (first non-zero)
  const priceByProduct = useMemo(() => {
    const map = new Map<string, number>();
    const _items = clientData?.items ?? [];
    for (const it of _items) {
      const k = String(it.product_id);
      const p = Number(it.price);
      if (!map.has(k) || map.get(k) === 0) map.set(k, p);
    }
    return map;
  }, [clientData?.items]);

  // Totals
  let totalReturnQty = 0;
  let totalReturnValue = 0;
  for (const rl of returnLines) {
    const q = Number(rl.qty) || 0;
    totalReturnQty += q;
    totalReturnValue += q * (priceByProduct.get(rl.product_id) ?? 0);
  }
  const maxRet = Number(clientData?.max_returnable_value ?? 0);
  const maxReturnable = clientData?.max_returnable_value ?? "0";
  const clientDebt = clientData?.client_debt ?? "0";

  // Clear return lines when filters change
  const clearLines = useCallback(() => setReturnLines([]), []);

  // Reset clientId when URL has client_id
  if (client_id_num && clientId === "") {
    setClientId(String(client_id_num));
  }

  const setAllReturnQty = (qty: number) => {
    setReturnLines(Array.from(productMap.values()).map((p) => ({
      product_id: String(p.product_id), qty: String(qty)
    })));
  };

  const handleLineChange = (productId: string, val: string) => {
    setReturnLines((prev) => {
      const idx = prev.findIndex((l) => l.product_id === productId);
      const next = [...prev];
      if (idx >= 0) next[idx] = { ...next[idx]!, qty: val };
      else next.push({ product_id: productId, qty: val });
      return next;
    });
  };

  const handleSubmit = async () => {
    setErr(null);
    if (!clientId || !Number.isFinite(Number(clientId))) {
      setErr("Mijozni tanlang."); return;
    }
    const lines = returnLines
      .map((l) => ({ product_id: Number(l.product_id), qty: Number(l.qty) }))
      .filter((l) => Number.isFinite(l.product_id) && l.product_id > 0 && l.qty > 0);
    if (lines.length === 0) {
      setErr("Kamida bitta mahsulot va miqdor kiriting."); return;
    }
    if (totalReturnQty > 12) {
      setErr(`Max 12 ta mahsulot qaytarish mumkin. Siz ${totalReturnQty} ta kiritdingiz.`); return;
    }
    if (maxRet > 0 && totalReturnValue > maxRet) {
      setErr(`Qaytarish qiymati maksimal summadan (${maxReturnable}) oshmoqda.`); return;
    }

    setSubmitting(true);
    try {
      const body: Record<string, unknown> = { client_id: Number(clientId), lines };
      if (returnWh) body.warehouse_id = returnWh.id;
      if (dateFrom) body.date_from = dateFrom;
      if (dateTo) body.date_to = dateTo;
      if (note.trim()) body.note = note.trim();
      await api.post(`/api/${tenantSlug}/returns/period`, body);
      router.push("/returns");
    } catch (e: unknown) {
      const data = (e as { response?: { data?: { error?: string } } })?.response?.data;
      if (data?.error === "TooManyItems") setErr(`Max 12 ta mahsulot qaytarish mumkin.`);
      else if (data?.error === "QtyExceedsOrdered") setErr("Qaytarish miqdori buyurtma miqdoridan oshmoqda.");
      else if (data?.error === "NothingToReturn") setErr("Tanlangan davrda qaytariladigan mahsulot yo'q.");
      else if (data?.error === "BadClient") setErr("Mijoz topilmadi.");
      else if (data?.error === "BadProduct") setErr("Mahsulot topilmadi.");
      else if (data?.error === "NoWarehouse") setErr("Qaytarish ombori topilmadi.");
      else setErr("Qaytarish yaratilmadi.");
    } finally {
      setSubmitting(false);
    }
  };

  const changeTab = (v: string | null) => {
    if (v === "polki") router.push("/returns?tab=polki", { scroll: false });
    else router.push("/returns", { scroll: false });
  };

  return (
    <PageShell>
      <PageHeader
        title="Qaytarishlar"
        description="Vazvrat — oddiy va polki qaytarishlar"
      />

      <Tabs value={activeTab} onValueChange={changeTab} className="mb-4">
        <TabsList className="grid w-fit grid-cols-2 gap-2">
          <TabsTrigger value="polki" className="min-w-[140px]">Vazvrat Polki</TabsTrigger>
          <TabsTrigger value="list">Ro&apos;yxat</TabsTrigger>
        </TabsList>
      </Tabs>

      {activeTab === "polki" ? (
        <div className="space-y-4">
          {/* Filters card */}
          <Card className="shadow-panel">
            <CardContent className="p-4 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Mijoz</label>
                  <select
                    className="w-full h-10 rounded-md border border-input bg-background px-2 text-sm"
                    value={clientId}
                    onChange={(e) => { setClientId(e.target.value); setReturnLines([]); }}
                  >
                    <option value="">Mijozni tanlang…</option>
                    {(clientsQ.data ?? []).map((c) => (
                      <option key={c.id} value={String(c.id)}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Dan</label>
                  <Input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); clearLines(); }} className="h-10" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Gacha</label>
                  <Input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); clearLines(); }} className="h-10" />
                </div>
                {clientData && (
                  <div className="flex items-end">
                    <div className="text-xs space-y-0.5">
                      <div>Buyurtmalar: <span className="font-medium">{clientData.total_orders}</span></div>
                      <div>Qaytarilgan: <span className="font-medium">{clientData.already_returned_value}</span></div>
                      <div>Max qaytarish: <span className="font-medium text-amber-600">{maxReturnable}</span></div>
                      <div>Qarz: <span className="font-medium text-red-600">{clientDebt}</span></div>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Err */}
          {err && <p className="text-sm text-destructive" role="alert">{err}</p>}

          {/* Products table */}
          {productMap.size > 0 && (
            <Card className="shadow-panel">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <h3 className="text-sm font-medium">Mahsulotlar va qaytarish miqdori</h3>
                  <div className="flex gap-2 items-center">
                    {[1, 2, 5].map((n) => (
                      <Button key={n} type="button" variant="outline" size="sm" onClick={() => setAllReturnQty(n)} className="text-xs">
                        Barcha {n}
                      </Button>
                    ))}
                    <Button type="button" variant="ghost" size="sm" onClick={() => setReturnLines([])} className="text-xs">
                      Tozalash
                    </Button>
                  </div>
                </div>

                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full min-w-[600px] border-collapse text-sm">
                    <thead className="border-b bg-muted/60 text-xs text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 text-left">Kod</th>
                        <th className="px-3 py-2 text-left">Mahsulot</th>
                        <th className="px-3 py-2 text-right">Olgan</th>
                        <th className="px-3 py-2 text-center">Qaytarish</th>
                        <th className="px-3 py-2 text-right">Summa</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Array.from(productMap.values()).map((p) => {
                        const rl = returnLines.find((l) => l.product_id === String(p.product_id));
                        const rq = Number(rl?.qty) || 0;
                        const price = priceByProduct.get(String(p.product_id)) ?? 0;
                        const rv = rq * price;
                        const isOver = rq > p.total_qty;
                        return (
                          <tr key={p.product_id} className={`border-b last:border-0 ${isOver ? "bg-red-50 dark:bg-red-950/20" : ""}`}>
                            <td className="px-3 py-2 font-mono text-xs">{p.sku}</td>
                            <td className="px-3 py-2">
                              {p.name}
                              {p.has_bonus && <span className="ml-1 text-[10px] text-amber-600">(bonus)</span>}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums">{p.total_qty}</td>
                            <td className="px-3 py-2 text-center">
                              <Input
                                type="number"
                                min={0}
                                max={p.total_qty}
                                value={rl?.qty ?? ""}
                                onChange={(e) => handleLineChange(String(p.product_id), e.target.value)}
                                className="w-20 h-8 text-center"
                                disabled={submitting}
                              />
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums">
                              {rq > 0 ? rv.toFixed(2) : "—"}
                              {isOver && <div className="text-[10px] text-red-500">Oshib ketdi!</div>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot className="border-t bg-muted/30 text-xs">
                      <tr>
                        <td colSpan={2} className="px-3 py-2">Jami qaytarish</td>
                        <td className="px-3 py-2 text-right tabular-nums">{totalReturnQty} dona</td>
                        <td />
                        <td className={`px-3 py-2 text-right tabular-nums font-medium ${totalReturnValue > maxRet ? "text-red-600" : ""}`}>
                          {totalReturnValue.toFixed(2)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* Summary */}
                <div className="rounded-lg bg-muted/30 p-3 space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Buyurtma qiymati (davr):</span>
                    <span className="tabular-nums font-medium">{clientData?.total_paid_value ?? "—"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Avval qaytarilgan:</span>
                    <span className="tabular-nums">{clientData?.already_returned_value ?? "—"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Maksimal:</span>
                    <span className="tabular-nums font-medium text-amber-600">{maxReturnable}</span>
                  </div>
                  <div className="flex justify-between border-t pt-1 mt-1">
                    <span className="text-muted-foreground">Qaytarish summasi:</span>
                    <span className={`tabular-nums font-bold ${totalReturnValue > maxRet ? "text-red-600" : totalReturnValue > 0 ? "text-emerald-600" : ""}`}>
                      {totalReturnValue.toFixed(2)}
                    </span>
                  </div>
                  {totalReturnQty > 12 && (
                    <p className="text-xs text-red-600">⚠ Max 12 ta. Hozir {totalReturnQty} ta.</p>
                  )}
                </div>

                {/* Submit */}
                <div className="flex gap-2 items-end">
                  <div className="flex-1 space-y-1">
                    <label className="text-xs text-muted-foreground">Izoh</label>
                    <Input value={note} onChange={(e) => setNote(e.target.value.slice(0, 200))} placeholder="Sabab…" />
                  </div>
                  <Button type="button" disabled={submitting || totalReturnQty === 0} onClick={handleSubmit} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                    {submitting ? "Saqlanmoqda…" : "Yaratish"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {clientId && clientDataQuery.isLoading && <p className="text-sm text-muted-foreground">Ma&apos;lumotlar yuklanmoqda…</p>}
          {clientId && clientData && productMap.size === 0 && <p className="text-sm text-muted-foreground">Tanlangan davrda mahsulot topilmadi.</p>}
          {!clientId && <p className="text-sm text-muted-foreground">Mijozni tanlang.</p>}
        </div>
      ) : (
        /* ─── Returns list ─────────────────────────────────────────────── */
        <Card className="overflow-hidden shadow-panel">
          <CardContent className="p-0">
            {listQ.isLoading && <p className="p-4 text-sm text-muted-foreground">Yuklanmoqda…</p>}
            {listQ.isError && <p className="p-4 text-sm text-destructive">Xato yuz berdi.</p>}
            {!listQ.isLoading && !listQ.isError && (
              <>
                <div className="flex items-center gap-3 px-3 pt-2">
                  {(listQ.data?.data.length ?? 0) > 0 && (
                    <span className="text-sm text-muted-foreground">Jami: {listQ.data?.data.length ?? 0} ta</span>
                  )}
                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    Ko&apos;rsatish
                    <select value={limit} onChange={(e) => setLimit(Number(e.target.value))} className="h-9 rounded-md border border-input bg-background px-2 text-sm">
                      {[30, 50, 100].map((n) => (<option key={n} value={n}>{n}</option>))}
                    </select>
                  </label>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[800px] border-collapse text-sm">
                    <thead className="border-b bg-muted/60 text-left text-xs text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2">Sana</th>
                        <th className="px-3 py-2">Raqam</th>
                        <th className="px-3 py-2">Ombor</th>
                        <th className="px-3 py-2">Mijoz</th>
                        <th className="px-3 py-2">Zakaz</th>
                        <th className="px-3 py-2 text-right">Qaytarilgan pul</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(listQ.data?.data ?? []).map((r) => (
                        <tr key={r.id} className="border-b border-border last:border-0">
                          <td className="px-3 py-2 whitespace-nowrap text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</td>
                          <td className="px-3 py-2 font-mono text-xs">{r.number}</td>
                          <td className="px-3 py-2">{r.warehouse_name}</td>
                          <td className="px-3 py-2">
                            {r.client_id != null ? (
                              <Link className="text-primary underline-offset-2 hover:underline" href={`/clients/${r.client_id}`}>
                                {r.client_name ?? r.client_id}
                              </Link>
                            ) : "—"}
                          </td>
                          <td className="px-3 py-2 font-mono text-xs">
                            {r.order_id != null && r.order_number ? (
                              <Link className="text-primary underline-offset-2 hover:underline" href={`/orders/${r.order_id}`}>
                                {r.order_number}
                              </Link>
                            ) : "—"}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">{r.refund_amount ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {(listQ.data?.data.length ?? 0) === 0 && (
                    <p className="p-6 text-center text-sm text-muted-foreground">Hozircha yozuv yo&apos;q.</p>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </PageShell>
  );
}

export default function ReturnsPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-6xl p-6 text-sm text-muted-foreground">Yuklanmoqda…</div>}>
      <ReturnsPageContent />
    </Suspense>
  );
}
