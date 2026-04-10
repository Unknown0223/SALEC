"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { getUserFacingError } from "@/lib/error-utils";
import { formatNumberGrouped } from "@/lib/format-numbers";
import { STALE } from "@/lib/query-stale";
import { refEntryLabelByStored } from "@/lib/profile-ref-entries";
import type { ProductRow } from "@/lib/product-types";
import { OrderPrintView } from "./order-print-view";
import axios, { type AxiosError } from "axios";
import { useEffectiveRole } from "@/lib/auth-store";
import { ORDER_STATUS_LABELS, orderStatusTransitionDirection } from "@/lib/order-status";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useState } from "react";

export type OrderListRow = {
  id: number;
  number: string;
  order_type: string | null;
  client_id: number;
  client_name: string;
  client_legal_name: string | null;
  warehouse_id: number | null;
  warehouse_name: string | null;
  agent_name: string | null;
  agent_code: string | null;
  expeditors: string | null;
  expeditor_id: number | null;
  expeditor_display: string | null;
  region: string | null;
  city: string | null;
  zone: string | null;
  consignment: boolean | null;
  day: string | null;
  created_by: string | null;
  created_by_role: string | null;
  expected_ship_date: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  status: string;
  qty: string;
  total_sum: string;
  /** Bonus mahsulotlar jami donasi (API yangilangach doim keladi) */
  bonus_qty?: string;
  /** Foizli chegirma summasi */
  discount_sum?: string;
  /** Bonus qatorlarining narxlangan qiymati */
  bonus_sum: string;
  balance: string | null;
  debt: string | null;
  price_type: string | null;
  comment: string | null;
  /** «Причины заявок» kod/nom */
  request_type_ref?: string | null;
  created_at: string;
  /** Ro‘yxat API dan; tafsilotda bo‘lmasa bo‘sh. */
  allowed_next_statuses?: string[];
};

export type OrderItemRow = {
  id: number;
  product_id: number;
  sku: string;
  name: string;
  qty: string;
  price: string;
  total: string;
  is_bonus: boolean;
};

export type OrderStatusLogRow = {
  id: number;
  from_status: string;
  to_status: string;
  user_login: string | null;
  created_at: string;
};

export type OrderChangeLogRow = {
  id: number;
  action: string;
  payload: unknown;
  user_login: string | null;
  created_at: string;
};

export type BonusGiftSwapOptionRow = {
  bonus_rule_id: number;
  rule_name: string;
  allowed_product_ids: number[];
  chosen_product_id: number;
  products: Array<{ id: number; name: string; sku: string }>;
};

export type OrderDetailRow = OrderListRow & {
  agent_id: number | null;
  warehouse_name: string | null;
  agent_display: string | null;
  apply_bonus: boolean;
  items: OrderItemRow[];
  allowed_next_statuses: string[];
  status_logs: OrderStatusLogRow[];
  change_logs: OrderChangeLogRow[];
  bonus_gift_selections?: Record<string, number>;
  bonus_gift_swap_options?: BonusGiftSwapOptionRow[];
  client_finance?: {
    account_balance: string;
    credit_limit: string;
    outstanding: string;
    headroom: string;
  };
};

type PaymentRow = {
  id: number;
  client_id: number;
  client_name: string;
  order_id: number | null;
  order_number: string | null;
  amount: string;
  payment_type: string;
  note: string | null;
  created_at: string;
};

type ReturnRow = {
  id: number;
  number: string;
  refund_amount: string | null;
  created_at: string;
};

type Props = {
  tenantSlug: string | null;
  orderId: number;
  showPrintView?: boolean;
};

type Line = { key: string; productId: string; qty: string };

function newLine(): Line {
  return { key: crypto.randomUUID(), productId: "", qty: "1" };
}

function paidItemsToLines(items: OrderItemRow[]): Line[] {
  const paid = items.filter((i) => !i.is_bonus);
  if (paid.length === 0) return [newLine()];
  return paid.map((i) => ({
    key: crypto.randomUUID(),
    productId: String(i.product_id),
    qty: i.qty
  }));
}

const ORDER_LINES_EDITABLE_STATUSES = new Set(["new", "confirmed"]);

function formatIdDelta(v: unknown): string {
  if (v === null || v === undefined) return "—";
  return String(v);
}

function formatOrderChangeSummary(action: string, payload: unknown): string {
  if (!payload || typeof payload !== "object") return "—";
  const p = payload as Record<string, unknown>;
  if (action === "meta") {
    const wh = p.warehouse_id as { from?: unknown; to?: unknown } | undefined;
    const ag = p.agent_id as { from?: unknown; to?: unknown } | undefined;
    const ex = p.expeditor_user_id as { from?: unknown; to?: unknown } | undefined;
    const parts: string[] = [];
    if (wh) parts.push(`Ombor ID: ${formatIdDelta(wh.from)} → ${formatIdDelta(wh.to)}`);
    if (ag) parts.push(`Agent ID: ${formatIdDelta(ag.from)} → ${formatIdDelta(ag.to)}`);
    if (ex) parts.push(`Dastavchik ID: ${formatIdDelta(ex.from)} → ${formatIdDelta(ex.to)}`);
    return parts.join("; ") || "—";
  }
  if (action === "lines") {
    const ts = p.total_sum as { from?: string; to?: string } | undefined;
    const bs = p.bonus_sum as { from?: string; to?: string } | undefined;
    const parts: string[] = [];
    if (ts) parts.push(`To‘lov jami: ${ts.from ?? "—"} → ${ts.to ?? "—"}`);
    if (bs) parts.push(`Bonus: ${bs.from ?? "—"} → ${bs.to ?? "—"}`);
    return parts.join("; ") || "To‘lov qatorlari yangilandi";
  }
  return JSON.stringify(payload);
}

function changeLogActionLabel(action: string): string {
  if (action === "lines") return "To‘lov qatorlari";
  if (action === "meta") return "Ombor / agent / dastavchik";
  return action;
}

