"use client";

import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/dashboard/page-header";
import { PageShell } from "@/components/dashboard/page-shell";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FilterSelect } from "@/components/ui/filter-select";
import { api, apiBaseURL, resolveApiOrigin } from "@/lib/api";
import { ORDER_TYPE_VALUES } from "@/lib/order-types";
import { getUserFacingError, isApiUnreachable } from "@/lib/error-utils";
import type { ClientRow } from "@/lib/client-types";
import type { ProductRow } from "@/lib/product-types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import type { AxiosError } from "axios";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";
import { formatNumberGrouped } from "@/lib/format-numbers";
import { STALE } from "@/lib/query-stale";
import {
  activeRefSelectOptions,
  refEntryLabelByStored,
} from "@/lib/profile-ref-entries";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Check, Search } from "lucide-react";

type Props = {
  tenantSlug: string | null;
  onCreated: () => void;
  onCancel: () => void;
  /** Hujjat tipi: order | return | exchange | partial_return | return_by_order */
  orderType?: string;
};

const fieldClass =
  "flex h-10 w-full min-w-0 max-w-none rounded-md border border-input bg-background px-3 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

function parsePriceAmount(s: string): number {
  const n = Number.parseFloat(String(s).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

/** Ombordagi jami yoki qator qiymati */
function parseStockQty(qtyStr: string | undefined): number {
  const n = Number.parseFloat(String(qtyStr ?? "0").replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/** Buyurtma uchun mavjud: jami qoldiq − band qilingan (backend bilan mos) */
function availableOrderQty(stock: { qty: string; reserved_qty: string } | undefined): number {
  const total = parseStockQty(stock?.qty);
  const reserved = parseStockQty(stock?.reserved_qty);
  return Math.max(0, total - reserved);
}

function formatQtyState(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "";
  const r = Math.round(n * 1000) / 1000;
  const s = String(r);
  return s.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
}

const MAX_POLKI_RETURN_QTY = 12;

const POLKI_TRADE_DIRECTION_OPTS = [
  { value: "", label: "— Направление торговли" },
  { value: "mal-dev", label: "MAL-DEV" },
  { value: "wholesale", label: "Опт / склад" }
];

const POLKI_SKIDKA_OPTS = [
  { value: "none", label: "Без скидки" },
  { value: "auto", label: "Авто" },
  { value: "line", label: "По строкам (API)" }
];

type PolkiRowModel = {
  product_id: number;
  sku: string;
  name: string;
  unit: string;
  max_qty: number;
  unit_price: number;
  has_bonus: boolean;
  category_id: number | null;
  volume_m3: string | null | undefined;
  qty_per_block: number | null;
};

function buildPolkiRowsFromClientData(
  items: Array<{
    product_id: number;
    sku: string;
    name: string;
    unit: string;
    qty: string;
    price: string;
    is_bonus: boolean;
  }>,
  products: ProductRow[]
): PolkiRowModel[] {
  const pmap = new Map(products.map((p) => [p.id, p]));
  const map = new Map<
    number,
    { sku: string; name: string; unit: string; total_qty: number; unit_price: number; has_bonus: boolean }
  >();
  for (const it of items) {
    const q = Number.parseFloat(String(it.qty).replace(/\s/g, "").replace(",", "."));
    if (!Number.isFinite(q) || q <= 0) continue;
    const price = Number.parseFloat(String(it.price).replace(/\s/g, "").replace(",", "."));
    const up = Number.isFinite(price) ? price : 0;
    const cur = map.get(it.product_id);
    if (cur) {
      cur.total_qty += q;
      if (it.is_bonus) cur.has_bonus = true;
    } else {
      map.set(it.product_id, {
        sku: it.sku,
        name: it.name,
        unit: it.unit,
        total_qty: q,
        unit_price: up,
        has_bonus: it.is_bonus
      });
    }
  }
  return Array.from(map.entries()).map(([product_id, v]) => {
    const p = pmap.get(product_id);
    return {
      product_id,
      sku: v.sku,
      name: v.name,
      unit: v.unit,
      max_qty: v.total_qty,
      unit_price: v.unit_price,
      has_bonus: v.has_bonus,
      category_id: p?.category_id ?? null,
      volume_m3: p?.volume_m3,
      qty_per_block: p?.qty_per_block ?? null
    };
  });
}

type PolkiLinesTableProps = {
  canShowPolkiGrid: boolean;
  isPolkiByOrder: boolean;
  isPolkiFree: boolean;
  polkiLoading: boolean;
  polkiError: boolean;
  polkiSuccess: boolean;
  polkiRowsAllLength: number;
  polkiDisplayRows: PolkiRowModel[];
  qtyByProductId: Record<number, string>;
  setQtyByProductId: Dispatch<SetStateAction<Record<number, string>>>;
  blockByProductId: Record<number, string>;
  setBlockByProductId: Dispatch<SetStateAction<Record<number, string>>>;
  mutationPending: boolean;
  polkiTotalReturnQtySum: number;
  polkiVolumeM3: number;
  polkiEstimatedSum: number;
};

function PolkiReturnLinesTable({
  canShowPolkiGrid,
  isPolkiByOrder,
  isPolkiFree,
  polkiLoading,
  polkiError,
  polkiSuccess,
  polkiRowsAllLength,
  polkiDisplayRows,
  qtyByProductId,
  setQtyByProductId,
  blockByProductId,
  setBlockByProductId,
  mutationPending,
  polkiTotalReturnQtySum,
  polkiVolumeM3,
  polkiEstimatedSum
}: PolkiLinesTableProps) {
  return (
    <div className="overflow-hidden rounded-lg border border-teal-800/20 bg-card shadow-sm dark:border-teal-800/35">
      <div className="max-h-[min(60vh,720px)] overflow-auto">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead className="app-table-thead sticky top-0 z-[1] backdrop-blur-sm">
            <tr className="text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <th className="min-w-[12rem] px-3 py-2.5">Ассортимент</th>
              <th className="min-w-[5.5rem] px-3 py-2.5 text-right">Цена</th>
              <th
                className="min-w-[5.5rem] px-3 py-2.5 text-center"
                title="Упаковка / блок. Если в карточке задано шт. в блоке, количество = блок × шт."
              >
                Блок
              </th>
              <th className="min-w-[5.5rem] px-3 py-2.5 text-center">Кол-во</th>
              <th className="min-w-[4.5rem] px-3 py-2.5 text-right">Объём m³</th>
              <th className="min-w-[6rem] px-3 py-2.5 text-right">Сумма</th>
            </tr>
          </thead>
          <tbody>
            {!canShowPolkiGrid ? (
              <tr>
                <td colSpan={6} className="px-3 py-10 text-center text-xs text-muted-foreground">
                  Выберите клиента
                  {isPolkiByOrder ? " и заказ" : ""}
                  {isPolkiFree ? " (период опционально)" : ""}.
                </td>
              </tr>
            ) : null}
            {canShowPolkiGrid && polkiLoading ? (
              <tr>
                <td colSpan={6} className="px-3 py-10 text-center text-sm text-muted-foreground">
                  Загрузка контекста возврата…
                </td>
              </tr>
            ) : null}
            {canShowPolkiGrid && polkiError ? (
              <tr>
                <td colSpan={6} className="px-3 py-10 text-center text-sm text-destructive">
                  Не удалось загрузить данные. Проверьте параметры и попробуйте снова.
                </td>
              </tr>
            ) : null}
            {canShowPolkiGrid && polkiSuccess && polkiRowsAllLength === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-10 text-center text-xs text-muted-foreground">
                  Нет позиций для возврата за период / по заказу.
                </td>
              </tr>
            ) : null}
            {canShowPolkiGrid && polkiSuccess && polkiRowsAllLength > 0
              ? polkiDisplayRows.map((r) => {
                  const pid = r.product_id;
                  const availNum = r.max_qty;
                  const qpb = r.qty_per_block;
                  const lineQtyRaw = qtyByProductId[pid] ?? "";
                  const lineQ = Number.parseFloat(lineQtyRaw.replace(",", "."));
                  const blockRaw = blockByProductId[pid] ?? "";
                  const blockN = Number.parseFloat(blockRaw.replace(",", "."));
                  let impliedFromBlock = NaN;
                  if (qpb != null && qpb > 0) {
                    if (Number.isFinite(blockN) && blockN > 0) impliedFromBlock = blockN * qpb;
                  } else if (Number.isFinite(blockN)) {
                    impliedFromBlock = blockN;
                  }
                  const qtyOver =
                    Boolean(lineQtyRaw.trim()) &&
                    Number.isFinite(lineQ) &&
                    lineQ > 0 &&
                    lineQ > availNum;
                  const blockOver =
                    Boolean(blockRaw.trim()) &&
                    Number.isFinite(impliedFromBlock) &&
                    impliedFromBlock > availNum;
                  const effQ =
                    Number.isFinite(lineQ) && lineQ > 0 ? Math.min(lineQ, availNum) : 0;
                  const volU =
                    r.volume_m3 != null ? Number.parseFloat(String(r.volume_m3)) : NaN;
                  const lineVolM3 = Number.isFinite(volU) && effQ > 0 ? effQ * volU : 0;
                  const lineTotalMoney =
                    effQ > 0 && r.unit_price > 0 ? effQ * r.unit_price : null;
                  const maxLabel = formatNumberGrouped(availNum, { maxFractionDigits: 3 });
                  return (
                    <tr
                      key={pid}
                      className="border-b border-border/80 last:border-0 hover:bg-muted/25"
                    >
                      <td className="px-3 py-2 align-top">
                        <div className="font-medium leading-snug text-foreground">{r.name}</div>
                        {r.sku || r.unit || r.has_bonus ? (
                          <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                            {[r.sku, r.unit].filter(Boolean).join(" · ")}
                            {r.has_bonus ? (
                              <span className="ml-1 text-amber-600 dark:text-amber-400">bonus</span>
                            ) : null}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground align-middle">
                        {r.unit_price > 0
                          ? formatNumberGrouped(r.unit_price, { maxFractionDigits: 2 })
                          : "—"}
                      </td>
                      <td className="px-3 py-2 align-top">
                        <div className="mx-auto flex max-w-[6.5rem] flex-col items-stretch">
                          {blockOver ? (
                            <span className="mb-0.5 text-center text-[11px] font-semibold text-destructive">
                              Макс: {maxLabel}
                            </span>
                          ) : null}
                          <Input
                            type="number"
                            min={0}
                            step="any"
                            placeholder="0"
                            title={
                              qpb != null && qpb > 0
                                ? `1 блок = ${qpb} шт (макс ${maxLabel} шт)`
                                : "Блок и количество совпадают (макс продано)"
                            }
                            className={cn(
                              "h-9 w-full tabular-nums text-center",
                              blockOver && "border-destructive focus-visible:ring-destructive"
                            )}
                            value={blockRaw}
                            onChange={(e) => {
                              const blockStr = e.target.value;
                              setBlockByProductId((prev) => ({ ...prev, [pid]: blockStr }));
                              const qpbN = r.qty_per_block;
                              if (qpbN != null && qpbN > 0) {
                                if (!blockStr.trim()) {
                                  setQtyByProductId((prev) => ({ ...prev, [pid]: "" }));
                                  return;
                                }
                                const blocks = Number.parseFloat(blockStr.replace(",", "."));
                                if (!Number.isFinite(blocks) || blocks <= 0) return;
                                setQtyByProductId((prev) => ({
                                  ...prev,
                                  [pid]: formatQtyState(blocks * qpbN)
                                }));
                                return;
                              }
                              setQtyByProductId((prev) => ({ ...prev, [pid]: blockStr }));
                            }}
                            onBlur={() => {
                              const br = blockByProductId[pid];
                              if (!br?.trim()) return;
                              const blocks = Number.parseFloat(br.replace(",", "."));
                              if (!Number.isFinite(blocks) || blocks <= 0) return;
                              const qpbN = r.qty_per_block;
                              if (qpbN != null && qpbN > 0) {
                                let qtyVal = blocks * qpbN;
                                if (qtyVal > availNum) {
                                  qtyVal = availNum;
                                  setBlockByProductId((prev) => ({
                                    ...prev,
                                    [pid]: availNum > 0 ? formatQtyState(availNum / qpbN) : ""
                                  }));
                                  setQtyByProductId((prev) => ({
                                    ...prev,
                                    [pid]: qtyVal > 0 ? formatQtyState(qtyVal) : ""
                                  }));
                                }
                                return;
                              }
                              if (blocks > availNum) {
                                const cap = availNum > 0 ? String(availNum) : "";
                                setBlockByProductId((prev) => ({ ...prev, [pid]: cap }));
                                setQtyByProductId((prev) => ({ ...prev, [pid]: cap }));
                              }
                            }}
                            disabled={mutationPending}
                          />
                        </div>
                      </td>
                      <td className="px-3 py-2 align-top">
                        <div className="mx-auto flex max-w-[6.5rem] flex-col items-stretch">
                          {qtyOver ? (
                            <span className="mb-0.5 text-center text-[11px] font-semibold text-destructive">
                              Макс: {maxLabel}
                            </span>
                          ) : null}
                          <Input
                            type="number"
                            min={0}
                            step="any"
                            placeholder="0"
                            data-testid="oc-polki-line-qty"
                            data-oc-product-id={pid}
                            className={cn(
                              "h-9 w-full tabular-nums text-center",
                              qtyOver && "border-destructive focus-visible:ring-destructive"
                            )}
                            value={lineQtyRaw}
                            onChange={(e) => {
                              const v = e.target.value;
                              setQtyByProductId((prev) => ({ ...prev, [pid]: v }));
                              const qpbN = r.qty_per_block;
                              if (qpbN != null && qpbN > 0) {
                                const q = Number.parseFloat(v.replace(",", "."));
                                if (!v.trim() || !Number.isFinite(q) || q <= 0) {
                                  setBlockByProductId((prev) => ({ ...prev, [pid]: "" }));
                                } else {
                                  setBlockByProductId((prev) => ({
                                    ...prev,
                                    [pid]: formatQtyState(q / qpbN)
                                  }));
                                }
                              } else {
                                setBlockByProductId((prev) => ({ ...prev, [pid]: v }));
                              }
                            }}
                            onBlur={() => {
                              const raw = qtyByProductId[pid];
                              if (!raw?.trim()) return;
                              const n = Number.parseFloat(raw.replace(",", "."));
                              if (!Number.isFinite(n) || n <= 0) return;
                              if (n > availNum) {
                                const capped = availNum > 0 ? formatQtyState(availNum) : "";
                                setQtyByProductId((prev) => ({ ...prev, [pid]: capped }));
                                const qpbN = r.qty_per_block;
                                if (qpbN != null && qpbN > 0 && capped) {
                                  const q = Number.parseFloat(capped.replace(",", "."));
                                  if (Number.isFinite(q) && q > 0) {
                                    setBlockByProductId((prev) => ({
                                      ...prev,
                                      [pid]: formatQtyState(q / qpbN)
                                    }));
                                  }
                                } else {
                                  setBlockByProductId((prev) => ({ ...prev, [pid]: capped }));
                                }
                              }
                            }}
                            disabled={mutationPending}
                          />
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground align-middle">
                        {lineVolM3 > 0
                          ? formatNumberGrouped(lineVolM3, { maxFractionDigits: 4 })
                          : "0"}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold text-foreground align-middle">
                        {lineTotalMoney != null && lineTotalMoney > 0
                          ? formatNumberGrouped(lineTotalMoney, { maxFractionDigits: 0 })
                          : "—"}
                      </td>
                    </tr>
                  );
                })
              : null}
            {canShowPolkiGrid &&
            polkiSuccess &&
            polkiRowsAllLength > 0 &&
            polkiDisplayRows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-10 text-center text-xs text-muted-foreground">
                  По поиску ничего не найдено.
                </td>
              </tr>
            ) : null}
          </tbody>
          {canShowPolkiGrid &&
          polkiSuccess &&
          !polkiLoading &&
          polkiDisplayRows.length > 0 ? (
            <tfoot>
              <tr className="border-t-2 border-border bg-muted/40 font-semibold">
                <td className="px-3 py-2.5 text-foreground" colSpan={3}>
                  Итого
                </td>
                <td className="px-3 py-2.5 text-center tabular-nums text-foreground">
                  {formatNumberGrouped(polkiTotalReturnQtySum, { maxFractionDigits: 3 })}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-foreground">
                  {formatNumberGrouped(polkiVolumeM3, { maxFractionDigits: 4 })}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-teal-800 dark:text-teal-200">
                  {polkiEstimatedSum > 0
                    ? formatNumberGrouped(polkiEstimatedSum, { maxFractionDigits: 0 })
                    : "—"}
                </td>
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
    </div>
  );
}

function unitPriceForType(p: ProductRow, priceTypeKey: string): string | null {
  const list = p.prices ?? [];
  if (list.length === 0) return null;
  const want = priceTypeKey.trim().toLowerCase();
  const exact = list.find((x) => x.price_type.trim().toLowerCase() === want);
  return exact?.price ?? null;
}

export function OrderCreateWorkspace({ tenantSlug, onCreated, onCancel, orderType }: Props) {
  const qc = useQueryClient();
  const normalizedType = (orderType ?? "order").trim();
  const isPolkiFree = normalizedType === "return";
  const isPolkiByOrder = normalizedType === "return_by_order";
  const isPolkiSheet = isPolkiFree || isPolkiByOrder;

  const [clientId, setClientId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [agentId, setAgentId] = useState("");
  const [applyBonus, setApplyBonus] = useState(true);
  const [selectedCategoryId, setSelectedCategoryId] = useState("");
  const [qtyByProductId, setQtyByProductId] = useState<Record<number, string>>({});
  /** Mahsulot qadoqlari (bloklar); kartotekada qty_per_block bo‘lsa Miqdor = blok × dona/blok */
  const [blockByProductId, setBlockByProductId] = useState<Record<number, string>>({});
  const [localError, setLocalError] = useState<string | null>(null);
  const [expeditorUserId, setExpeditorUserId] = useState("");
  const [priceType, setPriceType] = useState("retail");
  const [orderComment, setOrderComment] = useState("");
  const [requestTypeRef, setRequestTypeRef] = useState("");
  const [orderNotePreset, setOrderNotePreset] = useState("");
  const [refSelectKey, setRefSelectKey] = useState(0);
  const [showZeroStock, setShowZeroStock] = useState(false);
  const [productSearch, setProductSearch] = useState("");
  const [orderOpenedAt] = useState(() => new Date());
  const [polkiDateFrom, setPolkiDateFrom] = useState("");
  const [polkiDateTo, setPolkiDateTo] = useState("");
  const [polkiOrderId, setPolkiOrderId] = useState("");
  const [refusalReasonRefPolki, setRefusalReasonRefPolki] = useState("");
  const [polkiHeaderDate, setPolkiHeaderDate] = useState("");
  const [polkiTradeDirection, setPolkiTradeDirection] = useState("");
  const [polkiSkidkaType, setPolkiSkidkaType] = useState("none");

  useEffect(() => {
    setQtyByProductId({});
    setBlockByProductId({});
  }, [warehouseId]);

  useEffect(() => {
    if (!isPolkiSheet) return;
    setQtyByProductId({});
    setBlockByProductId({});
  }, [isPolkiSheet, polkiDateFrom, polkiDateTo, polkiOrderId, clientId]);

  const clientsQ = useQuery({
    queryKey: ["clients", tenantSlug, "order-form"],
    enabled: Boolean(tenantSlug),
    staleTime: STALE.list,
    queryFn: async () => {
      const { data } = await api.get<{ data: ClientRow[] }>(
        `/api/${tenantSlug}/clients?page=1&limit=200&is_active=true`
      );
      return data.data;
    }
  });

  const productsQ = useQuery({
    queryKey: ["products", tenantSlug, "order-form"],
    enabled: Boolean(tenantSlug),
    staleTime: STALE.list,
    queryFn: async () => {
      const { data } = await api.get<{ data: ProductRow[] }>(
        `/api/${tenantSlug}/products?page=1&limit=200&is_active=true&include_prices=true`
      );
      return data.data;
    }
  });

  const warehousesQ = useQuery({
    queryKey: ["warehouses", tenantSlug, "order-form"],
    enabled: Boolean(tenantSlug),
    staleTime: STALE.reference,
    queryFn: async () => {
      const { data } = await api.get<{
        data: { id: number; name: string; stock_purpose?: string; is_active?: boolean }[];
      }>(`/api/${tenantSlug}/warehouses`);
      return data.data;
    }
  });

  const usersQ = useQuery({
    queryKey: ["users", tenantSlug, "order-form"],
    enabled: Boolean(tenantSlug),
    staleTime: STALE.reference,
    queryFn: async () => {
      const { data } = await api.get<{ data: { id: number; login: string; name: string; role: string }[] }>(
        `/api/${tenantSlug}/users`
      );
      return data.data;
    }
  });

  const stockQ = useQuery({
    queryKey: ["stock", tenantSlug, warehouseId, "order-form"],
    enabled: Boolean(tenantSlug) && Boolean(warehouseId),
    staleTime: STALE.detail,
    queryFn: async () => {
      const { data } = await api.get<{ data: { product_id: number; qty: string; reserved_qty: string }[] }>(
        `/api/${tenantSlug}/stock?warehouse_id=${warehouseId}`
      );
      return data.data;
    }
  });

  const priceTypesQ = useQuery({
    queryKey: ["price-types", tenantSlug, "order-form"],
    enabled: Boolean(tenantSlug),
    staleTime: STALE.reference,
    queryFn: async () => {
      const { data } = await api.get<{ data: string[] }>(`/api/${tenantSlug}/price-types?kind=sale`);
      return data.data.length ? data.data : ["retail"];
    }
  });

  const expeditorsQ = useQuery({
    queryKey: ["expeditors", tenantSlug, "order-form"],
    enabled: Boolean(tenantSlug),
    staleTime: STALE.reference,
    queryFn: async () => {
      const { data } = await api.get<{
        data: Array<{ id: number; fio: string; login: string; is_active: boolean }>;
      }>(`/api/${tenantSlug}/expeditors`);
      return data.data.filter((r) => r.is_active);
    }
  });

  const clientIdNum = clientId.trim() ? Number.parseInt(clientId.trim(), 10) : NaN;
  const polkiOrderNum = polkiOrderId.trim() ? Number.parseInt(polkiOrderId.trim(), 10) : NaN;

  type ClientReturnDataPolki = {
    polki_scope?: "period" | "order";
    items: Array<{
      product_id: number;
      sku: string;
      name: string;
      unit: string;
      qty: string;
      price: string;
      is_bonus: boolean;
    }>;
    max_returnable_value: string;
  };

  const polkiOrdersPickQ = useQuery({
    queryKey: ["order-create-polki-orders", tenantSlug, clientIdNum],
    enabled: Boolean(
      tenantSlug && isPolkiByOrder && Number.isFinite(clientIdNum) && clientIdNum > 0
    ),
    staleTime: STALE.list,
    queryFn: async () => {
      const { data: body } = await api.get<{
        data: Array<{ id: number; number: string; status: string; created_at: string }>;
      }>(`/api/${tenantSlug}/orders?page=1&limit=100&client_id=${clientIdNum}`);
      return body.data ?? [];
    }
  });

  useEffect(() => {
    if (!isPolkiSheet) return;
    if (isPolkiFree) {
      const d = polkiDateTo || polkiDateFrom;
      if (d) setPolkiHeaderDate(d);
      else setPolkiHeaderDate(new Date().toISOString().slice(0, 10));
      return;
    }
    if (isPolkiByOrder && polkiOrderId.trim()) {
      const oid = Number.parseInt(polkiOrderId, 10);
      const o = (polkiOrdersPickQ.data ?? []).find((x) => x.id === oid);
      if (o?.created_at) {
        setPolkiHeaderDate(String(o.created_at).slice(0, 10));
        return;
      }
    }
    setPolkiHeaderDate((prev) => prev || new Date().toISOString().slice(0, 10));
  }, [
    isPolkiSheet,
    isPolkiFree,
    isPolkiByOrder,
    polkiDateFrom,
    polkiDateTo,
    polkiOrderId,
    polkiOrdersPickQ.data
  ]);

  const polkiContextQ = useQuery({
    queryKey: [
      "order-create-polki-context",
      tenantSlug,
      clientIdNum,
      polkiDateFrom,
      polkiDateTo,
      polkiOrderNum,
      isPolkiFree,
      isPolkiByOrder
    ],
    enabled: Boolean(
      tenantSlug &&
        isPolkiSheet &&
        Number.isFinite(clientIdNum) &&
        clientIdNum > 0 &&
        (isPolkiFree || (isPolkiByOrder && Number.isFinite(polkiOrderNum) && polkiOrderNum > 0))
    ),
    staleTime: STALE.detail,
    queryFn: async () => {
      const params = new URLSearchParams({ client_id: String(clientIdNum) });
      if (isPolkiFree) {
        if (polkiDateFrom) params.set("date_from", polkiDateFrom);
        if (polkiDateTo) params.set("date_to", polkiDateTo);
      } else {
        params.set("order_id", String(polkiOrderNum));
      }
      const { data } = await api.get<ClientReturnDataPolki>(
        `/api/${tenantSlug}/returns/client-data?${params.toString()}`
      );
      return data;
    }
  });

  const clientSummaryQ = useQuery({
    queryKey: ["client", tenantSlug, clientIdNum, "order-form"],
    enabled: Boolean(tenantSlug) && Number.isFinite(clientIdNum) && clientIdNum > 0,
    staleTime: STALE.detail,
    queryFn: async () => {
      const { data } = await api.get<{
        account_balance: string;
        credit_limit: string;
        open_orders_total: string;
      }>(`/api/${tenantSlug}/clients/${clientIdNum}`);
      return data;
    }
  });

  const profileRefsQ = useQuery({
    queryKey: ["settings", "profile", tenantSlug, "order-create-refs"],
    enabled: Boolean(tenantSlug),
    staleTime: STALE.profile,
    queryFn: async () => {
      const { data } = await api.get<{
        references: {
          request_type_entries?: unknown;
          order_note_entries?: unknown;
          refusal_reason_entries?: unknown;
        };
      }>(`/api/${tenantSlug}/settings/profile`);
      return data;
    }
  });

  const requestTypeOptions = useMemo(
    () => activeRefSelectOptions(profileRefsQ.data?.references?.request_type_entries),
    [profileRefsQ.data]
  );
  const orderNoteOptions = useMemo(
    () => activeRefSelectOptions(profileRefsQ.data?.references?.order_note_entries),
    [profileRefsQ.data]
  );
  const refusalReasonPolkiOptions = useMemo(
    () => activeRefSelectOptions(profileRefsQ.data?.references?.refusal_reason_entries),
    [profileRefsQ.data]
  );

  const categoriesQ = useQuery({
    queryKey: ["product-categories", tenantSlug, "order-form"],
    enabled: Boolean(tenantSlug),
    staleTime: STALE.reference,
    queryFn: async () => {
      const { data } = await api.get<{ data: { id: number; name: string }[] }>(
        `/api/${tenantSlug}/product-categories`
      );
      return data.data;
    }
  });

  const clients = clientsQ.data ?? [];
  const products = productsQ.data ?? [];
  const warehouses = warehousesQ.data ?? [];
  const users = usersQ.data ?? [];
  const categories = categoriesQ.data ?? [];

  useEffect(() => {
    if (!isPolkiSheet || warehouses.length === 0) return;
    if (warehouseId.trim()) return;
    const ret = warehouses.find((w) => w.stock_purpose === "return" && w.is_active !== false);
    if (ret) setWarehouseId(String(ret.id));
  }, [isPolkiSheet, warehouses, warehouseId]);
  const agentUsers = users.filter((u) => {
    const role = u.role.trim().toLowerCase();
    return role.includes("agent") && !role.includes("expeditor");
  });
  const stockByProduct = new Map<number, { qty: string; reserved_qty: string }>(
    (stockQ.data ?? []).map((s) => [s.product_id, s])
  );
  const selectedCategoryNum = selectedCategoryId ? Number.parseInt(selectedCategoryId, 10) : null;

  const polkiRowsAll = useMemo((): PolkiRowModel[] => {
    if (!isPolkiSheet || !polkiContextQ.data?.items?.length) return [];
    return buildPolkiRowsFromClientData(polkiContextQ.data.items, products);
  }, [isPolkiSheet, polkiContextQ.data?.items, products]);

  const polkiRowsFiltered = useMemo(() => {
    if (!isPolkiSheet) return [] as PolkiRowModel[];
    return polkiRowsAll.filter((r) => {
      if (selectedCategoryNum != null && r.category_id !== selectedCategoryNum) return false;
      return true;
    });
  }, [isPolkiSheet, polkiRowsAll, selectedCategoryNum]);

  const polkiDisplayRows = useMemo(() => {
    if (!isPolkiSheet) return [] as PolkiRowModel[];
    const n = productSearch.trim().toLowerCase();
    if (!n) return polkiRowsFiltered;
    return polkiRowsFiltered.filter(
      (r) => r.name.toLowerCase().includes(n) || (r.sku ?? "").toLowerCase().includes(n)
    );
  }, [isPolkiSheet, polkiRowsFiltered, productSearch]);

  const hasPolkiQtyOverMax = useMemo(() => {
    if (!isPolkiSheet) return false;
    for (const r of polkiRowsAll) {
      const raw = qtyByProductId[r.product_id];
      if (!raw?.trim()) continue;
      const q = Number.parseFloat(raw.replace(",", "."));
      if (!Number.isFinite(q) || q <= 0) continue;
      if (q > r.max_qty) return true;
    }
    return false;
  }, [isPolkiSheet, polkiRowsAll, qtyByProductId]);

  const polkiTotalReturnQtySum = useMemo(() => {
    if (!isPolkiSheet) return 0;
    let s = 0;
    for (const r of polkiRowsAll) {
      const raw = qtyByProductId[r.product_id];
      const q = Number.parseFloat((raw ?? "").replace(",", "."));
      if (!Number.isFinite(q) || q <= 0) continue;
      s += Math.min(q, r.max_qty);
    }
    return s;
  }, [isPolkiSheet, polkiRowsAll, qtyByProductId]);

  const polkiSelectedLinesCount = useMemo(() => {
    if (!isPolkiSheet) return 0;
    let n = 0;
    for (const r of polkiRowsAll) {
      const raw = qtyByProductId[r.product_id];
      const q = Number.parseFloat((raw ?? "").replace(",", "."));
      if (Number.isFinite(q) && q > 0) n++;
    }
    return n;
  }, [isPolkiSheet, polkiRowsAll, qtyByProductId]);

  const polkiEstimatedSum = useMemo(() => {
    if (!isPolkiSheet) return 0;
    let t = 0;
    for (const r of polkiRowsAll) {
      const raw = qtyByProductId[r.product_id];
      if (!raw?.trim()) continue;
      const q = Number.parseFloat(raw.replace(",", "."));
      if (!Number.isFinite(q) || q <= 0) continue;
      const eff = Math.min(q, r.max_qty);
      t += eff * r.unit_price;
    }
    return t;
  }, [isPolkiSheet, polkiRowsAll, qtyByProductId]);

  const polkiVolumeM3 = useMemo(() => {
    if (!isPolkiSheet) return 0;
    let v = 0;
    for (const r of polkiRowsAll) {
      const raw = qtyByProductId[r.product_id];
      if (!raw?.trim()) continue;
      const q = Number.parseFloat(raw.replace(",", "."));
      if (!Number.isFinite(q) || q <= 0) continue;
      const eff = Math.min(q, r.max_qty);
      const vol = r.volume_m3 != null ? Number.parseFloat(String(r.volume_m3)) : NaN;
      if (Number.isFinite(vol)) v += eff * vol;
    }
    return v;
  }, [isPolkiSheet, polkiRowsAll, qtyByProductId]);

  const catalogProducts = useMemo(() => {
    const stockMap = new Map((stockQ.data ?? []).map((s) => [s.product_id, s]));
    const filtered = products.filter((p) => {
      if (selectedCategoryNum != null && p.category_id !== selectedCategoryNum) return false;
      if (!warehouseId) return false;
      if (showZeroStock) return true;
      const s = stockMap.get(p.id);
      return availableOrderQty(s) > 0;
    });
    const seen = new Set<number>();
    const deduped: ProductRow[] = [];
    for (const p of filtered) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      deduped.push(p);
    }
    return deduped;
  }, [products, selectedCategoryNum, warehouseId, showZeroStock, stockQ.data]);

  const productSearchNorm = productSearch.trim().toLowerCase();
  const displayProducts = useMemo(() => {
    if (!productSearchNorm) return catalogProducts;
    return catalogProducts.filter((p) => {
      const n = p.name.toLowerCase();
      const sku = (p.sku ?? "").toLowerCase();
      return n.includes(productSearchNorm) || sku.includes(productSearchNorm);
    });
  }, [catalogProducts, productSearchNorm]);

  const hasQtyOverStock = useMemo(() => {
    const rows = stockQ.data ?? [];
    const map = new Map(rows.map((s) => [s.product_id, s]));
    for (const p of catalogProducts) {
      const raw = qtyByProductId[p.id];
      if (!raw?.trim()) continue;
      const lineQ = Number.parseFloat(raw.replace(",", "."));
      if (!Number.isFinite(lineQ) || lineQ <= 0) continue;
      const avail = availableOrderQty(map.get(p.id));
      if (lineQ > avail) return true;
    }
    return false;
  }, [catalogProducts, qtyByProductId, stockQ.data]);
  const hasMissingPriceForSelected = useMemo(() => {
    for (const p of catalogProducts) {
      const raw = qtyByProductId[p.id];
      const q = Number.parseFloat((raw ?? "").replace(",", "."));
      if (!Number.isFinite(q) || q <= 0) continue;
      if (unitPriceForType(p, priceType) == null) return true;
    }
    return false;
  }, [catalogProducts, qtyByProductId, priceType]);
  const missingPriceProductNames = useMemo(() => {
    const names: string[] = [];
    for (const p of catalogProducts) {
      const raw = qtyByProductId[p.id];
      const q = Number.parseFloat((raw ?? "").replace(",", "."));
      if (!Number.isFinite(q) || q <= 0) continue;
      if (unitPriceForType(p, priceType) == null) names.push(p.name);
    }
    return names.slice(0, 3);
  }, [catalogProducts, qtyByProductId, priceType]);

  const loadingLists =
    clientsQ.isLoading ||
    productsQ.isLoading ||
    warehousesQ.isLoading ||
    usersQ.isLoading ||
    categoriesQ.isLoading ||
    priceTypesQ.isLoading ||
    expeditorsQ.isLoading;
  const selectedItemsCount = catalogProducts.reduce((acc, p) => {
    const raw = qtyByProductId[p.id];
    const q = Number.parseFloat((raw ?? "").replace(",", "."));
    return Number.isFinite(q) && q > 0 ? acc + 1 : acc;
  }, 0);
  const selectedTotalQty = useMemo(() => {
    const map = new Map((stockQ.data ?? []).map((s) => [s.product_id, s]));
    let sum = 0;
    for (const p of catalogProducts) {
      const raw = qtyByProductId[p.id];
      const q = Number.parseFloat((raw ?? "").replace(",", "."));
      if (!Number.isFinite(q) || q <= 0) continue;
      const avail = availableOrderQty(map.get(p.id));
      sum += Math.min(q, avail);
    }
    return sum
      .toFixed(3)
      .replace(/\.?0+$/, "");
  }, [catalogProducts, qtyByProductId, stockQ.data]);

  const estimatedSum = useMemo(() => {
    const map = new Map((stockQ.data ?? []).map((s) => [s.product_id, s]));
    let t = 0;
    for (const p of catalogProducts) {
      const raw = qtyByProductId[p.id];
      const q = Number.parseFloat((raw ?? "").replace(",", "."));
      if (!Number.isFinite(q) || q <= 0) continue;
      const avail = availableOrderQty(map.get(p.id));
      const effective = Math.min(q, avail);
      if (effective <= 0) continue;
      const up = unitPriceForType(p, priceType);
      if (up != null) t += effective * parsePriceAmount(up);
    }
    return t;
  }, [catalogProducts, qtyByProductId, priceType, stockQ.data]);

  const totalVolumeM3 = useMemo(() => {
    const map = new Map((stockQ.data ?? []).map((s) => [s.product_id, s]));
    let v = 0;
    for (const p of catalogProducts) {
      const raw = qtyByProductId[p.id];
      const q = Number.parseFloat((raw ?? "").replace(",", "."));
      if (!Number.isFinite(q) || q <= 0) continue;
      const avail = availableOrderQty(map.get(p.id));
      const eff = Math.min(q, avail);
      if (eff <= 0) continue;
      const volU = p.volume_m3 != null ? Number.parseFloat(p.volume_m3) : NaN;
      if (Number.isFinite(volU)) v += eff * volU;
    }
    return v;
  }, [catalogProducts, qtyByProductId, stockQ.data]);

  const hasClient = Boolean(clientId.trim());
  const hasWarehouse = Boolean(warehouseId.trim());
  const canPickWarehouse = hasClient;
  const canPickPricingAndExpeditor = hasWarehouse;
  const canPickProducts = hasClient && hasWarehouse;

  const mutation = useMutation({
    mutationFn: async () => {
      if (isPolkiSheet) {
        const cid = Number.parseInt(clientId, 10);
        if (!Number.isFinite(cid) || cid < 1) throw new Error("client");
        const wid = Number.parseInt(warehouseId, 10);
        if (!warehouseId.trim() || !Number.isFinite(wid) || wid < 1) throw new Error("warehouse");
        if (isPolkiByOrder && (!Number.isFinite(polkiOrderNum) || polkiOrderNum < 1)) {
          throw new Error("polki_order");
        }
        const lines: { product_id: number; qty: number }[] = [];
        let sumQty = 0;
        for (const r of polkiRowsAll) {
          const raw = qtyByProductId[r.product_id];
          if (!raw?.trim()) continue;
          const q = Number.parseFloat(raw.replace(",", "."));
          if (!Number.isFinite(q) || q <= 0) continue;
          if (q > r.max_qty) throw new Error("polki_qty_over");
          lines.push({ product_id: r.product_id, qty: q });
          sumQty += q;
        }
        if (lines.length === 0) throw new Error("nolines");
        if (sumQty > MAX_POLKI_RETURN_QTY) throw new Error("polki_too_many");
        const body: Record<string, unknown> = {
          client_id: cid,
          warehouse_id: wid,
          lines
        };
        if (isPolkiFree) {
          if (polkiDateFrom) body.date_from = polkiDateFrom;
          if (polkiDateTo) body.date_to = polkiDateTo;
        } else {
          body.order_id = polkiOrderNum;
        }
        const noteParts: string[] = [];
        if (polkiHeaderDate.trim()) noteParts.push(`Дата заявки: ${polkiHeaderDate.trim()}`);
        if (polkiTradeDirection.trim()) {
          const td =
            POLKI_TRADE_DIRECTION_OPTS.find((o) => o.value === polkiTradeDirection)?.label ??
            polkiTradeDirection;
          noteParts.push(`Направление: ${td}`);
        }
        if (polkiSkidkaType !== "none") {
          const sd =
            POLKI_SKIDKA_OPTS.find((o) => o.value === polkiSkidkaType)?.label ?? polkiSkidkaType;
          noteParts.push(`Скидка: ${sd}`);
        }
        if (orderNotePreset.trim()) {
          const presetLabel =
            refEntryLabelByStored(profileRefsQ.data?.references?.order_note_entries, orderNotePreset) ??
            orderNotePreset;
          noteParts.push(presetLabel);
        }
        if (orderComment.trim()) noteParts.push(orderComment.trim());
        const noteJoined = noteParts.join("\n").trim();
        if (noteJoined) body.note = noteJoined;
        if (refusalReasonRefPolki.trim()) body.refusal_reason_ref = refusalReasonRefPolki.trim();
        await api.post(`/api/${tenantSlug}/returns/period`, body);
        return;
      }

      const cid = Number.parseInt(clientId, 10);
      if (!Number.isFinite(cid) || cid < 1) throw new Error("client");

      const wid = Number.parseInt(warehouseId, 10);
      if (!warehouseId.trim() || !Number.isFinite(wid) || wid < 1) throw new Error("warehouse");

      const agentParsed = agentId.trim() ? Number.parseInt(agentId, 10) : NaN;
      const agent_id =
        Number.isFinite(agentParsed) && agentParsed > 0 ? agentParsed : null;

      const stockRows = stockQ.data ?? [];
      const stockMap = new Map(stockRows.map((s) => [s.product_id, s]));
      const qtyAgg = new Map<number, number>();
      for (const p of catalogProducts) {
        const raw = qtyByProductId[p.id];
        if (!raw || !raw.trim()) continue;
        const q = Number.parseFloat(raw.replace(",", "."));
        if (!Number.isFinite(q) || q < 0) throw new Error("qty");
        if (q === 0) continue;
        qtyAgg.set(p.id, (qtyAgg.get(p.id) ?? 0) + q);
      }
      const items: { product_id: number; qty: number }[] = [];
      for (const [productId, totalQ] of Array.from(qtyAgg.entries())) {
        if (totalQ <= 0) continue;
        if (!Number.isFinite(totalQ)) throw new Error("qty");
        const avail = availableOrderQty(stockMap.get(productId));
        if (totalQ > avail) throw new Error("qty_over_stock");
        items.push({ product_id: productId, qty: totalQ });
      }
      if (items.length === 0) throw new Error("nolines");

      const validatedOrderType =
        orderType && (ORDER_TYPE_VALUES as readonly string[]).includes(orderType) ? orderType : "order";
      const freeComment = orderComment.trim();
      const presetStored = orderNotePreset.trim();
      let commentOut: string | null = freeComment || null;
      if (presetStored) {
        const presetLabel =
          refEntryLabelByStored(profileRefsQ.data?.references?.order_note_entries, presetStored) ??
          presetStored;
        commentOut = freeComment ? `${presetLabel}\n${freeComment}` : presetLabel;
      }
      const body: Record<string, unknown> = {
        client_id: cid,
        warehouse_id: wid,
        agent_id,
        price_type: priceType.trim() || "retail",
        order_type: validatedOrderType,
        apply_bonus: applyBonus,
        comment: commentOut,
        request_type_ref: requestTypeRef.trim() || null,
        items
      };
      const expRaw = expeditorUserId.trim();
      if (expRaw === "__none__") body.expeditor_user_id = null;
      else if (expRaw !== "") {
        const eid = Number.parseInt(expRaw, 10);
        if (Number.isFinite(eid) && eid > 0) body.expeditor_user_id = eid;
      }

      await api.post(`/api/${tenantSlug}/orders`, body);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["orders", tenantSlug] });
      if (isPolkiSheet) {
        void qc.invalidateQueries({ queryKey: ["returns", tenantSlug] });
        void qc.invalidateQueries({ queryKey: ["returns-client-data", tenantSlug] });
      }
      setRequestTypeRef("");
      setOrderNotePreset("");
      setRefSelectKey((k) => k + 1);
      onCreated();
    },
    onError: (e: Error) => {
      if (e.message === "warehouse") {
        setLocalError("Omborni tanlash shart.");
        return;
      }
      if (e.message === "client") {
        setLocalError("Klientni tanlang.");
        return;
      }
      if (e.message === "polki_order") {
        setLocalError("«Zakaz bo‘yicha» rejimida zakazni tanlang.");
        return;
      }
      if (e.message === "polki_qty_over") {
        setLocalError("Qaytarish miqdori sotilgan miqdordan oshmasin.");
        return;
      }
      if (e.message === "polki_too_many") {
        setLocalError(`Bir hujjatda jami qaytarish ${MAX_POLKI_RETURN_QTY} donadan oshmasin.`);
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
      if (e.message === "qty_over_stock") {
        setLocalError("Miqdor qoldiqdan oshmasin — har bir mahsulot uchun «Qoldiq» ustunidagi miqdordan ko‘p bo‘lmasin.");
        return;
      }
      const ax = e as AxiosError<{
        error?: string;
        product_id?: number;
        credit_limit?: string;
        outstanding?: string;
        order_total?: string;
        details?: unknown;
      }>;
      const code = ax.response?.data?.error;
      const d = ax.response?.data;
      if (code === "ValidationError" && d?.details != null) {
        setLocalError(
          `Server tekshiruvi: ${typeof d.details === "string" ? d.details : JSON.stringify(d.details)}`
        );
        return;
      }
      if (code === "BadQty") {
        setLocalError("Miqdor noto‘g‘ri (musbat son bo‘lsin).");
        return;
      }
      if (code === "BadWarehouse") {
        setLocalError("Tanlangan ombor topilmadi.");
        return;
      }
      if (code === "BadAgent") {
        setLocalError("Tanlangan agent topilmadi yoki faol emas.");
        return;
      }
      if (code === "NoRetailPrice" || code === "NoPrice") {
        const id = ax.response?.data?.product_id as number | undefined;
        const pt = (ax.response?.data as { price_type?: string } | undefined)?.price_type ?? "retail";
        setLocalError(
          id != null
            ? `Mahsulot #${id} uchun «${pt}» narxi yo‘q.`
            : `Narx yo‘q («${pt}»).`
        );
        return;
      }
      if (code === "InsufficientStock") {
        const d = ax.response?.data as { product_id?: number; available?: string; requested?: string };
        setLocalError(
          d?.product_id != null
            ? `Mahsulot #${d.product_id}: omborda yetarli emas (mavjud ${d.available ?? "—"}, kerak ${d.requested ?? "—"}).`
            : "Omborda yetarli mahsulot yo‘q."
        );
        return;
      }
      if (code === "BadExpeditor") {
        setLocalError("Tanlangan ekspeditor topilmadi yoki faol emas.");
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
      if (code === "BadOrder") {
        setLocalError("Zakaz topilmadi yoki qaytarish uchun mos emas.");
        return;
      }
      if (code === "BadOrderClient") {
        setLocalError("Zakaz bu mijozga tegishli emas yoki topilmadi.");
        return;
      }
      if (code === "TooManyItems") {
        const m = (d as { max?: number } | undefined)?.max;
        setLocalError(
          m != null ? `Juda ko‘p qator: server limiti ${m} ta.` : "Juda ko‘p qator (server limiti)."
        );
        return;
      }
      if (code === "QtyExceedsOrdered") {
        setLocalError("Qaytarish miqdori sotilgan / buyurtma miqdoridan oshmasin.");
        return;
      }
      if (code === "NothingToReturn") {
        setLocalError("Qaytarish uchun mos pozitsiya yo‘q yoki limit tugagan.");
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

  const canShowPolkiGrid =
    isPolkiSheet &&
    hasClient &&
    (isPolkiFree || (isPolkiByOrder && Number.isFinite(polkiOrderNum) && polkiOrderNum > 0));

  const stockReadyForLines = isPolkiSheet
    ? !polkiContextQ.isLoading && !polkiContextQ.isError
    : !canPickProducts || (!stockQ.isLoading && !stockQ.isError);

  const canSubmit = isPolkiSheet
    ? Boolean(
        hasClient &&
          hasWarehouse &&
          polkiContextQ.isSuccess &&
          polkiSelectedLinesCount > 0 &&
          polkiTotalReturnQtySum > 0 &&
          polkiTotalReturnQtySum <= MAX_POLKI_RETURN_QTY &&
          !hasPolkiQtyOverMax &&
          !mutation.isPending &&
          stockReadyForLines &&
          (isPolkiFree || (isPolkiByOrder && polkiOrderNum > 0))
      )
    : Boolean(
        hasClient &&
          hasWarehouse &&
          selectedItemsCount > 0 &&
          !mutation.isPending &&
          !loadingLists &&
          stockReadyForLines &&
          !hasQtyOverStock &&
          !hasMissingPriceForSelected
      );

  useEffect(() => {
    if (!hasClient) {
      setWarehouseId("");
      setAgentId("");
      setExpeditorUserId("");
    }
  }, [hasClient]);

  useEffect(() => {
    setLocalError(null);
  }, [
    clientId,
    warehouseId,
    agentId,
    applyBonus,
    selectedCategoryId,
    productSearch,
    qtyByProductId,
    expeditorUserId,
    priceType,
    orderComment,
    requestTypeRef,
    orderNotePreset,
    polkiHeaderDate,
    polkiTradeDirection,
    polkiSkidkaType,
    refusalReasonRefPolki
  ]);

  if (!tenantSlug) {
    return (
      <PageShell>
        <p className="text-sm text-destructive">
          <Link href="/login" className="underline">
            Войти снова
          </Link>
        </p>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <PageHeader
        title={
          isPolkiFree
            ? "Возврат с полки"
            : isPolkiByOrder
              ? "Возврат с полки по заказу"
              : "Yangi zakaz"
        }
        description={
          isPolkiSheet
            ? "Дата, клиент, тип цены, склад возврата, категории и таблица состава — как в эталонной форме."
            : "Klient, ombor va mahsulot miqdorlari — to‘liq sahifa."
        }
        actions={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Link className={cn(buttonVariants({ variant: "outline", size: "sm" }))} href="/orders">
              {isPolkiSheet ? "← Заказы" : "← Zakazlar ro‘yxati"}
            </Link>
            <Button type="button" variant="outline" size="sm" onClick={onCancel}>
              {isPolkiSheet ? "Отмена" : "Bekor"}
            </Button>
            <Button
              type="button"
              size="sm"
              data-testid="order-create-submit"
              disabled={!canSubmit}
              onClick={() => mutation.mutate()}
              className="bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50 dark:bg-teal-600 dark:hover:bg-teal-700"
              title={
                isPolkiSheet
                  ? !hasClient
                    ? "Avval klientni tanlang"
                    : isPolkiByOrder && !polkiOrderId
                      ? "Zakazni tanlang"
                      : !hasWarehouse
                        ? "Qaytarish omborini tanlang"
                        : polkiTotalReturnQtySum <= 0
                          ? "Kamida bitta mahsulot miqdorini kiriting"
                          : polkiTotalReturnQtySum > MAX_POLKI_RETURN_QTY
                            ? `Jami qaytarish ${MAX_POLKI_RETURN_QTY} donadan oshmasin`
                            : hasPolkiQtyOverMax
                              ? "Miqdor sotilganidan oshmasin"
                              : !stockReadyForLines
                                ? "Ma’lumotlar yuklanmoqda…"
                                : undefined
                  : !hasClient
                    ? "Avval klientni tanlang"
                    : !hasWarehouse
                      ? "Avval omborni tanlang"
                      : selectedItemsCount === 0
                        ? "Kamida bitta mahsulot miqdorini kiriting"
                        : hasQtyOverStock
                          ? "Miqdor qoldiqdan oshmasin"
                          : hasMissingPriceForSelected
                            ? "Tanlangan narx turi bo‘yicha narxi yo‘q mahsulotlar bor"
                            : !stockReadyForLines
                              ? "Qoldiqlar Загрузка…"
                              : undefined
              }
            >
              {mutation.isPending
                ? "Saqlanmoqda…"
                : isPolkiSheet
                  ? "Возврат"
                  : "Yaratish"}
            </Button>
          </div>
        }
      />

      <div className="flex w-full min-w-0 flex-col gap-6 pb-32">
        {localError ? (
          <p className="text-sm text-destructive" role="alert">
            {localError}
          </p>
        ) : null}

        {clientsQ.isError ? (
          <div
            role="alert"
            className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm"
          >
            <p className="font-semibold text-destructive">API bilan aloqa yo‘q</p>
            <p className="mt-1 text-muted-foreground">
              {isApiUnreachable(clientsQ.error) ? (
                <>
                  So‘rov manzili:{" "}
                  <code className="rounded bg-muted px-1 py-0.5 text-xs text-foreground">
                    {apiBaseURL || resolveApiOrigin()}
                  </code>{" "}
                  (devda ko‘pincha Next proxy orqali <code className="text-xs">/api</code>).
                  Klientlar va boshqa ro‘yxatlar backend ishlamaguncha bo‘sh ko‘rinadi. Loyiha ildizidan{" "}
                  <code className="rounded bg-muted px-1 text-xs text-foreground">npm run dev</code> (api+web)
                  yoki{" "}
                  <code className="rounded bg-muted px-1 text-xs text-foreground">
                    npm run dev --prefix backend
                  </code>{" "}
                  ni ishga tushiring (odatda port 4000). Boshqa portda bo‘lsa,{" "}
                  <code className="rounded bg-muted px-1 text-xs text-foreground">
                    NEXT_PUBLIC_API_URL
                  </code>{" "}
                  ni frontend <code className="rounded bg-muted px-1 text-xs text-foreground">.env.local</code>{" "}
                  da moslang.
                </>
              ) : (
                getUserFacingError(clientsQ.error, "Klientlar yuklanmadi.")
              )}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => void clientsQ.refetch()}
            >
              Qayta urinish
            </Button>
          </div>
        ) : null}

        {!isPolkiSheet ? (
          <div
            className="rounded-lg border border-dashed border-border/80 bg-muted/20 px-4 py-2.5 text-[11px] leading-relaxed text-muted-foreground"
            role="note"
          >
            <span className="font-medium text-foreground">Rejalashtirilmoqda: </span>
            buyurtma cheklovlari, taklif asosidagi zakaz, qator bo‘yicha skidka — alohida modul va API bilan
            ulanadi. Hozir «Skidka turi» faqat ko‘rinish; bonuslar serverdagi{" "}
            <span className="font-medium text-foreground">apply_bonus</span> bilan bog‘langan.
          </div>
        ) : (
          <div
            className="rounded-lg border border-emerald-600/25 bg-emerald-600/5 px-4 py-2.5 text-[11px] leading-relaxed text-muted-foreground"
            role="note"
          >
            <span className="font-medium text-foreground">Возврат с полки: </span>
            список из продаж клиента; после проведения приход на{" "}
            <span className="font-medium text-foreground">склад возврата</span>, суммы и бонусы считает сервер.
          </div>
        )}

        <section
          className={cn(
            "rounded-xl border bg-card p-4 shadow-sm sm:p-5 lg:p-6",
            isPolkiSheet && "border-teal-800/20 dark:border-teal-800/35"
          )}
        >
          {!isPolkiSheet ? (
          <>
          <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
            <h2 className="text-sm font-semibold text-foreground">Buyurtma ma&apos;lumotlari</h2>
            <p className="text-xs text-muted-foreground">
              Tartib: klient → ombor → narx / bonus → mahsulotlar
            </p>
          </div>

          <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="oc-client">Klient</Label>
              <FilterSelect
                id="oc-client"
                data-testid="order-create-client"
                className={fieldClass}
                emptyLabel="Klientni tanlang"
                aria-label="Klient"
                value={clientId}
                onChange={(e) => {
                  setClientId(e.target.value);
                  if (isPolkiByOrder) setPolkiOrderId("");
                }}
                disabled={mutation.isPending || loadingLists}
              >
                {clients.map((c) => (
                  <option key={c.id} value={String(c.id)}>
                    {c.name}
                    {c.phone ? ` · ${c.phone}` : ""}
                  </option>
                ))}
              </FilterSelect>
            </div>
            <div className="space-y-2">
              <Label htmlFor="oc-order-date">Buyurtma sanasi</Label>
              <Input
                id="oc-order-date"
                readOnly
                className={cn(fieldClass, "cursor-default bg-muted/40")}
                value={orderOpenedAt.toLocaleString("uz-UZ", { dateStyle: "medium", timeStyle: "short" })}
              />
              <p className="text-[11px] text-muted-foreground">
                Eski narxlar rejimi —{" "}
                <span className="font-medium text-foreground">rejalashtirilmoqda</span> (API yo‘q).
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-12 xl:gap-5">
            {/* Chap: zakaz maydonlari */}
            <div className="space-y-4 xl:col-span-3 xl:border-r xl:border-border/70 xl:pr-5">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Zakaz</p>
              <div className="space-y-2">
                <Label htmlFor="oc-warehouse">
                  {isPolkiSheet ? "Sklad qaytarish (qaytarish ombori)" : "Ombor"}
                </Label>
                <FilterSelect
                  id="oc-warehouse"
                  data-testid="order-create-warehouse"
                  className={fieldClass}
                  emptyLabel={isPolkiSheet ? "Qaytarish omborini tanlang" : "Omborni tanlang"}
                  aria-label={isPolkiSheet ? "Qaytarish ombori" : "Ombor"}
                  value={warehouseId}
                  onChange={(e) => setWarehouseId(e.target.value)}
                  disabled={mutation.isPending || loadingLists || !canPickWarehouse}
                >
                  {warehouses.map((w) => (
                    <option key={w.id} value={String(w.id)}>
                      {w.name}
                      {w.stock_purpose === "return" ? " · return" : ""}
                    </option>
                  ))}
                </FilterSelect>
                {!canPickWarehouse ? (
                  <p className="text-[11px] text-muted-foreground">Avval klientni tanlang.</p>
                ) : null}
              </div>
              {isPolkiFree ? (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Davr: dan</Label>
                    <Input
                      type="date"
                      className={fieldClass}
                      value={polkiDateFrom}
                      onChange={(e) => setPolkiDateFrom(e.target.value)}
                      disabled={mutation.isPending || !canPickWarehouse}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">gacha</Label>
                    <Input
                      type="date"
                      className={fieldClass}
                      value={polkiDateTo}
                      onChange={(e) => setPolkiDateTo(e.target.value)}
                      disabled={mutation.isPending || !canPickWarehouse}
                    />
                  </div>
                </div>
              ) : null}
              {isPolkiByOrder ? (
                <div className="space-y-2">
                  <Label htmlFor="oc-polki-order">Zakaz (po zakazu)</Label>
                  <FilterSelect
                    id="oc-polki-order"
                    className={fieldClass}
                    emptyLabel="Zakazni tanlang"
                    aria-label="Zakaz"
                    value={polkiOrderId}
                    onChange={(e) => setPolkiOrderId(e.target.value)}
                    disabled={
                      mutation.isPending || !canPickWarehouse || polkiOrdersPickQ.isLoading
                    }
                  >
                    {(polkiOrdersPickQ.data ?? []).map((o) => (
                      <option key={o.id} value={String(o.id)}>
                        {o.number} · {o.status} · {new Date(o.created_at).toLocaleDateString()}
                      </option>
                    ))}
                  </FilterSelect>
                  {canPickWarehouse && !polkiOrdersPickQ.isLoading && (polkiOrdersPickQ.data?.length ?? 0) === 0 ? (
                    <p className="text-[11px] text-muted-foreground">Bu mijoz uchun zakaz yo‘q.</p>
                  ) : null}
                </div>
              ) : null}
              <div className="space-y-2">
                <Label htmlFor="oc-agent">Agent</Label>
                <FilterSelect
                  id="oc-agent"
                  className={fieldClass}
                  emptyLabel="Agent (ixtiyoriy)"
                  aria-label="Agent"
                  value={agentId}
                  onChange={(e) => setAgentId(e.target.value)}
                  disabled={mutation.isPending || loadingLists || !canPickWarehouse}
                >
                  {agentUsers.map((u) => (
                    <option key={u.id} value={String(u.id)}>
                      {u.login} · {u.name}
                    </option>
                  ))}
                </FilterSelect>
              </div>
              {!isPolkiSheet ? (
                <div className="space-y-2">
                  <Label htmlFor="oc-exp">Ekspeditor</Label>
                  <FilterSelect
                    id="oc-exp"
                    className={fieldClass}
                    emptyLabel="Avtobog‘lash"
                    aria-label="Ekspeditor"
                    value={expeditorUserId}
                    onChange={(e) => setExpeditorUserId(e.target.value)}
                    disabled={mutation.isPending || expeditorsQ.isLoading || !canPickPricingAndExpeditor}
                  >
                    <option value="">Avtobog‘lash</option>
                    <option value="__none__">Ekspeditorsiz</option>
                    {(expeditorsQ.data ?? []).map((r) => (
                      <option key={r.id} value={String(r.id)}>
                        {r.login} · {r.fio}
                      </option>
                    ))}
                  </FilterSelect>
                  {!canPickPricingAndExpeditor ? (
                    <p className="text-[11px] text-muted-foreground">Ombor tanlang — keyin ochiladi.</p>
                  ) : null}
                </div>
              ) : null}

              <label className="flex cursor-not-allowed items-start gap-2 text-sm text-muted-foreground opacity-70">
                <input type="checkbox" disabled className="mt-0.5 size-4 rounded border-input" />
                <span>
                  Konstigatsiya{" "}
                  <span className="block text-[11px] text-destructive/90">Limit: rejalashtirilmoqda</span>
                </span>
              </label>

              {!isPolkiSheet ? (
                <div className="space-y-2">
                  <Label htmlFor="oc-bonus-mode">Bonus turi</Label>
                  <select
                    id="oc-bonus-mode"
                    className={fieldClass}
                    value={applyBonus ? "auto" : "off"}
                    onChange={(e) => setApplyBonus(e.target.value === "auto")}
                    disabled={mutation.isPending || !canPickPricingAndExpeditor}
                  >
                    <option value="auto">Avto (bonus qoidalarini qo‘llash)</option>
                    <option value="off">O‘chirilgan</option>
                  </select>
                </div>
              ) : null}
              <div className="space-y-2">
                <Label htmlFor="oc-discount-mode">Skidka turi</Label>
                <select id="oc-discount-mode" className={fieldClass} disabled title="API — keyinroq">
                  <option value="auto">Avto</option>
                </select>
                <p className="text-[11px] text-muted-foreground">
                  {isPolkiSheet
                    ? "Skidka turi — namunadagi kabi joy; API keyin ulashadi."
                    : "Chiziq / foiz skidkalari keyin ulashadi; hozir narx turi va bonus holati ishlatiladi."}
                </p>
              </div>
            </div>

            {/* O‘rta: kategoriya chip’lari */}
            <div className="min-w-0 space-y-3 xl:col-span-5">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Mahsulot kategoriyalari
              </p>
              <div
                className={cn(
                  "max-h-[min(40vh,260px)] overflow-y-auto rounded-lg border border-border bg-muted/15 p-3",
                  !canPickProducts && !canShowPolkiGrid && "pointer-events-none opacity-50"
                )}
              >
                {!canPickProducts && !canShowPolkiGrid ? (
                  <p className="text-xs text-muted-foreground">
                    {isPolkiSheet
                      ? "Avval klientni tanlang (va zakaz rejimida zakazni ham)."
                      : "Avval klient va omborni tanlang."}
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedCategoryId("")}
                      disabled={mutation.isPending}
                      className={cn(
                        "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                        selectedCategoryId === ""
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-background hover:bg-muted"
                      )}
                    >
                      Barchasi
                    </button>
                    {categories.map((c) => {
                      const active = selectedCategoryId === String(c.id);
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => setSelectedCategoryId(active ? "" : String(c.id))}
                          disabled={mutation.isPending}
                          className={cn(
                            "max-w-full truncate rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                            active
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border bg-background hover:bg-muted"
                          )}
                          title={c.name}
                        >
                          {c.name}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* O‘ng: narx turi + qoldiq */}
            <div className="space-y-4 xl:col-span-4 xl:border-l xl:border-border/70 xl:pl-5">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Narx turi</p>
                  <div
                    className={cn(
                      "space-y-2 rounded-lg border border-border bg-muted/10 p-3",
                      !canPickPricingAndExpeditor && "opacity-60"
                    )}
                    role="radiogroup"
                    aria-label="Narx turi"
                  >
                    {(priceTypesQ.data ?? ["retail"]).map((t) => (
                      <label
                        key={t}
                        className={cn(
                          "flex cursor-pointer items-center gap-2 rounded-md border border-transparent px-2 py-1.5 text-sm hover:bg-muted/60",
                          priceType === t && "border-primary/40 bg-primary/5"
                        )}
                      >
                        <input
                          type="radio"
                          name="oc-price-type"
                          className="size-4 border-input"
                          checked={priceType === t}
                          onChange={() => setPriceType(t)}
                          disabled={
                            mutation.isPending || priceTypesQ.isLoading || !canPickPricingAndExpeditor
                          }
                        />
                        <span className="font-medium capitalize">{t}</span>
                      </label>
                    ))}
                  </div>
                  <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
                    <input
                      type="checkbox"
                      className="size-4 rounded border-input"
                      checked={showZeroStock}
                      onChange={(e) => setShowZeroStock(e.target.checked)}
                      disabled={mutation.isPending || !canPickProducts}
                    />
                    Nol qoldiqdagi mahsulotlarni ham ko‘rsatish
                  </label>
            </div>
          </div>
          </>
          ) : (
          <>
            <div className="mb-5 rounded-lg border border-teal-800/25 bg-gradient-to-br from-teal-50/90 via-card to-card p-4 dark:from-teal-950/35 dark:via-card">
              <div className="grid gap-4 lg:grid-cols-[minmax(0,11rem)_minmax(0,1fr)_minmax(0,18rem)] lg:items-end">
                <div className="space-y-1.5">
                  <Label
                    htmlFor="oc-polki-doc-date"
                    className="text-[11px] font-semibold uppercase tracking-wide text-teal-900 dark:text-teal-200/90"
                  >
                    Дата заявки
                  </Label>
                  <Input
                    id="oc-polki-doc-date"
                    type="date"
                    className={fieldClass}
                    value={polkiHeaderDate}
                    onChange={(e) => setPolkiHeaderDate(e.target.value)}
                    disabled={mutation.isPending}
                  />
                </div>
                <div className="min-w-0 space-y-1.5">
                  <Label
                    htmlFor="oc-client-polki"
                    className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
                  >
                    Клиент
                  </Label>
                  <FilterSelect
                    id="oc-client-polki"
                    data-testid="order-create-client"
                    className={fieldClass}
                    emptyLabel="Выберите клиента"
                    aria-label="Клиент"
                    value={clientId}
                    onChange={(e) => {
                      setClientId(e.target.value);
                      if (isPolkiByOrder) setPolkiOrderId("");
                    }}
                    disabled={mutation.isPending || loadingLists}
                  >
                    {clients.map((c) => (
                      <option key={c.id} value={String(c.id)}>
                        {c.name}
                        {c.phone ? ` · ${c.phone}` : ""}
                      </option>
                    ))}
                  </FilterSelect>
                </div>
                <div className="space-y-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Тип цены
                  </p>
                  <div className="flex max-h-[5.5rem] flex-wrap gap-1.5 overflow-y-auto pr-0.5">
                    {(priceTypesQ.data ?? ["retail"]).map((t) => (
                      <label
                        key={t}
                        className={cn(
                          "inline-flex cursor-pointer items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                          priceType === t
                            ? "border-teal-600 bg-teal-600 text-white shadow-sm dark:border-teal-500 dark:bg-teal-600"
                            : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-border dark:bg-muted dark:text-foreground dark:hover:bg-muted/80"
                        )}
                      >
                        <input
                          type="radio"
                          name="oc-polki-price-type"
                          className="sr-only"
                          checked={priceType === t}
                          onChange={() => setPriceType(t)}
                          disabled={mutation.isPending || priceTypesQ.isLoading}
                        />
                        <span className="capitalize">{t}</span>
                      </label>
                    ))}
                  </div>
                  <label className="flex cursor-not-allowed items-center gap-2 text-[11px] text-muted-foreground opacity-60">
                    <input type="checkbox" disabled className="size-3.5 rounded border-input" />
                    Старые цены (скоро)
                  </label>
                  <p className="text-[10px] leading-snug text-muted-foreground">
                    Цены в таблице — из продажи; итог на сервере (бонусы).
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-5 xl:grid-cols-12 xl:gap-6">
              <div className="space-y-3 xl:col-span-4">
                <div className="rounded-lg border border-border bg-muted/20 p-4 shadow-sm">
                  <h3 className="mb-3 border-b border-border pb-2.5 text-sm font-semibold tracking-tight text-foreground">
                    Данные заявки
                  </h3>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="oc-warehouse-p">Склад для возврата</Label>
                      <FilterSelect
                        id="oc-warehouse-p"
                        data-testid="order-create-warehouse"
                        className={fieldClass}
                        emptyLabel="Склад…"
                        aria-label="Склад возврата"
                        value={warehouseId}
                        onChange={(e) => setWarehouseId(e.target.value)}
                        disabled={mutation.isPending || loadingLists || !canPickWarehouse}
                      >
                        {warehouses.map((w) => (
                          <option key={w.id} value={String(w.id)}>
                            {w.name}
                            {w.stock_purpose === "return" ? " · return" : ""}
                          </option>
                        ))}
                      </FilterSelect>
                      {!canPickWarehouse ? (
                        <p className="text-[11px] text-muted-foreground">Сначала выберите клиента.</p>
                      ) : null}
                    </div>
                    {isPolkiFree ? (
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Период с</Label>
                          <Input
                            type="date"
                            className={fieldClass}
                            value={polkiDateFrom}
                            onChange={(e) => setPolkiDateFrom(e.target.value)}
                            disabled={mutation.isPending || !canPickWarehouse}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">по</Label>
                          <Input
                            type="date"
                            className={fieldClass}
                            value={polkiDateTo}
                            onChange={(e) => setPolkiDateTo(e.target.value)}
                            disabled={mutation.isPending || !canPickWarehouse}
                          />
                        </div>
                      </div>
                    ) : null}
                    {isPolkiByOrder ? (
                      <div className="space-y-2">
                        <Label htmlFor="oc-polki-order-p">Заказ</Label>
                        <FilterSelect
                          id="oc-polki-order-p"
                          className={fieldClass}
                          emptyLabel="Заказ…"
                          aria-label="Заказ"
                          value={polkiOrderId}
                          onChange={(e) => setPolkiOrderId(e.target.value)}
                          disabled={
                            mutation.isPending || !canPickWarehouse || polkiOrdersPickQ.isLoading
                          }
                        >
                          {(polkiOrdersPickQ.data ?? []).map((o) => (
                            <option key={o.id} value={String(o.id)}>
                              {o.number} · {o.status} · {new Date(o.created_at).toLocaleDateString()}
                            </option>
                          ))}
                        </FilterSelect>
                        {canPickWarehouse &&
                        !polkiOrdersPickQ.isLoading &&
                        (polkiOrdersPickQ.data?.length ?? 0) === 0 ? (
                          <p className="text-[11px] text-muted-foreground">Нет заказов у клиента.</p>
                        ) : null}
                      </div>
                    ) : null}
                    <div className="space-y-2">
                      <Label htmlFor="oc-agent-p">Агент</Label>
                      <FilterSelect
                        id="oc-agent-p"
                        className={fieldClass}
                        emptyLabel="Не выбран"
                        aria-label="Агент"
                        value={agentId}
                        onChange={(e) => setAgentId(e.target.value)}
                        disabled={mutation.isPending || loadingLists || !canPickWarehouse}
                      >
                        {agentUsers.map((u) => (
                          <option key={u.id} value={String(u.id)}>
                            {u.login} · {u.name}
                          </option>
                        ))}
                      </FilterSelect>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="oc-polki-trade">Направление торговли</Label>
                      <select
                        id="oc-polki-trade"
                        className={fieldClass}
                        value={polkiTradeDirection}
                        onChange={(e) => setPolkiTradeDirection(e.target.value)}
                        disabled={mutation.isPending}
                      >
                        {POLKI_TRADE_DIRECTION_OPTS.map((o) => (
                          <option key={o.value || "__empty"} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="oc-polki-skidka">Тип скидки</Label>
                      <select
                        id="oc-polki-skidka"
                        className={fieldClass}
                        value={polkiSkidkaType}
                        onChange={(e) => setPolkiSkidkaType(e.target.value)}
                        disabled={mutation.isPending}
                      >
                        {POLKI_SKIDKA_OPTS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              </div>
              <div className="min-w-0 xl:col-span-8">
                <h3 className="mb-2 text-sm font-semibold text-foreground">Категории товаров</h3>
                <div
                  className={cn(
                    "max-h-[min(42vh,280px)] overflow-y-auto rounded-lg border border-slate-200/90 bg-slate-50/95 p-3 dark:border-border dark:bg-muted/25",
                    !canShowPolkiGrid && "pointer-events-none opacity-50"
                  )}
                >
                  {!canShowPolkiGrid ? (
                    <p className="text-xs text-muted-foreground">
                      {isPolkiByOrder
                        ? "Выберите клиента и заказ — затем категории."
                        : "Выберите клиента — затем категории."}
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedCategoryId("")}
                        disabled={mutation.isPending}
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                          selectedCategoryId === ""
                            ? "border-teal-600 bg-teal-600 text-white shadow-sm"
                            : "border-slate-200 bg-white text-slate-700 hover:bg-slate-100 dark:border-border dark:bg-background dark:hover:bg-muted"
                        )}
                      >
                        {selectedCategoryId === "" ? <Check className="size-3.5 shrink-0" /> : null}
                        Все
                      </button>
                      {categories.map((c) => {
                        const active = selectedCategoryId === String(c.id);
                        return (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => setSelectedCategoryId(active ? "" : String(c.id))}
                            disabled={mutation.isPending}
                            className={cn(
                              "inline-flex max-w-full items-center gap-1 truncate rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                              active
                                ? "border-teal-600 bg-teal-600 text-white shadow-sm"
                                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-100 dark:border-border dark:bg-background dark:hover:bg-muted"
                            )}
                            title={c.name}
                          >
                            {active ? <Check className="size-3.5 shrink-0" /> : null}
                            {c.name}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
          )}

          {!isPolkiSheet ? (
          <div className="mt-6 space-y-4 border-t border-border/70 pt-5">
            <p className="text-xs text-muted-foreground">
              Spravochniklar:{" "}
              <Link href="/settings/reasons/request-types" className="text-primary underline-offset-2 hover:underline">
                причины заявок
              </Link>
              ,{" "}
              <Link href="/settings/reasons/order-notes" className="text-primary underline-offset-2 hover:underline">
                примечание к заказу
              </Link>
              {isPolkiSheet ? (
                <>
                  ,{" "}
                  <Link
                    href="/settings/reasons/refusal-reasons"
                    className="text-primary underline-offset-2 hover:underline"
                  >
                    rad etish sabablari
                  </Link>
                </>
              ) : null}
              .
            </p>
            {isPolkiSheet && refusalReasonPolkiOptions.length > 0 ? (
              <div className="space-y-1.5">
                <Label htmlFor="oc-polki-refusal">Rad etish sababi (spravochnik)</Label>
                <select
                  id="oc-polki-refusal"
                  className={fieldClass}
                  value={refusalReasonRefPolki}
                  onChange={(e) => setRefusalReasonRefPolki(e.target.value)}
                  disabled={mutation.isPending}
                >
                  <option value="">—</option>
                  {refusalReasonPolkiOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            {!isPolkiSheet && requestTypeOptions.length > 0 ? (
              <div className="space-y-1.5">
                <Label>Заявка / yetkazib berish turi</Label>
                <Select
                  key={`rt-${refSelectKey}`}
                  value={requestTypeRef || undefined}
                  onValueChange={(v) => setRequestTypeRef(v === "__none__" ? "" : v)}
                >
                  <SelectTrigger id="oc-request-type" className="max-w-md">
                    <SelectValue placeholder="Tanlash ixtiyoriy" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">—</SelectItem>
                    {requestTypeOptions.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            {orderNoteOptions.length > 0 ? (
              <div className="space-y-1.5">
                <Label>Tayyor izoh shabloni</Label>
                <Select
                  key={`on-${refSelectKey}`}
                  value={orderNotePreset || undefined}
                  onValueChange={(v) => setOrderNotePreset(v === "__none__" ? "" : v)}
                >
                  <SelectTrigger id="oc-order-note-preset" className="max-w-md">
                    <SelectValue placeholder="Shablon tanlang (ixtiyoriy)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">—</SelectItem>
                    {orderNoteOptions.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            <Label htmlFor="oc-comment">Izoh (ichki)</Label>
            <textarea
              id="oc-comment"
              rows={3}
              className={cn(
                fieldClass,
                "min-h-[5.5rem] resize-y py-2.5 disabled:cursor-not-allowed disabled:opacity-50"
              )}
              value={orderComment}
              onChange={(e) => setOrderComment(e.target.value)}
              disabled={
                mutation.isPending || (!isPolkiSheet && !canPickPricingAndExpeditor)
              }
              placeholder={
                isPolkiSheet ? "Izoh / eslatma (ixtiyoriy)…" : "Buyurtma bo‘yicha eslatma…"
              }
              maxLength={4000}
            />
          </div>
          ) : null}

          {clientSummaryQ.data ? (
            <div className="mt-4 rounded-md border border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Mijoz moliyasi: </span>
              balans{" "}
              <span className="font-mono tabular-nums text-foreground">
                {formatNumberGrouped(clientSummaryQ.data.account_balance, { maxFractionDigits: 2 })}
              </span>
              {" · "}kredit limiti{" "}
              <span className="font-mono tabular-nums text-foreground">
                {formatNumberGrouped(clientSummaryQ.data.credit_limit, { maxFractionDigits: 2 })}
              </span>
              {" · "}ochiq zakazlar{" "}
              <span className="font-mono tabular-nums text-foreground">
                {formatNumberGrouped(clientSummaryQ.data.open_orders_total, { maxFractionDigits: 2 })}
              </span>
            </div>
          ) : null}
          {isPolkiSheet && polkiContextQ.data ? (
            <div className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Макс. к возврату (оценка): </span>
              <span className="tabular-nums font-medium text-amber-800 dark:text-amber-200">
                {formatNumberGrouped(polkiContextQ.data.max_returnable_value, { maxFractionDigits: 2 })}
              </span>
              {" · "}
              <span className="font-medium text-foreground">Лимит позиций в документе: </span>
              {MAX_POLKI_RETURN_QTY} шт
            </div>
          ) : null}
        </section>

        <section
          className={cn(
            "rounded-xl border bg-card p-4 shadow-sm sm:p-5 lg:p-6",
            !canPickProducts && !canShowPolkiGrid && "opacity-[0.88]",
            isPolkiSheet && "border-teal-800/15 dark:border-teal-800/30"
          )}
        >
          {isPolkiSheet ? (
            <div className="mb-4 border-b border-border/80 pb-3">
              <h2 className="text-base font-semibold tracking-tight text-foreground">Состав заявки</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {canShowPolkiGrid
                  ? "Ассортимент, блок, количество — не больше проданного. Поиск и категории сверху."
                  : "Сначала клиент, склад, период или заказ."}
              </p>
            </div>
          ) : (
            <div className="mb-4 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h2 className="text-sm font-semibold text-foreground">Buyurtma tarkibi</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  {canPickProducts
                    ? "Miqdor kiriting. Jadvalda taxminiy summa tanlangan narx turiga qarab."
                    : "Klient va omborni tanlang."}
                </p>
              </div>
              <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-3 lg:max-w-3xl lg:shrink-0">
                <div className="rounded-lg border border-emerald-600/25 bg-emerald-600/8 px-3 py-3 text-sm shadow-sm dark:bg-emerald-950/30">
                  <p className="text-xs font-medium text-emerald-800/90 dark:text-emerald-200/90">Jami hajm</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums text-emerald-900 dark:text-emerald-100">
                    {formatNumberGrouped(totalVolumeM3, { maxFractionDigits: 3 })}{" "}
                    <span className="text-sm font-normal text-emerald-800/80 dark:text-emerald-300/80">m³</span>
                  </p>
                </div>
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-3 text-sm shadow-sm dark:bg-amber-950/35">
                  <p className="text-xs font-medium text-amber-900/90 dark:text-amber-100/90">Jami miqdor</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums text-amber-950 dark:text-amber-50">
                    {formatNumberGrouped(Number(selectedTotalQty) || 0, { maxFractionDigits: 3 })}{" "}
                    <span className="text-sm font-normal text-amber-800/90 dark:text-amber-200/80">dona</span>
                  </p>
                </div>
                <div className="rounded-lg border border-teal-600/25 bg-teal-600/10 px-3 py-3 text-sm shadow-sm dark:bg-teal-950/35">
                  <p className="text-xs font-medium text-teal-900/90 dark:text-teal-100/90">Taxminiy summa</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums text-teal-900 dark:text-teal-100">
                    {estimatedSum > 0
                      ? formatNumberGrouped(estimatedSum, { maxFractionDigits: 0 })
                      : "0"}
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
            <div className="relative min-w-0 flex-1">
              {isPolkiSheet ? (
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
              ) : null}
              <Input
                placeholder={isPolkiSheet ? "Поиск: название, SKU" : "Qidiruv: nom, SKU"}
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                disabled={
                  mutation.isPending ||
                  (isPolkiSheet ? !canShowPolkiGrid : !canPickProducts)
                }
                className={cn("h-10", isPolkiSheet && "pl-9")}
              />
            </div>
          </div>

          {!isPolkiSheet ? (
          <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
            <div className="max-h-[min(60vh,720px)] overflow-auto">
              <table className="w-full min-w-[980px] border-collapse text-sm">
                <thead className="app-table-thead sticky top-0 z-[1] backdrop-blur-sm">
                  <tr className="text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <th className="min-w-[12rem] px-3 py-2.5">Mahsulot</th>
                    <th className="min-w-[5.5rem] px-3 py-2.5 text-right">Narx</th>
                    <th
                      className="min-w-[5.5rem] px-3 py-2.5 text-center"
                      title="Qadoq / blok. Kartotekada blokdagi dona bo‘lsa, miqdor = blok × dona."
                    >
                      Blok
                    </th>
                    <th className="min-w-[5.5rem] px-3 py-2.5 text-center">Miqdor</th>
                    <th className="min-w-[4.5rem] px-3 py-2.5 text-right">Hajm m³</th>
                    <th className="min-w-[4.5rem] px-3 py-2.5 text-right" title="Fakt qoldiq (jami omborda)">
                      Fakt
                    </th>
                    <th className="min-w-[4.5rem] px-3 py-2.5 text-right" title="Band qilingan miqdor">
                      Bron
                    </th>
                    <th className="min-w-[5rem] px-3 py-2.5 text-right" title="Mavjud (fakt − bron)">
                      Mavjud
                    </th>
                    <th className="min-w-[6rem] px-3 py-2.5 text-right">Jami</th>
                  </tr>
                </thead>
                <tbody>
                  {canPickProducts && stockQ.isLoading ? (
                    <tr>
                      <td colSpan={9} className="px-3 py-10 text-center text-sm text-muted-foreground">
                        Ombor qoldiqlari Загрузка…
                      </td>
                    </tr>
                  ) : null}
                  {canPickProducts && stockQ.isError ? (
                    <tr>
                      <td colSpan={9} className="px-3 py-10 text-center text-sm text-destructive">
                        Qoldiqlarni yuklab bo‘lmadi. Internet yoki omborni tekshiring.
                      </td>
                    </tr>
                  ) : null}
                  {canPickProducts && !stockQ.isLoading && !stockQ.isError
                    ? displayProducts.map((p) => {
                        const stock = stockByProduct.get(p.id);
                        const qtyTotal = stock?.qty ?? "0";
                        const reserved = stock?.reserved_qty ?? "0";
                        const availNum = availableOrderQty(stock);
                        const qpb = p.qty_per_block;
                        const unit = unitPriceForType(p, priceType);
                        const lineQtyRaw = qtyByProductId[p.id] ?? "";
                        const lineQ = Number.parseFloat(lineQtyRaw.replace(",", "."));
                        const blockRaw = blockByProductId[p.id] ?? "";
                        const blockN = Number.parseFloat(blockRaw.replace(",", "."));
                        let impliedFromBlock = NaN;
                        if (qpb != null && qpb > 0) {
                          if (Number.isFinite(blockN) && blockN > 0) impliedFromBlock = blockN * qpb;
                        } else if (Number.isFinite(blockN)) {
                          impliedFromBlock = blockN;
                        }
                        const qtyOver =
                          Boolean(lineQtyRaw.trim()) &&
                          Number.isFinite(lineQ) &&
                          lineQ > 0 &&
                          lineQ > availNum;
                        const blockOver =
                          Boolean(blockRaw.trim()) &&
                          Number.isFinite(impliedFromBlock) &&
                          impliedFromBlock > availNum;
                        const effQ =
                          Number.isFinite(lineQ) && lineQ > 0 ? Math.min(lineQ, availNum) : 0;
                        const volU = p.volume_m3 != null ? Number.parseFloat(p.volume_m3) : NaN;
                        const lineVolM3 =
                          Number.isFinite(volU) && effQ > 0 ? effQ * volU : 0;
                        const lineTotalMoney =
                          unit != null && effQ > 0 ? effQ * parsePriceAmount(unit) : null;
                        const maxLabel = formatNumberGrouped(availNum, { maxFractionDigits: 3 });
                        return (
                          <tr key={p.id} className="border-b border-border/80 last:border-0 hover:bg-muted/25">
                            <td className="px-3 py-2 align-top">
                              <div className="font-medium leading-snug text-foreground">{p.name}</div>
                              {p.sku ? (
                                <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                                  {p.sku}
                                </div>
                              ) : null}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums text-muted-foreground align-middle">
                              {unit != null
                                ? formatNumberGrouped(parsePriceAmount(unit), { maxFractionDigits: 2 })
                                : "—"}
                            </td>
                            <td className="px-3 py-2 align-top">
                              <div className="mx-auto flex max-w-[6.5rem] flex-col items-stretch">
                                {blockOver ? (
                                  <span className="mb-0.5 text-center text-[11px] font-semibold text-destructive">
                                    Maks: {maxLabel}
                                  </span>
                                ) : null}
                                <Input
                                  type="number"
                                  min={0}
                                  step="any"
                                  placeholder="0"
                                  title={
                                    qpb != null && qpb > 0
                                      ? `1 blok = ${qpb} dona`
                                      : "Blok va miqdor bir xil (kartotekada blok/o‘lcham yo‘q)"
                                  }
                                  className={cn(
                                    "h-9 w-full tabular-nums text-center",
                                    blockOver && "border-destructive focus-visible:ring-destructive"
                                  )}
                                  value={blockRaw}
                                  onChange={(e) => {
                                    const blockStr = e.target.value;
                                    setBlockByProductId((prev) => ({ ...prev, [p.id]: blockStr }));
                                    const qpbN = p.qty_per_block;
                                    if (qpbN != null && qpbN > 0) {
                                      if (!blockStr.trim()) {
                                        setQtyByProductId((prev) => ({ ...prev, [p.id]: "" }));
                                        return;
                                      }
                                      const blocks = Number.parseFloat(blockStr.replace(",", "."));
                                      if (!Number.isFinite(blocks) || blocks <= 0) return;
                                      setQtyByProductId((prev) => ({
                                        ...prev,
                                        [p.id]: formatQtyState(blocks * qpbN)
                                      }));
                                      return;
                                    }
                                    setQtyByProductId((prev) => ({ ...prev, [p.id]: blockStr }));
                                  }}
                                  onBlur={() => {
                                    const br = blockByProductId[p.id];
                                    if (!br?.trim()) return;
                                    const blocks = Number.parseFloat(br.replace(",", "."));
                                    if (!Number.isFinite(blocks) || blocks <= 0) return;
                                    const qpbN = p.qty_per_block;
                                    if (qpbN != null && qpbN > 0) {
                                      let qtyVal = blocks * qpbN;
                                      if (qtyVal > availNum) {
                                        qtyVal = availNum;
                                        setBlockByProductId((prev) => ({
                                          ...prev,
                                          [p.id]: availNum > 0 ? formatQtyState(availNum / qpbN) : ""
                                        }));
                                        setQtyByProductId((prev) => ({
                                          ...prev,
                                          [p.id]: qtyVal > 0 ? formatQtyState(qtyVal) : ""
                                        }));
                                      }
                                      return;
                                    }
                                    if (blocks > availNum) {
                                      const cap = availNum > 0 ? String(availNum) : "";
                                      setBlockByProductId((prev) => ({ ...prev, [p.id]: cap }));
                                      setQtyByProductId((prev) => ({ ...prev, [p.id]: cap }));
                                    }
                                  }}
                                  disabled={mutation.isPending}
                                />
                              </div>
                            </td>
                            <td className="px-3 py-2 align-top">
                              <div className="mx-auto flex max-w-[6.5rem] flex-col items-stretch">
                                {qtyOver ? (
                                  <span className="mb-0.5 text-center text-[11px] font-semibold text-destructive">
                                    Maks: {maxLabel}
                                  </span>
                                ) : null}
                                <Input
                                  type="number"
                                  min={0}
                                  step="any"
                                  placeholder="0"
                                  data-testid="oc-line-qty"
                                  data-oc-product-id={p.id}
                                  className={cn(
                                    "h-9 w-full tabular-nums text-center",
                                    qtyOver && "border-destructive focus-visible:ring-destructive"
                                  )}
                                  value={lineQtyRaw}
                                  onChange={(e) => {
                                    const v = e.target.value;
                                    setQtyByProductId((prev) => ({ ...prev, [p.id]: v }));
                                    const qpbN = p.qty_per_block;
                                    if (qpbN != null && qpbN > 0) {
                                      const q = Number.parseFloat(v.replace(",", "."));
                                      if (!v.trim() || !Number.isFinite(q) || q <= 0) {
                                        setBlockByProductId((prev) => ({ ...prev, [p.id]: "" }));
                                      } else {
                                        setBlockByProductId((prev) => ({
                                          ...prev,
                                          [p.id]: formatQtyState(q / qpbN)
                                        }));
                                      }
                                    } else {
                                      setBlockByProductId((prev) => ({ ...prev, [p.id]: v }));
                                    }
                                  }}
                                  onBlur={() => {
                                    const raw = qtyByProductId[p.id];
                                    if (!raw?.trim()) return;
                                    const n = Number.parseFloat(raw.replace(",", "."));
                                    if (!Number.isFinite(n) || n <= 0) return;
                                    if (n > availNum) {
                                      const capped = availNum > 0 ? formatQtyState(availNum) : "";
                                      setQtyByProductId((prev) => ({ ...prev, [p.id]: capped }));
                                      const qpbN = p.qty_per_block;
                                      if (qpbN != null && qpbN > 0 && capped) {
                                        const q = Number.parseFloat(capped.replace(",", "."));
                                        if (Number.isFinite(q) && q > 0) {
                                          setBlockByProductId((prev) => ({
                                            ...prev,
                                            [p.id]: formatQtyState(q / qpbN)
                                          }));
                                        }
                                      } else {
                                        setBlockByProductId((prev) => ({ ...prev, [p.id]: capped }));
                                      }
                                    }
                                  }}
                                  disabled={mutation.isPending}
                                />
                              </div>
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums text-muted-foreground align-middle">
                              {lineVolM3 > 0
                                ? formatNumberGrouped(lineVolM3, { maxFractionDigits: 4 })
                                : "0"}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums font-medium text-foreground align-middle">
                              {formatNumberGrouped(parseStockQty(qtyTotal), { maxFractionDigits: 3 })}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums text-amber-700 dark:text-amber-300 align-middle">
                              {formatNumberGrouped(parseStockQty(reserved), { maxFractionDigits: 3 })}
                            </td>
                            <td
                              className="px-3 py-2 text-right tabular-nums font-semibold text-foreground align-middle"
                              title={`Fakt: ${qtyTotal}, bron: ${reserved}`}
                            >
                              {formatNumberGrouped(availNum, { maxFractionDigits: 3 })}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums font-semibold text-foreground align-middle">
                              {lineTotalMoney != null && lineTotalMoney > 0
                                ? formatNumberGrouped(lineTotalMoney, { maxFractionDigits: 0 })
                                : "—"}
                            </td>
                          </tr>
                        );
                      })
                    : null}
                  {canPickProducts &&
                  !stockQ.isLoading &&
                  !stockQ.isError &&
                  catalogProducts.length > 0 &&
                  displayProducts.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-3 py-10 text-center text-xs text-muted-foreground">
                        Qidiruv bo‘yicha mahsulot topilmadi.
                      </td>
                    </tr>
                  ) : null}
                  {canPickProducts &&
                  !stockQ.isLoading &&
                  !stockQ.isError &&
                  catalogProducts.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-3 py-10 text-center text-xs text-muted-foreground">
                        {showZeroStock
                          ? "Bu kategoriya / ombor bo‘yicha mahsulot yo‘q."
                          : "Noldan yuqori qoldiq yo‘q. «Nol qoldiq»ni yoqing yoki kategoriyani tekshiring."}
                      </td>
                    </tr>
                  ) : null}
                  {!canPickProducts ? (
                    <tr>
                      <td colSpan={9} className="px-3 py-10 text-center text-xs text-muted-foreground">
                        Avval klient va omborni tanlang — keyin jadval ochiladi.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
                {canPickProducts && !stockQ.isLoading && !stockQ.isError && displayProducts.length > 0 ? (
                  <tfoot>
                    <tr className="border-t-2 border-border bg-muted/40 font-semibold">
                      <td className="px-3 py-2.5 text-foreground" colSpan={3}>
                        Jami
                      </td>
                      <td className="px-3 py-2.5 text-center tabular-nums text-foreground">
                        {formatNumberGrouped(selectedTotalQty, { maxFractionDigits: 3 })}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-foreground">
                        {formatNumberGrouped(totalVolumeM3, { maxFractionDigits: 4 })}
                      </td>
                      <td className="px-3 py-2.5 text-right text-muted-foreground">—</td>
                      <td className="px-3 py-2.5 text-right text-muted-foreground">—</td>
                      <td className="px-3 py-2.5 text-right text-muted-foreground">—</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-teal-800 dark:text-teal-200">
                        {estimatedSum > 0
                          ? formatNumberGrouped(estimatedSum, { maxFractionDigits: 0 })
                          : "—"}
                      </td>
                    </tr>
                  </tfoot>
                ) : null}
              </table>
            </div>
          </div>
          ) : (
            <PolkiReturnLinesTable
              canShowPolkiGrid={canShowPolkiGrid}
              isPolkiByOrder={isPolkiByOrder}
              isPolkiFree={isPolkiFree}
              polkiLoading={polkiContextQ.isLoading}
              polkiError={polkiContextQ.isError}
              polkiSuccess={polkiContextQ.isSuccess}
              polkiRowsAllLength={polkiRowsAll.length}
              polkiDisplayRows={polkiDisplayRows}
              qtyByProductId={qtyByProductId}
              setQtyByProductId={setQtyByProductId}
              blockByProductId={blockByProductId}
              setBlockByProductId={setBlockByProductId}
              mutationPending={mutation.isPending}
              polkiTotalReturnQtySum={polkiTotalReturnQtySum}
              polkiVolumeM3={polkiVolumeM3}
              polkiEstimatedSum={polkiEstimatedSum}
            />
          )}

          {isPolkiSheet ? (
            <>
              <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-emerald-600/25 bg-emerald-600/8 px-3 py-3 text-sm shadow-sm dark:bg-emerald-950/30">
                  <p className="text-xs font-medium text-emerald-800/90 dark:text-emerald-200/90">
                    Общий объём
                  </p>
                  <p className="mt-1 text-lg font-semibold tabular-nums text-emerald-900 dark:text-emerald-100">
                    {formatNumberGrouped(polkiVolumeM3, { maxFractionDigits: 3 })}{" "}
                    <span className="text-sm font-normal text-emerald-800/80 dark:text-emerald-300/80">m³</span>
                  </p>
                </div>
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-3 text-sm shadow-sm dark:bg-amber-950/35">
                  <p className="text-xs font-medium text-amber-900/90 dark:text-amber-100/90">
                    Общее кол-во
                  </p>
                  <p className="mt-1 text-lg font-semibold tabular-nums text-amber-950 dark:text-amber-50">
                    {formatNumberGrouped(polkiTotalReturnQtySum, { maxFractionDigits: 3 })}{" "}
                    <span className="text-sm font-normal text-amber-800/90 dark:text-amber-200/80">шт</span>
                  </p>
                </div>
                <div className="rounded-lg border border-teal-600/25 bg-teal-600/10 px-3 py-3 text-sm shadow-sm dark:bg-teal-950/35">
                  <p className="text-xs font-medium text-teal-900/90 dark:text-teal-100/90">Общая сумма</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums text-teal-900 dark:text-teal-100">
                    {polkiEstimatedSum > 0
                      ? formatNumberGrouped(polkiEstimatedSum, { maxFractionDigits: 0 })
                      : "0"}{" "}
                    <span className="text-sm font-normal opacity-80">so&apos;m</span>
                  </p>
                </div>
              </div>

              <div className="mt-6 space-y-4 border-t border-border/70 pt-5">
                <p className="text-xs text-muted-foreground">
                  Справочники:{" "}
                  <Link
                    href="/settings/reasons/order-notes"
                    className="text-primary underline-offset-2 hover:underline"
                  >
                    примечание к заказу
                  </Link>
                  {", "}
                  <Link
                    href="/settings/reasons/refusal-reasons"
                    className="text-primary underline-offset-2 hover:underline"
                  >
                    причины отказа
                  </Link>
                  .
                </p>
                {refusalReasonPolkiOptions.length > 0 ? (
                  <div className="space-y-1.5">
                    <Label htmlFor="oc-polki-refusal">Примечание / причина отказа</Label>
                    <select
                      id="oc-polki-refusal"
                      className={fieldClass}
                      value={refusalReasonRefPolki}
                      onChange={(e) => setRefusalReasonRefPolki(e.target.value)}
                      disabled={mutation.isPending}
                    >
                      <option value="">—</option>
                      {refusalReasonPolkiOptions.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}
                {orderNoteOptions.length > 0 ? (
                  <div className="space-y-1.5">
                    <Label>Шаблон примечания</Label>
                    <Select
                      key={`on-polki-${refSelectKey}`}
                      value={orderNotePreset || undefined}
                      onValueChange={(v) => setOrderNotePreset(v === "__none__" ? "" : v)}
                    >
                      <SelectTrigger id="oc-order-note-preset-polki" className="max-w-md">
                        <SelectValue placeholder="Выберите шаблон" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">—</SelectItem>
                        {orderNoteOptions.map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}
                <Label htmlFor="oc-comment-polki">Комментарий</Label>
                <textarea
                  id="oc-comment-polki"
                  rows={4}
                  className={cn(
                    fieldClass,
                    "min-h-[6rem] resize-y py-2.5 disabled:cursor-not-allowed disabled:opacity-50"
                  )}
                  value={orderComment}
                  onChange={(e) => setOrderComment(e.target.value)}
                  disabled={mutation.isPending}
                  placeholder="Текст примечания…"
                  maxLength={4000}
                />
              </div>
            </>
          ) : null}

          {!isPolkiSheet && hasMissingPriceForSelected ? (
            <p className="mt-3 text-xs text-destructive">
              Tanlangan narx turi ({priceType}) bo‘yicha narxi yo‘q mahsulot bor:{" "}
              {missingPriceProductNames.join(", ")}
              {missingPriceProductNames.length >= 3 ? "..." : ""}. Narx turini almashtiring yoki mahsulot narxini
              kiriting.
            </p>
          ) : null}

          <p className="mt-3 text-xs text-muted-foreground">
            {isPolkiSheet ? (
              <>
                <span className="font-medium text-foreground">Возврат: </span>
                после проведения — приход на выбранный склад возврата; детали списания с продажного склада
                задаёт сервер. Суммы в таблице и карточках — оценка по ценам продажи.
              </>
            ) : (
              <>
                <span className="font-medium text-foreground">Ombor: </span>
                yaratishda bloklangan miqdor oshadi; tasdiqlanganda qoldiq kamayadi. Bekor qilsangiz — blokdan
                qaytariladi.{" "}
                <span className="font-medium text-foreground">Taxminiy summa</span> bonus va yakuniy chegirmasiz.
              </>
            )}
          </p>
        </section>
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-background/95 px-4 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="flex w-full min-w-0 flex-wrap items-center justify-end gap-2 pr-1">
          <Button type="button" variant="outline" onClick={onCancel} disabled={mutation.isPending}>
            {isPolkiSheet ? "Отмена" : "Bekor"}
          </Button>
          <Button
            type="button"
            disabled={!canSubmit}
            onClick={() => mutation.mutate()}
            className="bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50 dark:bg-teal-600 dark:hover:bg-teal-700"
          >
            {mutation.isPending
              ? "Saqlanmoqda…"
              : isPolkiSheet
                ? "Возврат"
                : "Yaratish"}
          </Button>
        </div>
      </div>
    </PageShell>
  );
}
