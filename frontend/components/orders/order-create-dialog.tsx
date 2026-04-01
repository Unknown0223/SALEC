"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import type { ClientRow } from "@/lib/client-types";
import type { ProductRow } from "@/lib/product-types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { AxiosError } from "axios";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantSlug: string | null;
  onCreated: () => void;
};

export function OrderCreateDialog({ open, onOpenChange, tenantSlug, onCreated }: Props) {
  const qc = useQueryClient();
  const [clientId, setClientId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [agentId, setAgentId] = useState("");
  const [applyBonus, setApplyBonus] = useState(true);
  const [selectedCategoryId, setSelectedCategoryId] = useState("");
  const [qtyByProductId, setQtyByProductId] = useState<Record<number, string>>({});
  const [localError, setLocalError] = useState<string | null>(null);

  const clientsQ = useQuery({
    queryKey: ["clients", tenantSlug, "order-form"],
    enabled: open && Boolean(tenantSlug),
    queryFn: async () => {
      const { data } = await api.get<{ data: ClientRow[] }>(
        `/api/${tenantSlug}/clients?page=1&limit=200&is_active=true`
      );
      return data.data;
    }
  });

  const productsQ = useQuery({
    queryKey: ["products", tenantSlug, "order-form"],
    enabled: open && Boolean(tenantSlug),
    queryFn: async () => {
      const { data } = await api.get<{ data: ProductRow[] }>(
        `/api/${tenantSlug}/products?page=1&limit=200&is_active=true`
      );
      return data.data;
    }
  });

  const warehousesQ = useQuery({
    queryKey: ["warehouses", tenantSlug, "order-form"],
    enabled: open && Boolean(tenantSlug),
    queryFn: async () => {
      const { data } = await api.get<{ data: { id: number; name: string }[] }>(`/api/${tenantSlug}/warehouses`);
      return data.data;
    }
  });

  const usersQ = useQuery({
    queryKey: ["users", tenantSlug, "order-form"],
    enabled: open && Boolean(tenantSlug),
    queryFn: async () => {
      const { data } = await api.get<{ data: { id: number; login: string; name: string; role: string }[] }>(
        `/api/${tenantSlug}/users`
      );
      return data.data;
    }
  });

  const stockQ = useQuery({
    queryKey: ["stock", tenantSlug, warehouseId, "order-form"],
    enabled: open && Boolean(tenantSlug) && Boolean(warehouseId),
    queryFn: async () => {
      const { data } = await api.get<{ data: { product_id: number; qty: string; reserved_qty: string }[] }>(
        `/api/${tenantSlug}/stock?warehouse_id=${warehouseId}`
      );
      return data.data;
    }
  });

  const categoriesQ = useQuery({
    queryKey: ["product-categories", tenantSlug, "order-form"],
    enabled: open && Boolean(tenantSlug),
    queryFn: async () => {
      const { data } = await api.get<{ data: { id: number; name: string }[] }>(
        `/api/${tenantSlug}/product-categories`
      );
      return data.data;
    }
  });

  useEffect(() => {
    if (!open) return;
    setLocalError(null);
    setClientId("");
    setWarehouseId("");
    setAgentId("");
    setApplyBonus(true);
    setSelectedCategoryId("");
    setQtyByProductId({});
  }, [open]);

  const mutation = useMutation({
    mutationFn: async () => {
      const cid = Number.parseInt(clientId, 10);
      if (!Number.isFinite(cid) || cid < 1) throw new Error("client");

      const items: { product_id: number; qty: number }[] = [];
      for (const p of filteredProducts) {
        const raw = qtyByProductId[p.id];
        if (!raw || !raw.trim()) continue;
        const q = Number.parseFloat(raw.replace(",", "."));
        if (!Number.isFinite(q) || q < 0) throw new Error("qty");
        if (q === 0) continue;
        items.push({ product_id: p.id, qty: q });
      }
      if (items.length === 0) throw new Error("nolines");

      await api.post(`/api/${tenantSlug}/orders`, {
        client_id: cid,
        warehouse_id: warehouseId ? Number.parseInt(warehouseId, 10) : null,
        agent_id: agentId ? Number.parseInt(agentId, 10) : null,
        apply_bonus: applyBonus,
        items
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["orders", tenantSlug] });
      onOpenChange(false);
      onCreated();
    },
    onError: (e: Error) => {
      if (e.message === "client") {
        setLocalError("Klientni tanlang.");
        return;
      }
      if (e.message === "nolines") {
        setLocalError("Kamida bitta to‘liq qator (mahsulot + miqdor) kerak.");
        return;
      }
      if (e.message === "qty") {
        setLocalError("Barcha qatorlarda miqdor musbat bo‘lsin.");
        return;
      }
      const ax = e as AxiosError<{
        error?: string;
        product_id?: number;
        credit_limit?: string;
        outstanding?: string;
        order_total?: string;
      }>;
      const code = ax.response?.data?.error;
      const d = ax.response?.data;
      if (code === "NoRetailPrice") {
        const id = ax.response?.data?.product_id;
        setLocalError(
          id != null
            ? `Mahsulot #${id} uchun chakana narxi yo‘q. Avval narx qo‘ying.`
            : "Chakana narxi yo‘q."
        );
        return;
      }
      if (code === "BadClient") {
        setLocalError("Klient topilmadi yoki faol emas.");
        return;
      }
      if (code === "BadProduct") {
        setLocalError("Mahsulot topilmadi yoki faol emas.");
        return;
      }
      if (code === "DuplicateProduct") {
        setLocalError("Bir xil mahsulotni bir nechta qatorga qo‘shib bo‘lmaydi.");
        return;
      }
      if (code === "CreditLimitExceeded" && d) {
        setLocalError(
          `Kredit limiti yetmaydi. Limit: ${d.credit_limit ?? "—"}, ochiq zakazlar yig‘indisi: ${d.outstanding ?? "—"}, bu zakaz: ${d.order_total ?? "—"}.`
        );
        return;
      }
      if (ax.response?.status === 403) {
        setLocalError("Zakaz yaratish huquqi yo‘q (faqat admin / operator).");
        return;
      }
      setLocalError(ax.response?.data?.error ?? e.message ?? "Xato");
    }
  });

  const clients = clientsQ.data ?? [];
  const products = productsQ.data ?? [];
  const warehouses = warehousesQ.data ?? [];
  const users = usersQ.data ?? [];
  const categories = categoriesQ.data ?? [];
  const agentUsers = users.filter((u) => {
    const role = u.role.trim().toLowerCase();
    return role.includes("agent") && !role.includes("expeditor");
  });
  const stockByProduct = new Map<number, { qty: string; reserved_qty: string }>(
    (stockQ.data ?? []).map((s) => [s.product_id, s])
  );
  const selectedCategoryNum = selectedCategoryId ? Number.parseInt(selectedCategoryId, 10) : null;
  const filteredProducts = products.filter((p) => {
    if (selectedCategoryNum != null && p.category_id !== selectedCategoryNum) return false;
    if (!warehouseId) return true;
    const s = stockByProduct.get(p.id);
    const qty = Number.parseFloat(s?.qty ?? "0");
    return Number.isFinite(qty) && qty > 0;
  });
  const loadingLists =
    clientsQ.isLoading ||
    productsQ.isLoading ||
    warehousesQ.isLoading ||
    usersQ.isLoading ||
    categoriesQ.isLoading;
  const selectedItemsCount = filteredProducts.reduce((acc, p) => {
    const raw = qtyByProductId[p.id];
    const q = Number.parseFloat((raw ?? "").replace(",", "."));
    return Number.isFinite(q) && q > 0 ? acc + 1 : acc;
  }, 0);
  const selectedTotalQty = filteredProducts
    .reduce((acc, p) => {
      const raw = qtyByProductId[p.id];
      const q = Number.parseFloat((raw ?? "").replace(",", "."));
      return Number.isFinite(q) && q > 0 ? acc + q : acc;
    }, 0)
    .toFixed(3)
    .replace(/\.?0+$/, "");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[96vw] w-[1200px] max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Yangi zakaz</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-2">
          {localError ? (
            <p className="text-sm text-destructive" role="alert">
              {localError}
            </p>
          ) : null}
          <div className="rounded-lg border border-border bg-muted/20 p-3">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div className="space-y-2 md:col-span-3">
                <Label htmlFor="oc-client">Klient</Label>
                <select
                  id="oc-client"
                  className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  disabled={mutation.isPending || loadingLists}
                >
                  <option value="">— tanlang —</option>
                  {clients.map((c) => (
                    <option key={c.id} value={String(c.id)}>
                      {c.name}
                      {c.phone ? ` · ${c.phone}` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="oc-warehouse">Ombor</Label>
                <select
                  id="oc-warehouse"
                  className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                  value={warehouseId}
                  onChange={(e) => setWarehouseId(e.target.value)}
                  disabled={mutation.isPending || loadingLists}
                >
                  <option value="">— tanlang —</option>
                  {warehouses.map((w) => (
                    <option key={w.id} value={String(w.id)}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="oc-agent">Agent</Label>
                <select
                  id="oc-agent"
                  className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                  value={agentId}
                  onChange={(e) => setAgentId(e.target.value)}
                  disabled={mutation.isPending || loadingLists}
                >
                  <option value="">— tanlang —</option>
                  {agentUsers.map((u) => (
                    <option key={u.id} value={String(u.id)}>
                      {u.login} · {u.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-end">
                <label className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={applyBonus}
                    onChange={(e) => setApplyBonus(e.target.checked)}
                    disabled={mutation.isPending}
                  />
                  Bonus qoidalarini qo‘llash
                </label>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="oc-category">Kategoriya</Label>
                <select
                  id="oc-category"
                  className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                  value={selectedCategoryId}
                  onChange={(e) => setSelectedCategoryId(e.target.value)}
                  disabled={mutation.isPending || loadingLists}
                >
                  <option value="">— barchasi —</option>
                  {categories.map((c) => (
                    <option key={c.id} value={String(c.id)}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="rounded-md border border-border bg-muted/20 px-3 py-2 text-sm">
                <p className="text-xs text-muted-foreground">Tanlangan pozitsiyalar</p>
                <p className="font-medium">{selectedItemsCount} ta</p>
              </div>
              <div className="rounded-md border border-border bg-muted/20 px-3 py-2 text-sm">
                <p className="text-xs text-muted-foreground">Jami miqdor</p>
                <p className="font-medium tabular-nums">{selectedTotalQty}</p>
              </div>
            </div>
            <div className="rounded-md border border-border">
              <div className="max-h-[420px] overflow-auto">
                <table className="w-full min-w-[640px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50 text-left text-xs font-medium text-muted-foreground">
                      <th className="px-3 py-2">SKU</th>
                      <th className="px-3 py-2">Mahsulot</th>
                      <th className="px-3 py-2 text-right">Qoldiq</th>
                      <th className="px-3 py-2 text-right">Bron</th>
                      <th className="px-3 py-2">Miqdor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProducts.map((p) => {
                      const stock = stockByProduct.get(p.id);
                      const qty = stock?.qty ?? "0";
                      const reserved = stock?.reserved_qty ?? "0";
                      return (
                        <tr key={p.id} className="border-b border-border last:border-0">
                          <td className="px-3 py-2 font-mono text-xs">{p.sku}</td>
                          <td className="px-3 py-2">{p.name}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{qty}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{reserved}</td>
                          <td className="px-3 py-2">
                            <Input
                              type="number"
                              min={0}
                              step="any"
                              placeholder="0"
                              value={qtyByProductId[p.id] ?? ""}
                              onChange={(e) =>
                                setQtyByProductId((prev) => ({ ...prev, [p.id]: e.target.value }))
                              }
                              disabled={mutation.isPending}
                            />
                          </td>
                        </tr>
                      );
                    })}
                    {filteredProducts.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-3 py-4 text-center text-xs text-muted-foreground">
                          Mahsulot topilmadi (kategoriya/ombor bo‘yicha).
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Qator qo‘shish yo‘q: miqdorni jadvaldan kiriting. Ombor tanlanganda qoldiqi 0 bo‘lganlar ko‘rinmaydi.
            {loadingLists ? " Ma’lumotlar yuklanmoqda..." : ""}
          </p>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            Bekor
          </Button>
          <Button type="button" onClick={() => mutation.mutate()} disabled={mutation.isPending || !tenantSlug}>
            {mutation.isPending ? "Saqlanmoqda…" : "Yaratish"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