function statusOptionPrefix(from: string, to: string): string {
  const d = orderStatusTransitionDirection(from, to);
  if (d === "backward") return "← ";
  if (d === "forward") return "→ ";
  return "";
}

function patchOrderLinesErrorMessage(err: unknown): string | null {
  if (!axios.isAxiosError(err)) return null;
  const ax = err as AxiosError<{
    error?: string;
    product_id?: number;
    credit_limit?: string;
    outstanding?: string;
    order_total?: string;
  }>;
  const code = ax.response?.data?.error;
  const d = ax.response?.data;
  if (code === "OrderNotEditable") {
    return "Bu holatda qatorlarni tahrirlab bo‘lmaydi (faqat «Новый» yoki «Подтверждён»).";
  }
  if (code === "ForbiddenOperatorOrderLinesEdit") {
    return "To‘lov qatorlarini tahrirlash faqat admin uchun.";
  }
  if (code === "NoRetailPrice" || code === "NoPrice") {
    const id = d?.product_id;
    const pt = (d as { price_type?: string } | undefined)?.price_type ?? "retail";
    return id != null
      ? `Mahsulot #${id} uchun «${pt}» narxi yo‘q.`
      : `Narx yo‘q («${pt}»).`;
  }
  if (code === "BadClient") return "Klient (zakaz) topilmadi yoki faol emas.";
  if (code === "BadProduct") return "Mahsulot topilmadi yoki faol emas.";
  if (code === "BadQty") return "Miqdor noto‘g‘ri.";
  if (code === "DuplicateProduct") return "Bir xil mahsulotni bir nechta qatorga qo‘shib bo‘lmaydi.";
  if (code === "EmptyItems") return "Kamida bitta to‘lov qatori kerak.";
  if (code === "CreditLimitExceeded" && d) {
    return `Kredit limiti yetmaydi. Limit: ${d.credit_limit ?? "—"}, boshqa zakazlar: ${d.outstanding ?? "—"}, bu zakaz to‘lovi: ${d.order_total ?? "—"}.`;
  }
  if (ax.response?.status === 403) {
    return "Tahrirlash huquqi yo‘q (faqat admin / operator).";
  }
  return null;
}

