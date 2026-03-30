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
import type { ProductRow } from "@/components/products/product-form-dialog";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { AxiosError } from "axios";

type Line = { key: string; productId: string; qty: string };

function newLine(): Line {
  return { key: crypto.randomUUID(), productId: "", qty: "1" };
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantSlug: string | null;
  onCreated: () => void;
};

export function OrderCreateDialog({ open, onOpenChange, tenantSlug, onCreated }: Props) {
  const qc = useQueryClient();
  const [clientId, setClientId] = useState("");
  const [lines, setLines] = useState<Line[]>([newLine()]);
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

  useEffect(() => {
    if (!open) return;
    setLocalError(null);
    setClientId("");
    setLines([newLine()]);
  }, [open]);

  function updateLine(key: string, patch: Partial<Pick<Line, "productId" | "qty">>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function addLine() {
    setLines((prev) => [...prev, newLine()]);
  }

  function removeLine(key: string) {
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((l) => l.key !== key)));
  }

  const mutation = useMutation({
    mutationFn: async () => {
      const cid = Number.parseInt(clientId, 10);
      if (!Number.isFinite(cid) || cid < 1) throw new Error("client");

      const items: { product_id: number; qty: number }[] = [];
      for (const line of lines) {
        const pid = Number.parseInt(line.productId, 10);
        const q = Number.parseFloat(line.qty);
        if (!Number.isFinite(pid) || pid < 1) continue;
        if (!Number.isFinite(q) || q <= 0) throw new Error("qty");
        items.push({ product_id: pid, qty: q });
      }
      if (items.length === 0) throw new Error("nolines");

      await api.post(`/api/${tenantSlug}/orders`, {
        client_id: cid,
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
  const loadingLists = clientsQ.isLoading || productsQ.isLoading;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Yangi zakaz</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-2">
          {localError ? (
            <p className="text-sm text-destructive" role="alert">
              {localError}
            </p>
          ) : null}
          <div className="space-y-2">
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
            <div className="flex items-center justify-between gap-2">
              <Label>Qatorlar</Label>
              <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={addLine}>
                + Qator
              </Button>
            </div>
            <div className="flex flex-col gap-3">
              {lines.map((line, idx) => (
                <div
                  key={line.key}
                  className="grid grid-cols-1 gap-2 rounded-md border border-border p-3 sm:grid-cols-[1fr_100px_auto]"
                >
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">Mahsulot #{idx + 1}</span>
                    <select
                      className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                      value={line.productId}
                      onChange={(e) => updateLine(line.key, { productId: e.target.value })}
                      disabled={mutation.isPending || loadingLists}
                    >
                      <option value="">— tanlang —</option>
                      {products.map((p) => (
                        <option key={p.id} value={String(p.id)}>
                          {p.sku} — {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">Miqdor</span>
                    <Input
                      type="number"
                      min={0.001}
                      step="any"
                      value={line.qty}
                      onChange={(e) => updateLine(line.key, { qty: e.target.value })}
                      disabled={mutation.isPending}
                    />
                  </div>
                  <div className="flex items-end justify-end sm:justify-center">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-9 text-xs text-muted-foreground"
                      disabled={mutation.isPending || lines.length <= 1}
                      onClick={() => removeLine(line.key)}
                    >
                      O‘chirish
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Narx: har mahsulot uchun chakana (retail) narxi; bir xil mahsulotni alohida qatorlarda ham
            yuborishingiz mumkin (backend alohida qator sifatida saqlaydi).
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