export function OrderDetailView({ tenantSlug, orderId, showPrintView = false }: Props) {
  const qc = useQueryClient();
  const role = useEffectiveRole();
  const canOperate = role === "admin" || role === "operator";
  const [editingLines, setEditingLines] = useState(false);
  const [lines, setLines] = useState<Line[]>([newLine()]);
  const [editError, setEditError] = useState<string | null>(null);
  const [statusDraft, setStatusDraft] = useState("");
  const [metaWarehouse, setMetaWarehouse] = useState("");
  const [metaAgent, setMetaAgent] = useState("");
  const [metaExpeditor, setMetaExpeditor] = useState("");
  /** true bo‘lsa PATCH da `expeditor_user_id` yuboriladi; yo‘q bo‘lsa ombor/agent o‘zgaganda avto qayta tanlanadi */
  const [metaExpeditorTouched, setMetaExpeditorTouched] = useState(false);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [commentDraft, setCommentDraft] = useState("");

  useEffect(() => {
    setEditingLines(false);
    setEditError(null);
    setLines([newLine()]);
    setStatusDraft("");
    setMetaWarehouse("");
    setMetaAgent("");
    setMetaExpeditor("");
    setMetaExpeditorTouched(false);
    setMetaError(null);
    setCommentDraft("");
  }, [orderId]);

  const enabled = Boolean(tenantSlug) && orderId > 0;

  const { data, isLoading, isError } = useQuery({
    queryKey: ["order", tenantSlug, orderId],
    enabled,
    staleTime: STALE.detail,
    queryFn: async () => {
      const { data: body } = await api.get<OrderDetailRow>(
        `/api/${tenantSlug}/orders/${orderId}`
      );
      return body;
    }
  });

  const profileRefsQ = useQuery({
    queryKey: ["settings", "profile", tenantSlug, "order-detail-refs"],
    enabled: Boolean(tenantSlug) && enabled,
    staleTime: STALE.profile,
    queryFn: async () => {
      const { data: body } = await api.get<{
        references: { request_type_entries?: unknown };
      }>(`/api/${tenantSlug}/settings/profile`);
      return body;
    }
  });

  useEffect(() => {
    if (!data) return;
    setMetaWarehouse(data.warehouse_id != null ? String(data.warehouse_id) : "");
    setMetaAgent(data.agent_id != null ? String(data.agent_id) : "");
    setMetaExpeditor(data.expeditor_id != null ? String(data.expeditor_id) : "");
    setMetaExpeditorTouched(false);
    setMetaError(null);
    setCommentDraft(data.comment ?? "");
  }, [data]);

  const paymentsListQ = useQuery({
    queryKey: ["order-payments", tenantSlug, orderId],
    enabled: enabled && canOperate,
    staleTime: STALE.detail,
    queryFn: async () => {
      const { data: body } = await api.get<{ data: PaymentRow[] }>(
        `/api/${tenantSlug}/orders/${orderId}/payments`
      );
      return body.data;
    }
  });

  const returnsListQ = useQuery({
    queryKey: ["order-returns", tenantSlug, orderId],
    enabled: enabled && canOperate,
    staleTime: STALE.detail,
    queryFn: async () => {
      const { data: body } = await api.get<{ data: ReturnRow[] }>(
        `/api/${tenantSlug}/orders/${orderId}/returns`
      );
      return body.data;
    }
  });

  const [fullReturnError, setFullReturnError] = useState<string | null>(null);

  const fullReturnMut = useMutation({
    mutationFn: async () => {
      await api.post(`/api/${tenantSlug}/returns/full-order`, { order_id: orderId });
    },
    onSuccess: async () => {
      setFullReturnError(null);
      await qc.invalidateQueries({ queryKey: ["order", tenantSlug, orderId] });
      await qc.invalidateQueries({ queryKey: ["order-returns", tenantSlug, orderId] });
      await qc.invalidateQueries({ queryKey: ["orders", tenantSlug] });
      await qc.invalidateQueries({ queryKey: ["returns", tenantSlug] });
    },
    onError: (err: unknown) => {
      if (!axios.isAxiosError(err)) {
        setFullReturnError("So‘rov bajarilmadi.");
        return;
      }
      const code = (err.response?.data as { error?: string } | undefined)?.error;
      if (code === "OrderNotReturnable") {
        setFullReturnError("Bu holatda to‘liq qaytarish mumkin emas.");
      } else if (code === "OrderAlreadyFullyReturned") {
        setFullReturnError("Bu zakaz allaqachon to‘liq qaytarilgan.");
      } else if (code === "NoWarehouse") {
        setFullReturnError("Qaytarish ombori topilmadi.");
      } else {
        setFullReturnError(getUserFacingError(err, "To‘liq qaytarish bajarilmadi."));
      }
    }
  });

  const warehousesQ = useQuery({
    queryKey: ["warehouses", tenantSlug],
    enabled: enabled && canOperate,
    staleTime: STALE.reference,
    queryFn: async () => {
      const { data: body } = await api.get<{ data: { id: number; name: string }[] }>(
        `/api/${tenantSlug}/warehouses`
      );
      return body.data;
    }
  });

  const usersQ = useQuery({
    queryKey: ["users", tenantSlug, "order-meta"],
    enabled: enabled && canOperate,
    staleTime: STALE.reference,
    queryFn: async () => {
      const { data: body } = await api.get<{
        data: { id: number; login: string; name: string; role: string }[];
      }>(`/api/${tenantSlug}/users`);
      return body.data;
    }
  });
  const expeditorsQ = useQuery({
    queryKey: ["expeditors", tenantSlug, "order-detail-meta"],
    enabled: enabled && canOperate,
    staleTime: STALE.reference,
    queryFn: async () => {
      const { data: body } = await api.get<{
        data: Array<{ id: number; fio: string; login: string; is_active: boolean }>;
      }>(`/api/${tenantSlug}/expeditors`);
      return body.data.filter((r) => r.is_active);
    }
  });
  const agentUsers = (usersQ.data ?? []).filter((u) => {
    const role = u.role.trim().toLowerCase();
    return role.includes("agent") && !role.includes("expeditor");
  });

  const canPatchMeta =
    canOperate && data != null && ORDER_LINES_EDITABLE_STATUSES.has(data.status);

  const canEditOrderLines =
    role === "admin" && data != null && ORDER_LINES_EDITABLE_STATUSES.has(data.status);

  const canFullReturn =
    canOperate &&
    data != null &&
    data.allowed_next_statuses.includes("returned");

  const productsQ = useQuery({
    queryKey: ["products", tenantSlug, "order-edit"],
    enabled: enabled && editingLines && canEditOrderLines,
    staleTime: STALE.reference,
    queryFn: async () => {
      const { data: body } = await api.get<{ data: ProductRow[] }>(
        `/api/${tenantSlug}/products?page=1&limit=200&is_active=true`
      );
      return body.data;
    }
  });

  const statusMut = useMutation({
    mutationFn: async (next: string) => {
      const { data: body } = await api.patch<OrderDetailRow>(
        `/api/${tenantSlug}/orders/${orderId}/status`,
        { status: next }
      );
      return body;
    },
    onSuccess: (body) => {
      void qc.setQueryData(["order", tenantSlug, orderId], body);
      void qc.invalidateQueries({ queryKey: ["orders", tenantSlug] });
      setStatusDraft("");
    }
  });

  const metaMut = useMutation({
    mutationFn: async (payload: {
      warehouse_id?: number | null;
      agent_id?: number | null;
      expeditor_user_id?: number | null;
      comment?: string | null;
    }) => {
      const { data: body } = await api.patch<OrderDetailRow>(
        `/api/${tenantSlug}/orders/${orderId}/meta`,
        payload
      );
      return body;
    },
    onSuccess: (body) => {
      void qc.setQueryData(["order", tenantSlug, orderId], body);
      void qc.invalidateQueries({ queryKey: ["orders", tenantSlug] });
      setMetaError(null);
    },
    onError: (e: Error) => {
      if (axios.isAxiosError(e)) {
        const code = (e.response?.data as { error?: string } | undefined)?.error;
        if (code === "OrderNotEditable") {
          setMetaError("Bu holatda ombor/agentni o‘zgartirib bo‘lmaydi.");
          return;
        }
        if (code === "BadWarehouse") {
          setMetaError("Ombor topilmadi.");
          return;
        }
        if (code === "BadAgent") {
          setMetaError("Foydalanuvchi (agent) topilmadi yoki faol emas.");
          return;
        }
        if (code === "BadExpeditor") {
          setMetaError("Dastavchik (ekspeditor) topilmadi yoki faol emas.");
          return;
        }
      }
      setMetaError("Saqlab bo‘lmadi.");
    }
  });

  const patchLinesMut = useMutation({
    mutationFn: async (items: { product_id: number; qty: number }[]) => {
      const { data: body } = await api.patch<OrderDetailRow>(
        `/api/${tenantSlug}/orders/${orderId}`,
        { items }
      );
      return body;
    },
    onSuccess: (body) => {
      void qc.setQueryData(["order", tenantSlug, orderId], body);
      void qc.invalidateQueries({ queryKey: ["orders", tenantSlug] });
      setEditingLines(false);
      setEditError(null);
    },
    onError: (e: Error) => {
      const msg = patchOrderLinesErrorMessage(e);
      if (msg) {
        setEditError(msg);
        return;
      }
      if (axios.isAxiosError(e)) {
        const code = (e.response?.data as { error?: string } | undefined)?.error;
        setEditError(code ?? e.message ?? "Saqlab bo‘lmadi.");
        return;
      }
      setEditError(e.message ?? "Saqlab bo‘lmadi.");
    }
  });

  const [bonusGiftError, setBonusGiftError] = useState<string | null>(null);

  const bonusGiftMut = useMutation({
    mutationFn: async (payload: { ruleId: number; productId: number }) => {
      const cur = qc.getQueryData<OrderDetailRow>(["order", tenantSlug, orderId]);
      if (!cur) throw new Error("no data");
      const items = cur.items
        .filter((i) => !i.is_bonus)
        .map((i) => ({
          product_id: i.product_id,
          qty: Number.parseFloat(String(i.qty).replace(",", "."))
        }))
        .filter((l) => Number.isFinite(l.qty) && l.qty > 0);
      const { data: body } = await api.patch<OrderDetailRow>(`/api/${tenantSlug}/orders/${orderId}`, {
        items,
        bonus_gift_overrides: [{ bonus_rule_id: payload.ruleId, bonus_product_id: payload.productId }]
      });
      return body;
    },
    onSuccess: (body) => {
      void qc.setQueryData(["order", tenantSlug, orderId], body);
      void qc.invalidateQueries({ queryKey: ["orders", tenantSlug] });
      setBonusGiftError(null);
    },
    onError: (e: Error) => {
      if (axios.isAxiosError(e)) {
        const code = (e.response?.data as { error?: string } | undefined)?.error;
        if (code === "BadBonusGiftOverride") {
          setBonusGiftError("Tanlov qoidadagi ro‘yxatga mos kelmaydi.");
          return;
        }
        if (code === "InsufficientStock") {
          setBonusGiftError("Tanlangan bonus uchun omborda qoldiq yetarli emas.");
          return;
        }
      }
      setBonusGiftError("Saqlab bo‘lmadi.");
    }
  });

  function updateLine(key: string, patch: Partial<Pick<Line, "productId" | "qty">>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function addLine() {
    setLines((prev) => [...prev, newLine()]);
  }

  function removeLine(key: string) {
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((l) => l.key !== key)));
  }

  function startEditLines() {
    if (!data) return;
    setLines(paidItemsToLines(data.items));
    setEditError(null);
    setEditingLines(true);
  }

  function cancelEditLines() {
    setEditingLines(false);
    setEditError(null);
  }

  const products = productsQ.data ?? [];
  const loadingProducts = productsQ.isLoading;

  const saveLines = () => {
    setEditError(null);
    const items: { product_id: number; qty: number }[] = [];
    const selected = new Set<number>();
    for (const line of lines) {
      const pid = Number.parseInt(line.productId, 10);
      const q = Number.parseFloat(line.qty.replace(",", "."));
      if (!Number.isFinite(pid) || pid < 1) continue;
      if (selected.has(pid)) {
        setEditError("Bir xil mahsulotni bir nechta qatorga qo‘shib bo‘lmaydi.");
        return;
      }
      selected.add(pid);
      if (!Number.isFinite(q) || q <= 0) {
        setEditError("Barcha qatorlarda miqdor musbat bo‘lsin.");
        return;
      }
      items.push({ product_id: pid, qty: q });
    }
    if (items.length === 0) {
      setEditError("Kamida bitta to‘liq qator (mahsulot + miqdor) kerak.");
      return;
    }
    patchLinesMut.mutate(items);
  };

  const readOnlyHint =
    "Faqat to‘lov qatorlari tahrirlanadi; bonuslar qayta hisoblanadi (avtomatik qoidalar bo‘yicha).";

  const allowedStatuses = data?.allowed_next_statuses ?? [];
  const sortedStatusOptions = [...allowedStatuses].sort((a, b) => {
    const da = orderStatusTransitionDirection(data?.status ?? "", a);
    const db = orderStatusTransitionDirection(data?.status ?? "", b);
    const order = (x: string) => (x === "forward" ? 0 : x === "unknown" ? 1 : 2);
    return order(da) - order(db);
  });

  if (!tenantSlug) {
    return <p className="text-sm text-destructive">Tenant aniqlanmadi.</p>;
  }

  // Print view — render only when user clicks print button
  if (showPrintView && data) {
    return (
      <OrderPrintView
        order={{
          id: data.id,
          number: data.number,
          status: data.status,
          total_sum: data.total_sum,
          bonus_sum: data.bonus_sum ?? "0",
          comment: data.comment,
          created_at: data.created_at,
          client_name: data.client_name,
          client_address: null,
          client_phone: null,
          client_inn: null,
          warehouse_name: data.warehouse_name,
          agent_name: data.agent_name
        }}
        items={(data.items ?? []).map((item) => ({
          id: item.id,
          sku: item.sku,
          name: item.name,
          unit: "dona",
          qty: item.qty,
          price: item.price,
          total: item.total,
          is_bonus: item.is_bonus
        }))}
      />
    );
  }

  if (!enabled) {
    return <p className="text-sm text-destructive">Noto’g’ri zakaz identifikatori.</p>;
  }

  return (
    <div className="flex flex-col gap-8 text-sm">
      <section className="space-y-2">
        <h2 className="text-base font-semibold tracking-tight">Asosiy ma’lumotlar</h2>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Загрузка…</p>
        ) : isError || !data ? (
          <p className="text-sm text-destructive">Yuklab bo‘lmadi yoki zakaz topilmadi.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border shadow-sm">
            <table className="w-full min-w-[520px] border-collapse text-sm">
              <tbody>
                <tr className="border-b border-border bg-muted/30">
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground w-40">
                    Raqam
                  </th>
                  <td className="px-4 py-3 font-mono text-xs">{data.number}</td>
                </tr>
                <tr className="border-b border-border">
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                    Klient
                  </th>
                  <td className="px-4 py-3">
                    {tenantSlug ? (
                      <Link
                        href={`/clients/${data.client_id}`}
                        className="font-medium text-primary underline-offset-2 hover:underline"
                      >
                        {data.client_name}
                      </Link>
                    ) : (
                      data.client_name
                    )}
                  </td>
                </tr>
                <tr className="border-b border-border">
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                    Ombor
                  </th>
                  <td className="px-4 py-3">{data.warehouse_name ?? "—"}</td>
                </tr>
                <tr className="border-b border-border">
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                    Agent
                  </th>
                  <td className="px-4 py-3">{data.agent_display ?? "—"}</td>
                </tr>
                <tr className="border-b border-border">
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                    Dastavchik
                  </th>
                  <td className="px-4 py-3">{data.expeditor_display ?? data.expeditors ?? "—"}</td>
                </tr>
                <tr className="border-b border-border">
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                    Bonus rejimi
                  </th>
                  <td className="px-4 py-3">{data.apply_bonus ? "Bonus bilan" : "Bonussiz"}</td>
                </tr>
                <tr className="border-b border-border">
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                    Holat
                  </th>
                  <td className="px-4 py-3 font-medium">
                    {ORDER_STATUS_LABELS[data.status] ?? data.status}
                  </td>
                </tr>
                <tr className="border-b border-border">
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                    To‘lov (mahsulot)
                  </th>
                  <td className="px-4 py-3 tabular-nums font-medium">
                    {formatNumberGrouped(data.total_sum, { maxFractionDigits: 2 })}
                  </td>
                </tr>
                <tr className="border-b border-border">
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                    Skidka
                  </th>
                  <td className="px-4 py-3 tabular-nums font-medium text-amber-800 dark:text-amber-200">
                    {Number(data.discount_sum ?? 0) > 0
                      ? formatNumberGrouped(data.discount_sum, { maxFractionDigits: 0 })
                      : "—"}
                  </td>
                </tr>
                <tr className="border-b border-border">
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                    Bonus (mahsulot, dona)
                  </th>
                  <td className="px-4 py-3 tabular-nums font-medium text-emerald-700 dark:text-emerald-400">
                    {Number(data.bonus_qty ?? 0) > 0
                      ? formatNumberGrouped(data.bonus_qty, { maxFractionDigits: 3 })
                      : "—"}
                  </td>
                </tr>
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                    Bonus qiymati (narx)
                  </th>
                  <td className="px-4 py-3 tabular-nums text-sm text-muted-foreground">
                    {Number(data.bonus_sum) > 0
                      ? formatNumberGrouped(data.bonus_sum, { maxFractionDigits: 2 })
                      : "—"}
                  </td>
                </tr>
                {data.request_type_ref?.trim() ? (
                  <tr className="border-b border-border">
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                      Заявка turi
                    </th>
                    <td className="px-4 py-3 text-muted-foreground">
                      {refEntryLabelByStored(
                        profileRefsQ.data?.references?.request_type_entries,
                        data.request_type_ref
                      ) ?? data.request_type_ref}
                    </td>
                  </tr>
                ) : null}
                <tr className="border-t border-border">
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground align-top">
                    Izoh
                  </th>
                  <td className="px-4 py-3 whitespace-pre-wrap text-muted-foreground">
                    {data.comment?.trim() ? data.comment : "—"}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </section>

      {!isLoading && !isError && data ? (
        <>
          {canOperate && data.status !== "cancelled" ? (
            <section className="space-y-2">
              <h2 className="text-base font-semibold tracking-tight">Izohni tahrirlash</h2>
              <div className="rounded-lg border border-border bg-muted/10 p-4 space-y-3 max-w-2xl">
                <textarea
                  className="min-h-[88px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={commentDraft}
                  onChange={(e) => setCommentDraft(e.target.value)}
                  maxLength={4000}
                  disabled={metaMut.isPending}
                  placeholder="Ichki izoh…"
                />
                <Button
                  type="button"
                  size="sm"
                  className="h-9"
                  disabled={metaMut.isPending}
                  onClick={() => metaMut.mutate({ comment: commentDraft.trim() || null })}
                >
                  {metaMut.isPending ? "Saqlanmoqda…" : "Izohni saqlash"}
                </Button>
              </div>
            </section>
          ) : null}

          {canOperate ? (
            <section className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base font-semibold tracking-tight">To‘lovlar</h2>
                <Link
                  className="text-sm font-medium text-primary underline-offset-2 hover:underline"
                  href={`/payments/new?client_id=${data.client_id}&order_id=${orderId}`}
                >
                  + To‘lov kiritish
                </Link>
              </div>
              {paymentsListQ.isLoading ? (
                <p className="text-xs text-muted-foreground">Загрузка…</p>
              ) : (
                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full min-w-[480px] border-collapse text-xs">
                    <thead className="app-table-thead text-left">
                      <tr>
                        <th className="px-3 py-2">Sana</th>
                        <th className="px-3 py-2">Tur</th>
                        <th className="px-3 py-2 text-right">Summa</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(paymentsListQ.data ?? []).map((p) => (
                        <tr key={p.id} className="border-b border-border last:border-0">
                          <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                            {new Date(p.created_at).toLocaleString()}
                          </td>
                          <td className="px-3 py-2">{p.payment_type}</td>
                          <td className="px-3 py-2 text-right tabular-nums font-medium">
                            {formatNumberGrouped(p.amount, { maxFractionDigits: 2 })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {(paymentsListQ.data ?? []).length === 0 ? (
                    <p className="p-4 text-center text-xs text-muted-foreground">Hozircha to‘lov yo‘q.</p>
                  ) : null}
                </div>
              )}

              <h2 className="text-base font-semibold tracking-tight pt-2">Qaytarishlar</h2>
              {returnsListQ.isLoading ? (
                <p className="text-xs text-muted-foreground">Загрузка…</p>
              ) : (
                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full min-w-[480px] border-collapse text-xs">
                    <thead className="app-table-thead text-left">
                      <tr>
                        <th className="px-3 py-2">Raqam</th>
                        <th className="px-3 py-2">Sana</th>
                        <th className="px-3 py-2 text-right">Refund</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(returnsListQ.data ?? []).map((r) => (
                        <tr key={r.id} className="border-b border-border last:border-0">
                          <td className="px-3 py-2 font-mono">{r.number}</td>
                          <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                            {new Date(r.created_at).toLocaleString()}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {r.refund_amount == null
                              ? "—"
                              : formatNumberGrouped(r.refund_amount, { maxFractionDigits: 2 })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {(returnsListQ.data ?? []).length === 0 ? (
                    <p className="p-4 text-center text-xs text-muted-foreground">Qaytarish yo‘q.</p>
                  ) : null}
                </div>
              )}
              <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
                <Link
                  className="text-sm text-primary underline-offset-2 hover:underline"
                  href={`/returns?tab=polki&polki_mode=order&client_id=${data.client_id}&order_id=${orderId}`}
                >
                  Qisman qaytarish (polki)
                </Link>
                {canFullReturn ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 border-destructive/40 text-destructive hover:bg-destructive/10"
                    disabled={fullReturnMut.isPending}
                    onClick={() => {
                      setFullReturnError(null);
                      if (
                        !window.confirm(
                          "Butun zakaz qaytariladi: mahsulotlar qaytarish omboriga qaytadi, mijoz balansiga zakaz summasi qo‘shiladi, zakaz «Qaytarildi» holatiga o‘tadi. Davom etasizmi?"
                        )
                      ) {
                        return;
                      }
                      fullReturnMut.mutate();
                    }}
                  >
                    {fullReturnMut.isPending ? "Bajarilmoqda…" : "Butun zakazni qaytarish"}
                  </Button>
                ) : null}
              </div>
              {fullReturnError ? (
                <p className="mt-1 text-xs text-destructive" role="alert">
                  {fullReturnError}
                </p>
              ) : null}
            </section>
          ) : null}

          {canPatchMeta ? (
            <section className="space-y-2">
              <h2 className="text-base font-semibold tracking-tight">Ombor, agent va dastavchik</h2>
              <div className="rounded-lg border border-border bg-muted/10 p-4 space-y-3">
                <p className="text-[11px] text-muted-foreground">
                  Faqat «Новый» / «Подтверждён» holatida saqlash mumkin (qator tahriri bilan bir xil).
                  Ombor yoki agent o‘zgarganda dastavchik qoidalarga qarab qayta tanlanadi; pastdagi ro‘yxatdan
                  qo‘lda tanlasangiz, shu qiymat yuboriladi.
                </p>
                {metaError ? (
                  <p className="text-xs text-destructive" role="alert">
                    {metaError}
                  </p>
                ) : null}
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <div className="space-y-1">
                    <Label htmlFor="order-meta-wh" className="text-xs text-muted-foreground">
                      Ombor
                    </Label>
                    <select
                      id="order-meta-wh"
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                      value={metaWarehouse}
                      onChange={(e) => setMetaWarehouse(e.target.value)}
                      disabled={metaMut.isPending || warehousesQ.isLoading}
                    >
                      <option value="">— tanlanmagan —</option>
                      {(warehousesQ.data ?? []).map((w) => (
                        <option key={w.id} value={String(w.id)}>
                          {w.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="order-meta-agent" className="text-xs text-muted-foreground">
                      Agent (foydalanuvchi)
                    </Label>
                    <select
                      id="order-meta-agent"
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                      value={metaAgent}
                      onChange={(e) => setMetaAgent(e.target.value)}
                      disabled={metaMut.isPending || usersQ.isLoading}
                    >
                      <option value="">— tanlanmagan —</option>
                      {agentUsers.map((u) => (
                        <option key={u.id} value={String(u.id)}>
                          {u.login} · {u.name} ({u.role})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1 sm:col-span-2 lg:col-span-1">
                    <Label htmlFor="order-meta-exp" className="text-xs text-muted-foreground">
                      Dastavchik (ekspeditor)
                    </Label>
                    <select
                      id="order-meta-exp"
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                      value={metaExpeditor}
                      onChange={(e) => {
                        setMetaExpeditor(e.target.value);
                        setMetaExpeditorTouched(true);
                      }}
                      disabled={metaMut.isPending || expeditorsQ.isLoading}
                    >
                      <option value="">— tanlanmagan (avto yoki bo‘sh) —</option>
                      {(expeditorsQ.data ?? []).map((r) => (
                        <option key={r.id} value={String(r.id)}>
                          {r.login} · {r.fio}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <Button
                  type="button"
                  size="sm"
                  className="h-9"
                  disabled={
                    metaMut.isPending || warehousesQ.isLoading || usersQ.isLoading || expeditorsQ.isLoading
                  }
                  onClick={() => {
                    const warehouse_id =
                      metaWarehouse === "" ? null : Number.parseInt(metaWarehouse, 10);
                    const agent_id = metaAgent === "" ? null : Number.parseInt(metaAgent, 10);
                    if (metaWarehouse !== "" && !Number.isFinite(warehouse_id)) return;
                    if (metaAgent !== "" && !Number.isFinite(agent_id)) return;
                    const payload: {
                      warehouse_id: number | null;
                      agent_id: number | null;
                      expeditor_user_id?: number | null;
                    } = {
                      warehouse_id: warehouse_id ?? null,
                      agent_id: agent_id ?? null
                    };
                    if (metaExpeditorTouched) {
                      if (metaExpeditor === "") {
                        payload.expeditor_user_id = null;
                      } else {
                        const eid = Number.parseInt(metaExpeditor, 10);
                        if (!Number.isFinite(eid)) return;
                        payload.expeditor_user_id = eid;
                      }
                    }
                    metaMut.mutate(payload);
                  }}
                >
                  {metaMut.isPending ? "Saqlanmoqda…" : "Saqlash"}
                </Button>
              </div>
            </section>
          ) : null}

          {canOperate && sortedStatusOptions.length > 0 ? (
            <section className="space-y-2">
              <h2 className="text-base font-semibold tracking-tight">Holatni o‘zgartirish</h2>
              <div className="rounded-lg border border-border bg-muted/15 p-4 space-y-3">
                <Label htmlFor="order-status-next" className="text-xs text-muted-foreground">
                  Выберите новый статус
                </Label>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:flex-wrap">
                  <select
                    id="order-status-next"
                    className="h-10 min-w-[240px] flex-1 rounded-md border border-input bg-background px-3 text-sm"
                    value={statusDraft}
                    onChange={(e) => setStatusDraft(e.target.value)}
                    disabled={statusMut.isPending}
                  >
                    <option value="">— tanlang —</option>
                    {sortedStatusOptions.map((s) => (
                      <option key={s} value={s}>
                        {statusOptionPrefix(data.status, s)}
                        {ORDER_STATUS_LABELS[s] ?? s}
                      </option>
                    ))}
                  </select>
                  <Button
                    type="button"
                    size="sm"
                    className="h-10"
                    disabled={statusMut.isPending || !statusDraft}
                    onClick={() => {
                      if (statusDraft) statusMut.mutate(statusDraft);
                    }}
                  >
                    Holatni o‘zgartirish
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed max-w-2xl">
                  ← orqaga bir qadam (masalan, «Доставлен» dan to‘g‘ridan-to‘g‘ri «Новый» ga —
                  tizimda yo‘q); → oldinga yoki maxsus holat (отмена, возврат).
                  {data.status === "cancelled" && role === "admin"
                    ? " «Отменён» dan «Новый» ga qayta ochish faqat admin uchun."
                    : null}
                  {role === "operator" && (data.status === "picking" || data.status === "delivering")
                    ? " «Отменён» (komplektatsiya / отгрузка) faqat admin uchun."
                    : null}
                </p>
                {statusMut.isError ? (
                  <p className="text-xs text-destructive">
                    {axios.isAxiosError(statusMut.error) &&
                    (statusMut.error.response?.data as { error?: string } | undefined)?.error ===
                      "ForbiddenRevert"
                      ? "Orqaga qadam (holatni qaytarish) faqat admin uchun."
                      : axios.isAxiosError(statusMut.error) &&
                          (statusMut.error.response?.data as { error?: string } | undefined)
                            ?.error === "ForbiddenReopenCancelled"
                        ? "Bekor qilingan zakazni qayta ochish faqat admin uchun."
                        : axios.isAxiosError(statusMut.error) &&
                            (statusMut.error.response?.data as { error?: string } | undefined)
                              ?.error === "ForbiddenOperatorCancelLate"
                          ? "Komplektatsiya yoki отгрузка bosqichida bekor qilish faqat admin uchun."
                          : "Holatni o‘zgartirib bo‘lmadi."}
                  </p>
                ) : null}
              </div>
            </section>
          ) : null}

          {(data.status_logs ?? []).length > 0 ? (
            <section className="space-y-2">
              <h2 className="text-base font-semibold tracking-tight">Holat tarixi</h2>
              <div className="overflow-x-auto rounded-lg border max-h-48 overflow-y-auto shadow-sm">
                <table className="w-full min-w-[560px] border-collapse text-xs">
                  <thead className="app-table-thead">
                    <tr className="border-b bg-muted/50 text-left text-muted-foreground sticky top-0">
                      <th className="px-3 py-2 font-medium">Oldin</th>
                      <th className="px-3 py-2 font-medium">Keyin</th>
                      <th className="px-3 py-2 font-medium">Foydalanuvchi</th>
                      <th className="px-3 py-2 font-medium">Vaqt</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data.status_logs ?? []).map((log) => (
                      <tr key={log.id} className="border-b border-border last:border-0">
                        <td className="px-3 py-2">
                          {ORDER_STATUS_LABELS[log.from_status] ?? log.from_status}
                        </td>
                        <td className="px-3 py-2">
                          {ORDER_STATUS_LABELS[log.to_status] ?? log.to_status}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">{log.user_login ?? "—"}</td>
                        <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                          {new Date(log.created_at).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          {(data.change_logs ?? []).length > 0 ? (
            <section className="space-y-2">
              <h2 className="text-base font-semibold tracking-tight">Tahrir jurnali</h2>
              <p className="text-[11px] text-muted-foreground max-w-2xl">
                To‘lov qatorlari va ombor/agent o‘zgarishlari (kim va qachon). Holat o‘tishlari — yuqoridagi
                tarixda.
              </p>
              <div className="overflow-x-auto rounded-lg border max-h-48 overflow-y-auto shadow-sm">
                <table className="w-full min-w-[640px] border-collapse text-xs">
                  <thead className="app-table-thead">
                    <tr className="border-b bg-muted/50 text-left text-muted-foreground sticky top-0">
                      <th className="px-3 py-2 font-medium">Vaqt</th>
                      <th className="px-3 py-2 font-medium">Foydalanuvchi</th>
                      <th className="px-3 py-2 font-medium">Amal</th>
                      <th className="px-3 py-2 font-medium">Qisqacha</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data.change_logs ?? []).map((log) => (
                      <tr key={log.id} className="border-b border-border last:border-0">
                        <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                          {new Date(log.created_at).toLocaleString()}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">{log.user_login ?? "—"}</td>
                        <td className="px-3 py-2">{changeLogActionLabel(log.action)}</td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {formatOrderChangeSummary(log.action, log.payload)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          <section className="space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold tracking-tight">Zakaz qatorlari</h2>
                <p className="mt-1 text-[11px] text-muted-foreground max-w-2xl">{readOnlyHint}</p>
                {role === "operator" && data && ORDER_LINES_EDITABLE_STATUSES.has(data.status) ? (
                  <p className="mt-1 text-[11px] text-amber-800 dark:text-amber-200/90">
                    To‘lov qatorlarini tahrirlash faqat admin uchun.
                  </p>
                ) : null}
              </div>
              {canEditOrderLines && !editingLines ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="h-9 text-xs shrink-0"
                  onClick={startEditLines}
                >
                  Tahrirlash
                </Button>
              ) : null}
            </div>

            {canEditOrderLines && editingLines ? (
              <div className="space-y-2 rounded-lg border border-border bg-muted/10 p-3">
                {editError ? (
                  <p className="text-xs text-destructive px-1" role="alert">
                    {editError}
                  </p>
                ) : null}
                {loadingProducts ? (
                  <p className="text-xs text-muted-foreground px-1">Mahsulotlar Загрузка…</p>
                ) : null}
                <div className="overflow-x-auto rounded-md border bg-background">
                  <table className="w-full min-w-[560px] border-collapse text-xs">
                    <thead className="app-table-thead">
                      <tr className="border-b bg-muted/50 text-left text-muted-foreground">
                        <th className="px-3 py-2 font-medium">Mahsulot</th>
                        <th className="px-3 py-2 font-medium w-28">Miqdor</th>
                        <th className="px-3 py-2 font-medium w-24 text-right">Amallar</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map((line) => (
                        <tr key={line.key} className="border-b border-border last:border-0">
                          <td className="px-3 py-2 align-middle">
                            <select
                              className="h-9 w-full max-w-xl rounded-md border border-input bg-background px-2 text-xs"
                              value={line.productId}
                              onChange={(e) => updateLine(line.key, { productId: e.target.value })}
                              disabled={patchLinesMut.isPending || loadingProducts}
                            >
                              <option value="">— tanlang —</option>
                              {products.map((p) => (
                                <option key={p.id} value={String(p.id)}>
                                  {p.sku} — {p.name}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-3 py-2 align-middle">
                            <Input
                              type="number"
                              min={0.001}
                              step="any"
                              className="h-9 text-xs"
                              value={line.qty}
                              onChange={(e) => updateLine(line.key, { qty: e.target.value })}
                              disabled={patchLinesMut.isPending}
                            />
                          </td>
                          <td className="px-3 py-2 align-middle text-right">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-9 text-xs"
                              disabled={patchLinesMut.isPending || lines.length <= 1}
                              onClick={() => removeLine(line.key)}
                            >
                              O‘chirish
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex flex-wrap items-center gap-2 px-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 text-xs"
                    onClick={addLine}
                    disabled={patchLinesMut.isPending}
                  >
                    + Qator
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="h-9 text-xs"
                    disabled={patchLinesMut.isPending || loadingProducts}
                    onClick={saveLines}
                  >
                    {patchLinesMut.isPending ? "Saqlanmoqda…" : "Saqlash"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 text-xs"
                    disabled={patchLinesMut.isPending}
                    onClick={cancelEditLines}
                  >
                    Bekor
                  </Button>
                </div>
                {data.items.some((i) => i.is_bonus) ? (
                  <p className="text-[11px] text-muted-foreground px-1">
                    Joriy bonus qatorlari saqlagach yangilanadi.
                  </p>
                ) : null}
              </div>
            ) : null}

            {canEditOrderLines &&
            (data.bonus_gift_swap_options?.length ?? 0) > 0 &&
            !editingLines ? (
              <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/[0.06] p-4 space-y-3">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Bonus sovg‘asini almashtirish</h3>
                  <p className="mt-1 text-[11px] text-muted-foreground max-w-2xl">
                    Qoidada bir nechta bonus mahsulot ko‘rsatilgan bo‘lsa, shu ro‘yxatdan tanlang. Zakaz
                    qayta hisoblanadi; to‘lov qatorlari o‘zgarishsiz qoladi (faqat bonus qismi).
                  </p>
                </div>
                {bonusGiftError ? (
                  <p className="text-xs text-destructive" role="alert">
                    {bonusGiftError}
                  </p>
                ) : null}
                <div className="space-y-3">
                  {(data.bonus_gift_swap_options ?? []).map((opt) => (
                    <div
                      key={opt.bonus_rule_id}
                      className="flex flex-col gap-2 rounded-md border border-border/80 bg-background/80 p-3 sm:flex-row sm:items-end sm:justify-between"
                    >
                      <div className="min-w-0 flex-1 space-y-1">
                        <p className="text-xs font-medium text-foreground">{opt.rule_name}</p>
                        <label className="block text-[11px] text-muted-foreground">
                          Sovg‘a mahsuloti
                          <select
                            className="mt-1 h-9 w-full max-w-md rounded-md border border-input bg-background px-2 text-sm"
                            value={String(opt.chosen_product_id)}
                            disabled={bonusGiftMut.isPending}
                            onChange={(e) => {
                              const pid = Number.parseInt(e.target.value, 10);
                              if (!Number.isFinite(pid) || pid < 1) return;
                              bonusGiftMut.mutate({ ruleId: opt.bonus_rule_id, productId: pid });
                            }}
                          >
                            {opt.products.map((p) => (
                              <option key={p.id} value={String(p.id)}>
                                {p.sku} — {p.name}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                      <p className="text-[10px] text-muted-foreground sm:pb-2">
                        O‘zgarish darhol saqlanadi
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="overflow-x-auto rounded-lg border shadow-sm">
              <table className="w-full min-w-[720px] border-collapse text-sm">
                <thead className="app-table-thead">
                  <tr className="border-b bg-muted/50 text-left text-xs font-medium text-muted-foreground">
                    <th className="px-4 py-3">SKU</th>
                    <th className="px-4 py-3">Mahsulot</th>
                    <th className="px-4 py-3">Tur</th>
                    <th className="px-4 py-3 text-right">Miqdor</th>
                    <th className="px-4 py-3 text-right">Narx</th>
                    <th className="px-4 py-3 text-right">Jami</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((i) => (
                    <tr
                      key={i.id}
                      className={
                        i.is_bonus
                          ? "border-b border-border bg-emerald-500/5 last:border-0"
                          : "border-b border-border last:border-0"
                      }
                    >
                      <td className="px-4 py-3 font-mono text-xs">{i.sku}</td>
                      <td className="px-4 py-3">{i.name}</td>
                      <td className="px-4 py-3">
                        {i.is_bonus ? (
                          <span className="rounded-md bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-800 dark:text-emerald-200">
                            Bonus
                          </span>
                        ) : (
                          <span className="text-muted-foreground">To‘lov</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {formatNumberGrouped(i.qty, { maxFractionDigits: 3 })}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {formatNumberGrouped(i.price, { maxFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-medium">
                        {formatNumberGrouped(i.total, { maxFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
