"use client";

import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/dashboard/page-header";
import { PageShell } from "@/components/dashboard/page-shell";
import { DatePickerPopover, formatRuDateButton } from "@/components/ui/date-picker-popover";
import { DateRangePopover, formatDateRangeButton } from "@/components/ui/date-range-popover";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FilterSelect } from "@/components/ui/filter-select";
import { api, apiBaseURL, resolveApiOrigin } from "@/lib/api";
import { ORDER_TYPE_VALUES } from "@/lib/order-types";
import { getUserFacingError, isApiUnreachable } from "@/lib/error-utils";
import type { ClientRow } from "@/lib/client-types";
import type { ProductRow } from "@/lib/product-types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Fragment,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction
} from "react";
import { createPortal } from "react-dom";
import type { AxiosError } from "axios";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";
import { formatNumberGrouped } from "@/lib/format-numbers";
import { STALE } from "@/lib/query-stale";
import { MAX_RETURN_PHYSICAL_UNITS_PER_DOCUMENT } from "@/lib/return-limits";
import {
  activeRefSelectOptions,
  refEntryLabelByStored,
} from "@/lib/profile-ref-entries";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarDays, Check, ChevronDown, Gift, Search } from "lucide-react";

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

const MAX_POLKI_RETURN_QTY = MAX_RETURN_PHYSICAL_UNITS_PER_DOCUMENT;

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

const POLKI_PRICE_TYPE_LABEL_RU: Record<string, string> = {
  retail: "Розница",
  wholesale: "Опт"
};

/** Русские подписи к внутренним кодам статуса заказа (для подсказок и сообщений). */
const ORDER_STATUS_LABEL_RU: Record<string, string> = {
  new: "Новый",
  confirmed: "Подтверждён",
  picking: "Комплектация",
  delivering: "Доставка",
  delivered: "Доставлен",
  returned: "Возвращён",
  cancelled: "Отменён"
};

function orderStatusLabelRu(status: string): string {
  const k = status.trim().toLowerCase();
  return ORDER_STATUS_LABEL_RU[k] ?? status;
}

/** Zakaz + mahsulot bitta qatorda: pullik va bonus alohida input. */
type PolkiPairRowModel = {
  pair_key: string;
  order_id: number;
  order_number: string;
  product_id: number;
  name: string;
  sku: string;
  unit: string;
  max_paid: number;
  max_bonus: number;
  unit_price_paid: number;
  unit_price_bonus: number;
  category_id: number | null;
  volume_m3: string | null | undefined;
};

type PolkiClientItem = {
  product_id: number;
  sku: string;
  name: string;
  unit: string;
  qty: string;
  price: string;
  is_bonus: boolean;
  order_id?: number;
  order_number?: string;
};

function buildPolkiPairRows(items: PolkiClientItem[], products: ProductRow[]): PolkiPairRowModel[] {
  const pmap = new Map(products.map((p) => [p.id, p]));
  type Acc = {
    order_id: number;
    order_number: string;
    product_id: number;
    name: string;
    sku: string;
    unit: string;
    max_paid: number;
    max_bonus: number;
    unit_price_paid: number;
    unit_price_bonus: number;
  };
  const groups = new Map<string, Acc>();

  for (const it of items) {
    const q = Number.parseFloat(String(it.qty).replace(/\s/g, "").replace(",", "."));
    if (!Number.isFinite(q) || q <= 0) continue;
    const oid = it.order_id ?? 0;
    if (!(oid > 0)) continue;
    const price = Number.parseFloat(String(it.price).replace(/\s/g, "").replace(",", "."));
    const up = Number.isFinite(price) ? price : 0;
    const key = `${oid}-${it.product_id}`;
    let g = groups.get(key);
    if (!g) {
      g = {
        order_id: oid,
        order_number: it.order_number ?? `#${oid}`,
        product_id: it.product_id,
        name: it.name,
        sku: it.sku,
        unit: it.unit,
        max_paid: 0,
        max_bonus: 0,
        unit_price_paid: up,
        unit_price_bonus: up
      };
      groups.set(key, g);
    }
    if (it.is_bonus) {
      g.max_bonus += q;
      g.unit_price_bonus = up;
    } else {
      g.max_paid += q;
      g.unit_price_paid = up;
    }
  }

  return Array.from(groups.values())
    .map((g) => {
      const p = pmap.get(g.product_id);
      return {
        pair_key: `${g.order_id}-${g.product_id}`,
        order_id: g.order_id,
        order_number: g.order_number,
        product_id: g.product_id,
        name: g.name,
        sku: g.sku,
        unit: g.unit,
        max_paid: g.max_paid,
        max_bonus: g.max_bonus,
        unit_price_paid: g.unit_price_paid,
        unit_price_bonus: g.unit_price_bonus,
        category_id: p?.category_id ?? null,
        volume_m3: p?.volume_m3
      };
    })
    .sort((a, b) => (a.order_id - b.order_id || a.product_id - b.product_id));
}

/** Umumiy qaytarish: avval pullik qoldiq, keyin bonus (FIFO). */
function polkiSplitTotal(r: PolkiPairRowModel, totalIn: number): { effPaid: number; effBonus: number } {
  const raw = Number.isFinite(totalIn) && totalIn > 0 ? totalIn : 0;
  const maxTot = r.max_paid + r.max_bonus;
  const t = Math.min(raw, maxTot);
  const effPaid = Math.min(t, r.max_paid);
  const effBonus = Math.min(Math.max(0, t - effPaid), r.max_bonus);
  return { effPaid, effBonus };
}

type PolkiOrderGroup = {
  orderId: number;
  orderNumber: string;
  orderDate: string;
  rows: PolkiPairRowModel[];
};

type PolkiLinesTableProps = {
  canShowPolkiGrid: boolean;
  isPolkiByOrder: boolean;
  isPolkiFree: boolean;
  polkiLoading: boolean;
  polkiError: boolean;
  polkiSuccess: boolean;
  polkiRowsAllLength: number;
  polkiOrderGroups: PolkiOrderGroup[];
  polkiTotalQty: Record<string, string>;
  setPolkiTotalQty: Dispatch<SetStateAction<Record<string, string>>>;
  polkiBonusToBalance: Record<string, boolean>;
  setPolkiBonusToBalance: Dispatch<SetStateAction<Record<string, boolean>>>;
  polkiBonusCash: Record<string, string>;
  setPolkiBonusCash: Dispatch<SetStateAction<Record<string, string>>>;
  mutationPending: boolean;
  polkiTotalReturnQtySum: number;
  polkiVolumeM3: number;
  polkiEstimatedSum: number;
  polkiDebtHintSum: number;
};

const POLKI_TABLE_COLS = 5;

function PolkiReturnLinesTable({
  canShowPolkiGrid,
  isPolkiByOrder,
  isPolkiFree,
  polkiLoading,
  polkiError,
  polkiSuccess,
  polkiRowsAllLength,
  polkiOrderGroups,
  polkiTotalQty,
  setPolkiTotalQty,
  polkiBonusToBalance,
  setPolkiBonusToBalance,
  polkiBonusCash,
  setPolkiBonusCash,
  mutationPending,
  polkiTotalReturnQtySum,
  polkiVolumeM3,
  polkiEstimatedSum,
  polkiDebtHintSum
}: PolkiLinesTableProps) {
  const flatRowCount = polkiOrderGroups.reduce((a, g) => a + g.rows.length, 0);
  return (
    <div className="overflow-hidden rounded-lg border border-teal-800/20 bg-card shadow-sm dark:border-teal-800/35">
      <div className="max-h-[min(75vh,920px)] min-h-[220px] overflow-auto">
        <table className="w-full min-w-[860px] border-collapse text-sm">
          <thead className="app-table-thead sticky top-0 z-[1] backdrop-blur-sm">
            <tr className="text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <th className="min-w-[5rem] px-2 py-1.5">Заказ</th>
              <th className="min-w-[9rem] px-2 py-1.5">Товар</th>
              <th
                className="min-w-[13rem] px-2 py-1.5"
                title={`Введите общее количество по строке (макс. см. подсказку в ячейке). Автораспределение: сначала оплата, затем бонус. В одном документе суммарно не более ${MAX_POLKI_RETURN_QTY} шт на склад, считая и оплату, и бонус (если бонус возвращается на склад).`}
              >
                Дата · всего к возврату
              </th>
              <th className="min-w-[15rem] px-2 py-1.5">Бонус / баланс</th>
              <th className="min-w-[3.5rem] px-2 py-1.5 text-right">m³</th>
            </tr>
          </thead>
          <tbody>
            {!canShowPolkiGrid ? (
              <tr>
                <td
                  colSpan={POLKI_TABLE_COLS}
                  className="px-3 py-8 text-center text-xs text-muted-foreground"
                >
                  Выберите клиента
                  {isPolkiByOrder ? " и заказ" : ""}
                  {isPolkiFree ? " (период опционально)" : ""}.
                </td>
              </tr>
            ) : null}
            {canShowPolkiGrid && polkiLoading ? (
              <tr>
                <td
                  colSpan={POLKI_TABLE_COLS}
                  className="px-3 py-8 text-center text-sm text-muted-foreground"
                >
                  Загрузка контекста возврата…
                </td>
              </tr>
            ) : null}
            {canShowPolkiGrid && polkiError ? (
              <tr>
                <td
                  colSpan={POLKI_TABLE_COLS}
                  className="px-3 py-8 text-center text-sm text-destructive"
                >
                  Не удалось загрузить данные. Проверьте параметры и попробуйте снова.
                </td>
              </tr>
            ) : null}
            {canShowPolkiGrid && polkiSuccess && polkiRowsAllLength === 0 ? (
              <tr>
                <td
                  colSpan={POLKI_TABLE_COLS}
                  className="px-3 py-8 text-center text-xs text-muted-foreground"
                >
                  Нет позиций для возврата за период / по заказу.
                </td>
              </tr>
            ) : null}
            {canShowPolkiGrid && polkiSuccess && polkiRowsAllLength > 0
              ? polkiOrderGroups.map((g) => (
                  <Fragment key={g.orderId}>
                    <tr className="border-b border-teal-800/20 bg-teal-950/10 dark:bg-teal-950/25">
                      <td
                        colSpan={POLKI_TABLE_COLS}
                        className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-teal-900 dark:text-teal-100/90"
                      >
                        Заказ {g.orderNumber} · {g.orderDate || "—"}
                      </td>
                    </tr>
                    {g.rows.map((r) => {
                      const pk = r.pair_key;
                      const totalRaw = polkiTotalQty[pk] ?? "";
                      const totalQ = Number.parseFloat(totalRaw.replace(",", "."));
                      const totalOver =
                        Boolean(totalRaw.trim()) &&
                        Number.isFinite(totalQ) &&
                        totalQ > r.max_paid + r.max_bonus;
                      const defer = Boolean(polkiBonusToBalance[pk]);
                      const { effPaid, effBonus } = polkiSplitTotal(
                        r,
                        Number.isFinite(totalQ) ? totalQ : 0
                      );
                      const physBonus = defer ? 0 : effBonus;
                      const volU =
                        r.volume_m3 != null ? Number.parseFloat(String(r.volume_m3)) : NaN;
                      const lineVol =
                        Number.isFinite(volU) && effPaid + physBonus > 0
                          ? (effPaid + physBonus) * volU
                          : 0;
                      const maxTot = r.max_paid + r.max_bonus;
                      const suggestedBonusCash = effBonus * r.unit_price_bonus;
                      const maxCashDefer =
                        r.max_bonus > 0 ? r.max_bonus * r.unit_price_bonus : 0;
                      const maxCashExtra =
                        r.max_bonus > 0
                          ? Math.max(0, (r.max_bonus - physBonus) * r.unit_price_bonus)
                          : 0;
                      const cashRaw = polkiBonusCash[pk] ?? "";
                      const cashParsed = parsePriceAmount(cashRaw);
                      const cashCap = defer ? maxCashDefer : maxCashExtra;
                      const debtLine =
                        defer && effBonus > 0
                          ? Math.max(0, suggestedBonusCash - Math.min(cashParsed, cashCap))
                          : 0;
                      return (
                        <tr
                          key={pk}
                          className="border-b border-border/80 last:border-0 hover:bg-muted/25"
                        >
                          <td className="px-2 py-1.5 align-top font-mono text-[11px] text-muted-foreground">
                            #{r.order_id}
                          </td>
                          <td className="px-2 py-1.5 align-top">
                            <div className="font-medium leading-snug text-foreground text-[13px]">
                              {r.name}
                            </div>
                            <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                              {[r.sku, r.unit].filter(Boolean).join(" · ")}
                            </div>
                          </td>
                          <td className="px-2 py-1.5 align-top">
                            <div className="mb-1 text-[11px] text-muted-foreground">
                              Продажа: <span className="font-medium text-foreground">{g.orderDate}</span>
                              {r.unit_price_paid > 0 ? (
                                <span className="ml-1 tabular-nums">
                                  · {formatNumberGrouped(r.unit_price_paid, { maxFractionDigits: 2 })}
                                </span>
                              ) : null}
                            </div>
                            <div className="text-[10px] text-muted-foreground">
                              макс всего {formatNumberGrouped(maxTot, { maxFractionDigits: 3 })} шт (опл.{" "}
                              {formatNumberGrouped(r.max_paid, { maxFractionDigits: 3 })} + бон.{" "}
                              {formatNumberGrouped(r.max_bonus, { maxFractionDigits: 3 })})
                            </div>
                            <Input
                              type="number"
                              min={0}
                              step="any"
                              placeholder="0"
                              data-testid="oc-polki-total-qty"
                              data-oc-product-id={r.product_id}
                              className={cn(
                                "mt-1 h-8 w-full max-w-[7rem] tabular-nums text-sm",
                                totalOver && "border-destructive"
                              )}
                              value={totalRaw}
                              onChange={(e) =>
                                setPolkiTotalQty((prev) => ({ ...prev, [pk]: e.target.value }))
                              }
                              onBlur={() => {
                                if (!totalRaw.trim()) return;
                                const n = Number.parseFloat(totalRaw.replace(",", "."));
                                if (!Number.isFinite(n) || n <= 0) return;
                                if (n > maxTot) {
                                  setPolkiTotalQty((prev) => ({
                                    ...prev,
                                    [pk]: formatQtyState(maxTot)
                                  }));
                                }
                              }}
                              disabled={mutationPending || maxTot <= 0}
                            />
                            {Number.isFinite(totalQ) && totalQ > 0 ? (
                              <p className="mt-1 text-[10px] leading-snug text-teal-800 dark:text-teal-200/90">
                                Авто: опл.{" "}
                                <span className="font-semibold tabular-nums">{effPaid}</span>
                                {" · "}
                                бон.{" "}
                                <span className="font-semibold tabular-nums">{effBonus}</span>
                                {defer ? (
                                  <span className="text-muted-foreground"> (бонус → баланс)</span>
                                ) : null}
                              </p>
                            ) : null}
                          </td>
                          <td className="px-2 py-1.5 align-top">
                            {r.max_bonus > 0 ? (
                              <>
                                <div className="font-medium leading-snug text-[13px] text-amber-700 dark:text-amber-400">
                                  {r.name} <span className="text-[10px] font-normal">(бонус)</span>
                                </div>
                                <div className="text-[10px] text-muted-foreground">
                                  макс {formatNumberGrouped(r.max_bonus, { maxFractionDigits: 3 })} шт
                                  {r.unit_price_bonus > 0 ? (
                                    <span className="ml-1 tabular-nums">
                                      · {formatNumberGrouped(r.unit_price_bonus, { maxFractionDigits: 2 })}
                                    </span>
                                  ) : null}
                                </div>
                                <label className="mt-2 flex cursor-pointer items-start gap-2 text-[11px] leading-tight text-foreground">
                                  <input
                                    type="checkbox"
                                    className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-input"
                                    checked={defer}
                                    disabled={mutationPending}
                                    onChange={(e) => {
                                      const on = e.target.checked;
                                      setPolkiBonusToBalance((prev) => ({ ...prev, [pk]: on }));
                                      if (on) {
                                        const t = Number.parseFloat(
                                          (polkiTotalQty[pk] ?? "").replace(",", ".")
                                        );
                                        const sp = polkiSplitTotal(
                                          r,
                                          Number.isFinite(t) ? t : 0
                                        );
                                        const sug = sp.effBonus * r.unit_price_bonus;
                                        if (sug > 0) {
                                          setPolkiBonusCash((prev) => ({
                                            ...prev,
                                            [pk]: String(Math.round(sug))
                                          }));
                                        }
                                      }
                                    }}
                                  />
                                  <span>
                                    Бонус не на склад (сумма на баланс / без возврата бонуса)
                                  </span>
                                </label>
                              </>
                            ) : (
                              <p className="text-[11px] text-muted-foreground">Нет бонуса по строке</p>
                            )}
                            <div className="mt-2 border-t border-border/60 pt-2">
                              <p className="mb-0.5 text-[10px] font-medium text-muted-foreground">
                                {defer
                                  ? `Сумма на баланс (компенсация бонуса), макс ${formatNumberGrouped(maxCashDefer, { maxFractionDigits: 0 })}`
                                  : `Доп. вместо бонуса (баланс), макс ≈ ${formatNumberGrouped(maxCashExtra, { maxFractionDigits: 0 })}`}
                              </p>
                              <Input
                                type="number"
                                min={0}
                                step="any"
                                placeholder="0"
                                className="h-8 w-full max-w-[8rem] tabular-nums text-sm"
                                value={cashRaw}
                                onChange={(e) =>
                                  setPolkiBonusCash((prev) => ({ ...prev, [pk]: e.target.value }))
                                }
                                disabled={mutationPending || r.max_bonus <= 0}
                              />
                              {defer && effBonus > 0 && suggestedBonusCash > 0 ? (
                                <p className="mt-1 text-[10px] text-muted-foreground">
                                  По бонусу: {effBonus} шт ≈{" "}
                                  {formatNumberGrouped(suggestedBonusCash, { maxFractionDigits: 0 })}{" "}
                                  сум
                                </p>
                              ) : null}
                              {debtLine > 0 ? (
                                <p className="mt-1 text-[10px] font-medium text-amber-800 dark:text-amber-200">
                                  К долгу (оценка):{" "}
                                  {formatNumberGrouped(debtLine, { maxFractionDigits: 0 })} — учтите
                                  вручную, если компенсация не внесена.
                                </p>
                              ) : null}
                            </div>
                          </td>
                          <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground align-middle text-[13px]">
                            {lineVol > 0
                              ? formatNumberGrouped(lineVol, { maxFractionDigits: 4 })
                              : "0"}
                          </td>
                        </tr>
                      );
                    })}
                  </Fragment>
                ))
              : null}
            {canShowPolkiGrid &&
            polkiSuccess &&
            polkiRowsAllLength > 0 &&
            flatRowCount === 0 ? (
              <tr>
                <td
                  colSpan={POLKI_TABLE_COLS}
                  className="px-3 py-8 text-center text-xs text-muted-foreground"
                >
                  По поиску ничего не найдено.
                </td>
              </tr>
            ) : null}
          </tbody>
          {canShowPolkiGrid && polkiSuccess && !polkiLoading && flatRowCount > 0 ? (
            <tfoot>
              <tr className="border-t-2 border-border bg-muted/40 font-semibold">
                <td className="px-2 py-2 text-foreground text-sm" colSpan={3}>
                  Итого (на склад, шт · m³ · сумма на баланс)
                </td>
                <td className="px-2 py-2 text-center tabular-nums text-foreground text-sm">
                  {formatNumberGrouped(polkiTotalReturnQtySum, { maxFractionDigits: 3 })}
                </td>
                <td className="px-2 py-2 text-right tabular-nums text-foreground text-sm">
                  {formatNumberGrouped(polkiVolumeM3, { maxFractionDigits: 4 })}
                  <span className="ml-3 inline-block tabular-nums text-teal-800 dark:text-teal-200">
                    {polkiEstimatedSum > 0
                      ? formatNumberGrouped(polkiEstimatedSum, { maxFractionDigits: 0 })
                      : "—"}
                  </span>
                </td>
              </tr>
              {polkiDebtHintSum > 0 ? (
                <tr className="border-t border-border bg-amber-500/10 text-[11px] text-amber-950 dark:text-amber-100">
                  <td colSpan={POLKI_TABLE_COLS} className="px-2 py-1.5 font-medium">
                    Суммарно «к долгу» по бонусу (компенсация меньше расчёта):{" "}
                    <span className="tabular-nums">
                      {formatNumberGrouped(polkiDebtHintSum, { maxFractionDigits: 0 })}
                    </span>{" "}
                    — оформите в карточке клиента / оплатах при необходимости.
                  </td>
                </tr>
              ) : null}
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

type PolkiOrderPickRow = {
  id: number;
  number: string;
  status: string;
  created_at: string;
  order_type?: string | null;
  qty?: string;
  total_sum?: string;
  bonus_qty?: string;
  bonus_sum?: string;
  warehouse_name?: string | null;
};

/** Polki «по заказу»: faqat sotuv zakazi; bekor va VR-ko‘zgu hujjatlari tanlanmaydi. */
function isPolkiShelfSourceOrder(o: PolkiOrderPickRow): boolean {
  if (o.status === "cancelled") return false;
  const t = (o.order_type ?? "order").trim();
  return t === "order";
}

/** Возврат с полки по заказу — только со статусом «доставлен». */
function isPolkiReturnByOrderPickable(o: PolkiOrderPickRow): boolean {
  if (!isPolkiShelfSourceOrder(o)) return false;
  return o.status.trim().toLowerCase() === "delivered";
}

function polkiOrderRowHasBonus(o: PolkiOrderPickRow): boolean {
  const bq = parseStockQty(o.bonus_qty);
  if (bq > 0) return true;
  return parsePriceAmount(o.bonus_sum ?? "0") > 0;
}

/** Polki sahifalarida klient: server qidiruv + dropdown (200 ta cheklovsiz). */
function PolkiClientSearchSelect({
  tenantSlug,
  value,
  onValueChange,
  disabled,
  placeholder,
  className,
  selectedLabel,
  "data-testid": testId,
  id: inputId
}: {
  tenantSlug: string | null;
  value: string;
  onValueChange: (id: string) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  selectedLabel: string | null;
  "data-testid"?: string;
  id?: string;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [draftSearch, setDraftSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 320 });

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(draftSearch), 300);
    return () => clearTimeout(t);
  }, [draftSearch]);

  useEffect(() => {
    if (!open) {
      setDraftSearch("");
      setDebouncedSearch("");
    }
  }, [open]);

  const pickerQ = useQuery({
    queryKey: ["clients", tenantSlug, "polki-client-search", debouncedSearch.trim()],
    enabled: Boolean(tenantSlug) && open,
    staleTime: STALE.list,
    queryFn: async () => {
      const sp = new URLSearchParams({ page: "1", limit: "50", is_active: "true" });
      const q = debouncedSearch.trim();
      if (q) sp.set("search", q);
      const { data } = await api.get<{ data: ClientRow[] }>(
        `/api/${tenantSlug}/clients?${sp.toString()}`
      );
      return data.data ?? [];
    }
  });

  const updatePosition = useCallback(() => {
    const t = triggerRef.current;
    if (!t) return;
    const r = t.getBoundingClientRect();
    const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
    const w = Math.min(Math.max(r.width, 280), vw - 16);
    let left = r.left;
    if (left + w > vw - 8) left = Math.max(8, vw - w - 8);
    setCoords({ top: r.bottom + 6, left, width: w });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(updatePosition) : null;
    if (ro && triggerRef.current) ro.observe(triggerRef.current);
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    return () => {
      ro?.disconnect();
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => searchInputRef.current?.focus(), 50);
    return () => window.clearTimeout(id);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const node = e.target as Node;
      if (triggerRef.current?.contains(node)) return;
      if (popRef.current?.contains(node)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const rows = pickerQ.data ?? [];
  const valueNum = value.trim() ? Number.parseInt(value.trim(), 10) : NaN;
  const showPlaceholder = !value.trim() || !selectedLabel;

  const popover = (
    <div
      ref={popRef}
      id={listId}
      role="listbox"
      aria-label="Клиенты"
      className="fixed z-[500] flex max-h-[min(55vh,400px)] flex-col overflow-hidden rounded-lg border border-border bg-card text-card-foreground shadow-lg ring-1 ring-black/5 dark:ring-white/10"
      style={{ top: coords.top, left: coords.left, width: coords.width }}
    >
      <div className="relative shrink-0 border-b border-border/60 px-3 py-2">
        <Search
          className="pointer-events-none absolute left-5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          ref={searchInputRef}
          className="h-9 border-input bg-background pl-9 text-sm shadow-none"
          placeholder="Имя, телефон, ИНН…"
          value={draftSearch}
          onChange={(e) => setDraftSearch(e.target.value)}
          onMouseDown={(e) => e.stopPropagation()}
          aria-label="Поиск клиента"
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {pickerQ.isLoading ? (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground">Загрузка…</p>
        ) : rows.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground">
            {debouncedSearch.trim() ? "Ничего не найдено" : "Нет клиентов"}
          </p>
        ) : (
          <ul className="divide-y divide-border/60">
            {rows.map((c) => {
              const selected = Number.isFinite(valueNum) && c.id === valueNum;
              const subtitle = [c.phone, c.inn].filter(Boolean).join(" · ") || null;
              return (
                <li key={c.id} role="option" aria-selected={selected}>
                  <button
                    type="button"
                    className={cn(
                      "flex w-full items-start gap-2 px-3 py-2.5 text-left text-sm transition-colors hover:bg-muted/50",
                      selected && "bg-primary/[0.06]"
                    )}
                    onClick={() => {
                      onValueChange(String(c.id));
                      setOpen(false);
                    }}
                  >
                    {selected ? (
                      <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                    ) : (
                      <span className="mt-0.5 size-4 shrink-0" aria-hidden />
                    )}
                    <span className="min-w-0 flex-1">
                      {subtitle ? (
                        <span className="block font-mono text-[10px] font-medium leading-tight text-muted-foreground">
                          {subtitle}
                        </span>
                      ) : null}
                      <span className="block leading-snug">{c.name}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <div className="shrink-0 border-t border-border/60 bg-muted/20 px-3 py-1.5 text-[10px] text-muted-foreground">
        Показано: <span className="font-medium tabular-nums text-foreground/80">{rows.length}</span>
        {debouncedSearch.trim() ? " (поиск)" : ""} · до 50 строк
      </div>
    </div>
  );

  return (
    <div className={cn("min-w-0", className)}>
      <button
        ref={triggerRef}
        id={inputId}
        type="button"
        data-testid={testId}
        disabled={disabled}
        className={cn(
          fieldClass,
          "flex items-center justify-between gap-2 text-left",
          !disabled && "cursor-pointer hover:bg-muted/30"
        )}
        aria-expanded={open}
        aria-controls={listId}
        aria-haspopup="listbox"
        onClick={() => !disabled && setOpen((v) => !v)}
      >
        <span className={cn("min-w-0 flex-1 truncate", showPlaceholder && "text-muted-foreground")}>
          {showPlaceholder ? (placeholder ?? "Выберите клиента") : selectedLabel}
        </span>
        <ChevronDown
          className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}
          aria-hidden
        />
      </button>
      {mounted && open && tenantSlug ? createPortal(popover, document.body) : null}
    </div>
  );
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
  const polkiRangeAnchorRef = useRef<HTMLElement | null>(null);
  const [polkiRangeOpen, setPolkiRangeOpen] = useState(false);
  const [polkiOrderIds, setPolkiOrderIds] = useState<number[]>([]);
  const [polkiTotalQty, setPolkiTotalQty] = useState<Record<string, string>>({});
  const [polkiBonusToBalance, setPolkiBonusToBalance] = useState<Record<string, boolean>>({});
  const [polkiBonusCash, setPolkiBonusCash] = useState<Record<string, string>>({});
  const [refusalReasonRefPolki, setRefusalReasonRefPolki] = useState("");
  const [polkiHeaderDate, setPolkiHeaderDate] = useState("");
  const [polkiTradeDirection, setPolkiTradeDirection] = useState("");
  const [polkiSkidkaType, setPolkiSkidkaType] = useState("none");
  const [orderIsConsignment, setOrderIsConsignment] = useState(false);
  const [consignmentDueDate, setConsignmentDueDate] = useState("");
  const [consignmentDueOpen, setConsignmentDueOpen] = useState(false);
  const consignmentDueAnchorRef = useRef<HTMLButtonElement>(null);
  /** Savdo zakazi uchun profil `payment_method_entries[].id` yoki erkin matn (backend `payment_method_ref`) */
  const [paymentMethodRef, setPaymentMethodRef] = useState("");

  const polkiOrderIdsSortedKey = useMemo(
    () => [...polkiOrderIds].sort((a, b) => a - b).join(","),
    [polkiOrderIds]
  );

  useEffect(() => {
    setQtyByProductId({});
    setBlockByProductId({});
  }, [warehouseId]);

  useEffect(() => {
    if (!isPolkiSheet) return;
    setQtyByProductId({});
    setBlockByProductId({});
    setPolkiTotalQty({});
    setPolkiBonusToBalance({});
    setPolkiBonusCash({});
  }, [isPolkiSheet, polkiDateFrom, polkiDateTo, clientId]);

  useEffect(() => {
    if (!orderIsConsignment) setConsignmentDueOpen(false);
  }, [orderIsConsignment]);

  type OrderCreateContextResponse = {
    clients: ClientRow[];
    products: ProductRow[];
    warehouses: { id: number; name: string; stock_purpose?: string; is_active?: boolean }[];
    users: { id: number; login: string; name: string; role: string }[];
    price_types: string[];
    expeditors: Array<{ id: number; fio: string; login: string; is_active: boolean }>;
    settings_profile: {
      references?: {
        request_type_entries?: unknown;
        order_note_entries?: unknown;
        refusal_reason_entries?: unknown;
        payment_method_entries?: { id: string; name: string; active?: boolean }[];
      };
    };
    product_categories: { id: number; name: string }[];
  };

  const createCtxQ = useQuery({
    queryKey: ["orders", "create-context", tenantSlug],
    enabled: Boolean(tenantSlug),
    staleTime: STALE.list,
    queryFn: async () => {
      const { data } = await api.get<OrderCreateContextResponse>(
        `/api/${tenantSlug}/orders/create-context`
      );
      return data;
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

  const clientIdNum = clientId.trim() ? Number.parseInt(clientId.trim(), 10) : NaN;

  type ClientReturnDataPolki = {
    polki_scope?: "period" | "order";
    orders?: Array<{
      id: number;
      number: string;
      created_at: string;
    }>;
    items: Array<{
      product_id: number;
      sku: string;
      name: string;
      unit: string;
      qty: string;
      price: string;
      is_bonus: boolean;
      order_id?: number;
      order_number?: string;
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
      const { data: body } = await api.get<{ data: PolkiOrderPickRow[] }>(
        `/api/${tenantSlug}/orders?page=1&limit=100&client_id=${clientIdNum}`
      );
      return body.data ?? [];
    }
  });

  const polkiOrdersForPick = useMemo(
    () => (polkiOrdersPickQ.data ?? []).filter(isPolkiReturnByOrderPickable),
    [polkiOrdersPickQ.data]
  );

  const polkiOrdersPickRawCount = polkiOrdersPickQ.data?.length ?? 0;

  const polkiOrderPickHalfLists = useMemo((): [PolkiOrderPickRow[], PolkiOrderPickRow[]] => {
    const list = polkiOrdersForPick;
    const mid = Math.ceil(list.length / 2);
    return [list.slice(0, mid), list.slice(mid)];
  }, [polkiOrdersForPick]);

  useEffect(() => {
    if (!isPolkiByOrder) return;
    const valid = new Set(polkiOrdersForPick.map((o) => o.id));
    setPolkiOrderIds((prev) => {
      const next = prev.filter((id) => valid.has(id));
      return next.length === prev.length ? prev : next;
    });
  }, [isPolkiByOrder, polkiOrdersForPick]);

  const togglePolkiOrderPick = (id: number, checked: boolean) => {
    setPolkiOrderIds((prev) => {
      if (checked) return prev.includes(id) ? prev : [...prev, id];
      return prev.filter((x) => x !== id);
    });
  };

  const togglePolkiOrdersSelectAll = (checked: boolean) => {
    if (checked) setPolkiOrderIds(polkiOrdersForPick.map((o) => o.id));
    else setPolkiOrderIds([]);
  };

  useEffect(() => {
    if (!isPolkiSheet) return;
    if (isPolkiFree) {
      const d = polkiDateTo || polkiDateFrom;
      if (d) setPolkiHeaderDate(d);
      else setPolkiHeaderDate(new Date().toISOString().slice(0, 10));
      return;
    }
    if (isPolkiByOrder && polkiOrderIds.length > 0) {
      const orders = polkiOrdersForPick;
      let best = "";
      for (const id of polkiOrderIds) {
        const o = orders.find((x) => x.id === id);
        const ca = o?.created_at ? String(o.created_at).slice(0, 10) : "";
        if (ca && (!best || ca > best)) best = ca;
      }
      if (best) {
        setPolkiHeaderDate(best);
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
    polkiOrderIds,
    polkiOrdersForPick
  ]);

  const polkiContextQ = useQuery({
    queryKey: [
      "order-create-polki-context",
      tenantSlug,
      clientIdNum,
      polkiDateFrom,
      polkiDateTo,
      polkiOrderIdsSortedKey,
      isPolkiFree,
      isPolkiByOrder
    ],
    enabled: Boolean(
      tenantSlug &&
        isPolkiSheet &&
        Number.isFinite(clientIdNum) &&
        clientIdNum > 0 &&
        (isPolkiFree || (isPolkiByOrder && polkiOrderIds.length > 0))
    ),
    staleTime: STALE.detail,
    queryFn: async () => {
      const params = new URLSearchParams({ client_id: String(clientIdNum) });
      if (isPolkiFree) {
        if (polkiDateFrom) params.set("date_from", polkiDateFrom);
        if (polkiDateTo) params.set("date_to", polkiDateTo);
      } else if (polkiOrderIds.length > 1) {
        params.set("order_ids", [...polkiOrderIds].sort((a, b) => a - b).join(","));
      } else if (polkiOrderIds.length === 1) {
        params.set("order_id", String(polkiOrderIds[0]));
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
        name: string;
        phone: string | null;
        account_balance: string;
        credit_limit: string;
        open_orders_total: string;
      }>(`/api/${tenantSlug}/clients/${clientIdNum}`);
      return data;
    }
  });

  const ctxProfile = createCtxQ.data?.settings_profile;

  const requiresAgentAndPayment = !isPolkiSheet && normalizedType === "order";

  const paymentMethodSelectOptions = useMemo(() => {
    const raw = ctxProfile?.references?.payment_method_entries;
    if (!Array.isArray(raw)) return [];
    const out: { id: string; name: string }[] = [];
    for (const e of raw) {
      if (!e || typeof e !== "object") continue;
      const row = e as { id?: unknown; name?: unknown; active?: boolean };
      const id =
        typeof row.id === "string"
          ? row.id.trim()
          : typeof row.id === "number" && Number.isFinite(row.id)
            ? String(row.id)
            : "";
      const name = typeof row.name === "string" ? row.name.trim() : "";
      if (!id || !name || row.active === false) continue;
      out.push({ id, name });
    }
    return out;
  }, [ctxProfile]);

  const hasPaymentMethodCatalog = paymentMethodSelectOptions.length > 0;

  const requestTypeOptions = useMemo(
    () => activeRefSelectOptions(ctxProfile?.references?.request_type_entries),
    [ctxProfile]
  );
  const orderNoteOptions = useMemo(
    () => activeRefSelectOptions(ctxProfile?.references?.order_note_entries),
    [ctxProfile]
  );
  const refusalReasonPolkiOptions = useMemo(
    () => activeRefSelectOptions(ctxProfile?.references?.refusal_reason_entries),
    [ctxProfile]
  );

  const clients = createCtxQ.data?.clients ?? [];
  const polkiSelectedClientLabel = useMemo(() => {
    if (!clientId.trim()) return null;
    const id = Number.parseInt(clientId.trim(), 10);
    if (!Number.isFinite(id) || id < 1) return null;
    const fromList = clients.find((c) => c.id === id);
    if (fromList) {
      return `${fromList.name}${fromList.phone ? ` · ${fromList.phone}` : ""}`;
    }
    if (clientSummaryQ.isFetching) return "Загрузка…";
    const d = clientSummaryQ.data;
    if (d?.name) {
      return `${d.name}${d.phone ? ` · ${d.phone}` : ""}`;
    }
    return `Клиент #${id}`;
  }, [clientId, clients, clientSummaryQ.data, clientSummaryQ.isFetching]);
  const products = createCtxQ.data?.products ?? [];
  const warehouses = createCtxQ.data?.warehouses ?? [];
  const users = createCtxQ.data?.users ?? [];
  const categories = createCtxQ.data?.product_categories ?? [];

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

  const polkiRowsAll = useMemo((): PolkiPairRowModel[] => {
    if (!isPolkiSheet || !polkiContextQ.data?.items?.length) return [];
    return buildPolkiPairRows(polkiContextQ.data.items as PolkiClientItem[], products);
  }, [isPolkiSheet, polkiContextQ.data?.items, products]);

  const polkiLineKeySet = useMemo(
    () => new Set(polkiRowsAll.map((r) => r.pair_key)),
    [polkiRowsAll]
  );
  useEffect(() => {
    if (!isPolkiSheet) return;
    const pruneRecord = <T,>(prev: Record<string, T>): Record<string, T> => {
      const next = { ...prev };
      for (const k of Object.keys(next)) {
        if (!polkiLineKeySet.has(k)) delete next[k];
      }
      return next;
    };
    setPolkiTotalQty((p) => pruneRecord(p));
    setPolkiBonusCash((p) => pruneRecord(p));
    setPolkiBonusToBalance((p) => pruneRecord(p));
  }, [isPolkiSheet, polkiLineKeySet]);

  const polkiOrderDateById = useMemo(() => {
    const m = new Map<number, string>();
    for (const o of polkiContextQ.data?.orders ?? []) {
      const d = o.created_at ? String(o.created_at).slice(0, 10) : "";
      m.set(o.id, d);
    }
    for (const o of polkiOrdersForPick) {
      if (m.has(o.id)) continue;
      const d = o.created_at ? String(o.created_at).slice(0, 10) : "";
      if (d) m.set(o.id, d);
    }
    return m;
  }, [polkiContextQ.data?.orders, polkiOrdersForPick]);

  const polkiRowsFiltered = useMemo((): PolkiPairRowModel[] => {
    if (!isPolkiSheet) return [];
    return polkiRowsAll.filter((r) => {
      if (selectedCategoryNum != null && r.category_id !== selectedCategoryNum) return false;
      return true;
    });
  }, [isPolkiSheet, polkiRowsAll, selectedCategoryNum]);

  const polkiDisplayRows = useMemo((): PolkiPairRowModel[] => {
    if (!isPolkiSheet) return [];
    const n = productSearch.trim().toLowerCase();
    if (!n) return polkiRowsFiltered;
    return polkiRowsFiltered.filter(
      (r) => r.name.toLowerCase().includes(n) || (r.sku ?? "").toLowerCase().includes(n)
    );
  }, [isPolkiSheet, polkiRowsFiltered, productSearch]);

  const polkiOrderGroups = useMemo((): PolkiOrderGroup[] => {
    if (!isPolkiSheet) return [];
    const byOrder = new Map<number, PolkiPairRowModel[]>();
    for (const r of polkiDisplayRows) {
      const arr = byOrder.get(r.order_id) ?? [];
      arr.push(r);
      byOrder.set(r.order_id, arr);
    }
    return Array.from(byOrder.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([orderId, rows]) => ({
        orderId,
        orderNumber: rows[0]?.order_number ?? String(orderId),
        orderDate: polkiOrderDateById.get(orderId) ?? "",
        rows
      }));
  }, [isPolkiSheet, polkiDisplayRows, polkiOrderDateById]);

  const hasPolkiQtyOverMax = useMemo(() => {
    if (!isPolkiSheet) return false;
    for (const r of polkiRowsAll) {
      const pk = r.pair_key;
      const tr = polkiTotalQty[pk] ?? "";
      if (!tr.trim()) continue;
      const tq = Number.parseFloat(tr.replace(",", "."));
      if (Number.isFinite(tq) && tq > 0 && tq > r.max_paid + r.max_bonus) return true;
    }
    return false;
  }, [isPolkiSheet, polkiRowsAll, polkiTotalQty]);

  const hasPolkiBonusCashOverMax = useMemo(() => {
    if (!isPolkiSheet) return false;
    for (const r of polkiRowsAll) {
      if (r.max_bonus <= 0) continue;
      const pk = r.pair_key;
      const total = Number.parseFloat((polkiTotalQty[pk] ?? "").replace(",", "."));
      const { effPaid, effBonus } = polkiSplitTotal(r, Number.isFinite(total) ? total : 0);
      const defer = Boolean(polkiBonusToBalance[pk]);
      const bq = defer ? 0 : effBonus;
      const maxCash = defer
        ? r.max_bonus * r.unit_price_bonus
        : Math.max(0, (r.max_bonus - bq) * r.unit_price_bonus);
      const cash = parsePriceAmount(polkiBonusCash[pk] ?? "");
      if (cash > maxCash + 1e-6) return true;
    }
    return false;
  }, [isPolkiSheet, polkiRowsAll, polkiTotalQty, polkiBonusToBalance, polkiBonusCash]);

  const polkiTotalReturnQtySum = useMemo(() => {
    if (!isPolkiSheet) return 0;
    let s = 0;
    for (const r of polkiRowsAll) {
      const pk = r.pair_key;
      const total = Number.parseFloat((polkiTotalQty[pk] ?? "").replace(",", "."));
      const { effPaid, effBonus } = polkiSplitTotal(r, Number.isFinite(total) ? total : 0);
      const defer = Boolean(polkiBonusToBalance[pk]);
      const physBonus = defer ? 0 : effBonus;
      s += effPaid + physBonus;
    }
    return s;
  }, [isPolkiSheet, polkiRowsAll, polkiTotalQty, polkiBonusToBalance]);

  const polkiTotalBonusCashSum = useMemo(() => {
    if (!isPolkiSheet) return 0;
    let t = 0;
    for (const r of polkiRowsAll) {
      if (r.max_bonus <= 0) continue;
      const pk = r.pair_key;
      const total = Number.parseFloat((polkiTotalQty[pk] ?? "").replace(",", "."));
      const { effBonus } = polkiSplitTotal(r, Number.isFinite(total) ? total : 0);
      const defer = Boolean(polkiBonusToBalance[pk]);
      const bq = defer ? 0 : effBonus;
      const maxCash = defer
        ? r.max_bonus * r.unit_price_bonus
        : Math.max(0, (r.max_bonus - bq) * r.unit_price_bonus);
      const cash = parsePriceAmount(polkiBonusCash[pk] ?? "");
      t += Math.min(cash, maxCash);
    }
    return t;
  }, [isPolkiSheet, polkiRowsAll, polkiTotalQty, polkiBonusToBalance, polkiBonusCash]);

  const polkiDebtHintSum = useMemo(() => {
    if (!isPolkiSheet) return 0;
    let d = 0;
    for (const r of polkiRowsAll) {
      if (!polkiBonusToBalance[r.pair_key]) continue;
      const total = Number.parseFloat((polkiTotalQty[r.pair_key] ?? "").replace(",", "."));
      const { effBonus } = polkiSplitTotal(r, Number.isFinite(total) ? total : 0);
      if (effBonus <= 0) continue;
      const suggested = effBonus * r.unit_price_bonus;
      const maxC = r.max_bonus * r.unit_price_bonus;
      const cash = Math.min(parsePriceAmount(polkiBonusCash[r.pair_key] ?? ""), maxC);
      d += Math.max(0, suggested - cash);
    }
    return d;
  }, [isPolkiSheet, polkiRowsAll, polkiTotalQty, polkiBonusToBalance, polkiBonusCash]);

  const polkiSelectedLinesCount = useMemo(() => {
    if (!isPolkiSheet) return 0;
    let n = 0;
    for (const r of polkiRowsAll) {
      const pk = r.pair_key;
      const total = Number.parseFloat((polkiTotalQty[pk] ?? "").replace(",", "."));
      const { effPaid, effBonus } = polkiSplitTotal(r, Number.isFinite(total) ? total : 0);
      const defer = Boolean(polkiBonusToBalance[pk]);
      const bq = defer ? 0 : effBonus;
      const maxCash =
        r.max_bonus > 0
          ? defer
            ? r.max_bonus * r.unit_price_bonus
            : Math.max(0, (r.max_bonus - bq) * r.unit_price_bonus)
          : 0;
      const effCash = r.max_bonus > 0 ? Math.min(parsePriceAmount(polkiBonusCash[pk] ?? ""), maxCash) : 0;
      if (effPaid + bq + effCash > 0) n++;
    }
    return n;
  }, [isPolkiSheet, polkiRowsAll, polkiTotalQty, polkiBonusToBalance, polkiBonusCash]);

  const polkiEstimatedSum = useMemo(() => {
    if (!isPolkiSheet) return 0;
    let t = 0;
    for (const r of polkiRowsAll) {
      const pk = r.pair_key;
      const total = Number.parseFloat((polkiTotalQty[pk] ?? "").replace(",", "."));
      const { effPaid, effBonus } = polkiSplitTotal(r, Number.isFinite(total) ? total : 0);
      const defer = Boolean(polkiBonusToBalance[pk]);
      const bq = defer ? 0 : effBonus;
      const maxCash =
        r.max_bonus > 0
          ? defer
            ? r.max_bonus * r.unit_price_bonus
            : Math.max(0, (r.max_bonus - bq) * r.unit_price_bonus)
          : 0;
      const cash = r.max_bonus > 0 ? Math.min(parsePriceAmount(polkiBonusCash[pk] ?? ""), maxCash) : 0;
      t += effPaid * r.unit_price_paid;
      t += cash;
    }
    return t;
  }, [isPolkiSheet, polkiRowsAll, polkiTotalQty, polkiBonusToBalance, polkiBonusCash]);

  const polkiVolumeM3 = useMemo(() => {
    if (!isPolkiSheet) return 0;
    let v = 0;
    for (const r of polkiRowsAll) {
      const pk = r.pair_key;
      const total = Number.parseFloat((polkiTotalQty[pk] ?? "").replace(",", "."));
      const { effPaid, effBonus } = polkiSplitTotal(r, Number.isFinite(total) ? total : 0);
      const defer = Boolean(polkiBonusToBalance[pk]);
      const physBonus = defer ? 0 : effBonus;
      const vol = r.volume_m3 != null ? Number.parseFloat(String(r.volume_m3)) : NaN;
      if (Number.isFinite(vol) && effPaid + physBonus > 0) v += (effPaid + physBonus) * vol;
    }
    return v;
  }, [isPolkiSheet, polkiRowsAll, polkiTotalQty, polkiBonusToBalance]);

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
    createCtxQ.isPending;
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
        if (isPolkiByOrder && polkiOrderIds.length < 1) {
          throw new Error("polki_order");
        }
        const distinctOrderCount = new Set(polkiRowsAll.map((row) => row.order_id)).size;
        const usePeriodBatch =
          (isPolkiByOrder && polkiOrderIds.length > 1) ||
          (isPolkiFree && distinctOrderCount > 1);

        let sumPhysical = 0;
        const batchLines: {
          order_id: number;
          product_id: number;
          paid_qty: number;
          bonus_qty: number;
          bonus_cash: number;
        }[] = [];
        const periodMerge = new Map<number, { paid: number; bonus: number; cash: number }>();

        for (const r of polkiRowsAll) {
          const pk = r.pair_key;
          const totalParsed = Number.parseFloat((polkiTotalQty[pk] ?? "").replace(",", "."));
          const { effPaid, effBonus } = polkiSplitTotal(
            r,
            Number.isFinite(totalParsed) ? totalParsed : 0
          );
          const defer = Boolean(polkiBonusToBalance[pk]);
          const pq = effPaid;
          const bq = defer ? 0 : effBonus;
          let cash = parsePriceAmount(polkiBonusCash[pk] ?? "");
          const maxCash =
            r.max_bonus > 0
              ? defer
                ? r.max_bonus * r.unit_price_bonus
                : Math.max(0, (r.max_bonus - bq) * r.unit_price_bonus)
              : 0;
          if (r.max_bonus <= 0) cash = 0;
          else cash = Math.min(cash, maxCash);

          if (pq + bq + cash <= 0) continue;
          sumPhysical += pq + bq;
          if (usePeriodBatch) {
            const oid = r.order_id;
            if (!oid || oid < 1) throw new Error("polki_missing_order");
            batchLines.push({
              order_id: oid,
              product_id: r.product_id,
              paid_qty: pq,
              bonus_qty: bq,
              bonus_cash: cash
            });
          } else {
            const cur = periodMerge.get(r.product_id) ?? { paid: 0, bonus: 0, cash: 0 };
            cur.paid += pq;
            cur.bonus += bq;
            cur.cash += cash;
            periodMerge.set(r.product_id, cur);
          }
        }
        if (sumPhysical > MAX_POLKI_RETURN_QTY) throw new Error("polki_too_many");
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
            refEntryLabelByStored(ctxProfile?.references?.order_note_entries, orderNotePreset) ??
            orderNotePreset;
          noteParts.push(presetLabel);
        }
        if (orderComment.trim()) noteParts.push(orderComment.trim());
        const noteJoined = noteParts.join("\n").trim();

        if (usePeriodBatch) {
          if (batchLines.length === 0) throw new Error("nolines");
          const body: Record<string, unknown> = {
            client_id: cid,
            warehouse_id: wid,
            lines: batchLines
          };
          if (noteJoined) body.note = noteJoined;
          if (refusalReasonRefPolki.trim()) body.refusal_reason_ref = refusalReasonRefPolki.trim();
          await api.post(`/api/${tenantSlug}/returns/period-batch`, body);
          return;
        }

        const lines = Array.from(periodMerge.entries())
          .map(([product_id, v]) => ({
            product_id,
            paid_qty: v.paid,
            bonus_qty: v.bonus,
            bonus_cash: v.cash
          }))
          .filter((l) => l.paid_qty + l.bonus_qty + l.bonus_cash > 0);
        if (lines.length === 0) throw new Error("nolines");

        const body: Record<string, unknown> = {
          client_id: cid,
          warehouse_id: wid,
          lines
        };
        if (isPolkiFree) {
          if (polkiDateFrom) body.date_from = polkiDateFrom;
          if (polkiDateTo) body.date_to = polkiDateTo;
        } else if (polkiOrderIds.length === 1) {
          body.order_id = polkiOrderIds[0];
        }
        if (noteJoined) body.note = noteJoined;
        if (refusalReasonRefPolki.trim()) body.refusal_reason_ref = refusalReasonRefPolki.trim();
        await api.post(`/api/${tenantSlug}/returns/period`, body);
        return;
      }

      const cid = Number.parseInt(clientId, 10);
      if (!Number.isFinite(cid) || cid < 1) throw new Error("client");

      const wid = Number.parseInt(warehouseId, 10);
      if (!warehouseId.trim() || !Number.isFinite(wid) || wid < 1) throw new Error("warehouse");

      const validatedOrderType =
        orderType && (ORDER_TYPE_VALUES as readonly string[]).includes(orderType) ? orderType : "order";

      const agentParsed = agentId.trim() ? Number.parseInt(agentId, 10) : NaN;
      const agent_id =
        Number.isFinite(agentParsed) && agentParsed > 0 ? agentParsed : null;

      if (validatedOrderType === "order") {
        if (agent_id == null) throw new Error("agent");
        const pm = paymentMethodRef.trim().slice(0, 64);
        if (!pm) throw new Error("payment_method");
      }

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

      const freeComment = orderComment.trim();
      const presetStored = orderNotePreset.trim();
      let commentOut: string | null = freeComment || null;
      if (presetStored) {
        const presetLabel =
          refEntryLabelByStored(ctxProfile?.references?.order_note_entries, presetStored) ??
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
      if (validatedOrderType === "order" && orderIsConsignment) {
        body.is_consignment = true;
        const due = consignmentDueDate.trim();
        if (due) body.consignment_due_date = due;
      }
      const expRaw = expeditorUserId.trim();
      if (expRaw === "__none__") body.expeditor_user_id = null;
      else if (expRaw !== "") {
        const eid = Number.parseInt(expRaw, 10);
        if (Number.isFinite(eid) && eid > 0) body.expeditor_user_id = eid;
      }
      if (validatedOrderType === "order") {
        body.payment_method_ref = paymentMethodRef.trim().slice(0, 64);
      }

      await api.post(`/api/${tenantSlug}/orders`, body);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["orders", tenantSlug] });
      void qc.invalidateQueries({ queryKey: ["orders", "create-context", tenantSlug] });
      if (isPolkiSheet) {
        void qc.invalidateQueries({ queryKey: ["returns", tenantSlug] });
        void qc.invalidateQueries({ queryKey: ["returns-client-data", tenantSlug] });
      }
      setRequestTypeRef("");
      setOrderNotePreset("");
      setRefSelectKey((k) => k + 1);
      setOrderIsConsignment(false);
      setConsignmentDueDate("");
      setConsignmentDueOpen(false);
      setPaymentMethodRef("");
      onCreated();
    },
    onError: (e: Error) => {
      if (isPolkiSheet) {
        if (e.message === "warehouse") {
          setLocalError("Выберите склад возврата.");
          return;
        }
        if (e.message === "client") {
          setLocalError("Выберите клиента.");
          return;
        }
        if (e.message === "polki_order") {
          setLocalError(
            "Отметьте хотя бы один заказ со статусом «Доставлен» (доступны только такие заказы)."
          );
          return;
        }
        if (e.message === "polki_missing_order") {
          setLocalError("Для строки не указан заказ — обновите страницу.");
          return;
        }
        if (e.message === "polki_qty_over") {
          setLocalError("Количество возврата не больше проданного.");
          return;
        }
        if (e.message === "polki_too_many") {
          setLocalError(
            `В одном документе не более ${MAX_POLKI_RETURN_QTY} шт к возврату на склад.`
          );
          return;
        }
        if (e.message === "nolines") {
          setLocalError("Укажите хотя бы одну позицию с количеством или компенсацией бонуса.");
          return;
        }
        if (e.message === "qty") {
          setLocalError("Во всех строках количество должно быть положительным.");
          return;
        }
        if (e.message === "qty_over_stock") {
          setLocalError("Количество не больше остатка по каждой позиции.");
          return;
        }
      }
      if (e.message === "warehouse") {
        setLocalError("Omborni tanlash shart.");
        return;
      }
      if (e.message === "agent") {
        setLocalError("Savdo zakazi uchun agentni tanlang.");
        return;
      }
      if (e.message === "payment_method") {
        setLocalError("To‘lov usulini tanlang yoki kiriting.");
        return;
      }
      if (e.message === "client") {
        setLocalError("Klientni tanlang.");
        return;
      }
      if (e.message === "polki_order") {
        setLocalError("«Zakaz bo‘yicha» rejimida kamida bitta zakazni tanlang.");
        return;
      }
      if (e.message === "polki_missing_order") {
        setLocalError("Qator uchun zakaz identifikatori yo‘q — qayta yuklang.");
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
        message?: string;
        product_id?: number;
        credit_limit?: string;
        outstanding?: string;
        order_total?: string;
        details?: unknown;
      }>;
      const code = ax.response?.data?.error;
      const d = ax.response?.data;
      if (code === "DatabaseSchemaMismatch") {
        const msg = d?.message?.trim();
        setLocalError(
          msg ||
            "Bazada kerakli ustunlar yo‘q (migratsiya qo‘llanmagan). Backend papkasida: npm run db:deploy"
        );
        return;
      }
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
      if (code === "OrderRequiresAgent") {
        setLocalError("Savdo zakazi uchun agent majburiy.");
        return;
      }
      if (code === "OrderRequiresWarehouse") {
        setLocalError("Savdo zakazi uchun ombor majburiy.");
        return;
      }
      if (code === "OrderRequiresPaymentMethod") {
        setLocalError("To‘lov usuli majburiy.");
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
      if (code === "BonusCashExceeds") {
        setLocalError(
          "Bonus o‘rniga qaytariladigan naqd summa qolgan bonus qiymatidan oshmasin (dona + summa birgalikda hisoblanadi)."
        );
        return;
      }
      if (code === "DatabaseValidationError" && d?.message) {
        setLocalError(String(d.message).slice(0, 500));
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
      if (code === "ConsignmentRequiresAgent") {
        setLocalError("Konsignatsiya zakazi uchun agentni tanlang.");
        return;
      }
      if (code === "ConsignmentAgentDisabled") {
        setLocalError("Bu agent uchun konsignatsiya yoqilmagan (Пользователи → Консигнация).");
        return;
      }
      if (code === "ConsignmentLimitExceeded" && d) {
        setLocalError(
          `Konsignatsiya limiti yetmaydi. Limit: ${(d as { consignment_limit?: string }).consignment_limit ?? "—"}, ochiq qarz: ${(d as { outstanding?: string }).outstanding ?? "—"}, bu zakaz: ${(d as { order_total?: string }).order_total ?? "—"}.`
        );
        return;
      }
      if (code === "BadConsignmentDueDate") {
        setLocalError("Konsignatsiya muddatini tekshiring (YYYY-MM-DD yoki to‘liq sana).");
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
    (isPolkiFree || (isPolkiByOrder && polkiOrderIds.length > 0));

  const stockReadyForLines = isPolkiSheet
    ? !polkiContextQ.isLoading && !polkiContextQ.isError
    : !canPickProducts || (!stockQ.isLoading && !stockQ.isError);

  const canSubmit = isPolkiSheet
    ? Boolean(
        hasClient &&
          hasWarehouse &&
          polkiContextQ.isSuccess &&
          polkiSelectedLinesCount > 0 &&
          (polkiTotalReturnQtySum > 0 || polkiTotalBonusCashSum > 0) &&
          polkiTotalReturnQtySum <= MAX_POLKI_RETURN_QTY &&
          !hasPolkiQtyOverMax &&
          !hasPolkiBonusCashOverMax &&
          !mutation.isPending &&
          stockReadyForLines &&
          (isPolkiFree || (isPolkiByOrder && polkiOrderIds.length > 0))
      )
    : Boolean(
        hasClient &&
          hasWarehouse &&
          selectedItemsCount > 0 &&
          !mutation.isPending &&
          !loadingLists &&
          stockReadyForLines &&
          !hasQtyOverStock &&
          !hasMissingPriceForSelected &&
          (!requiresAgentAndPayment || (Boolean(agentId.trim()) && Boolean(paymentMethodRef.trim())))
      );

  /** Nega «Возврат» o‘chiq — foydalanuvchiga aniq sabab (rus.). */
  const polkiSubmitBlockedReason = useMemo((): string | null => {
    if (!isPolkiSheet || mutation.isPending) return null;
    if (!hasClient) return "Выберите клиента.";
    if (isPolkiByOrder && polkiOrderIds.length === 0) {
      return "В блоке «Заказы» отметьте хотя бы один доставленный заказ.";
    }
    if (!hasWarehouse) return "Выберите склад возврата (блок «Параметры возврата»).";
    if (polkiContextQ.isLoading) return "Загрузка состава возврата…";
    if (polkiContextQ.isError) {
      return "Не удалось загрузить состав. Проверьте клиента, заказы и сеть.";
    }
    if (!polkiContextQ.isSuccess) return "Ожидание данных для возврата…";
    if (polkiSelectedLinesCount === 0) {
      return "В «Состав заявки» введите количество к возврату или сумму компенсации бонуса хотя бы в одной строке.";
    }
    if (polkiTotalReturnQtySum <= 0 && polkiTotalBonusCashSum <= 0) {
      return "Суммарно к возврату 0: укажите шт в колонке «всего к возврату» и/или сумму в блоке бонуса.";
    }
    if (polkiTotalReturnQtySum > MAX_POLKI_RETURN_QTY) {
      return `Превышен лимит документа: не более ${MAX_POLKI_RETURN_QTY} шт на склад за раз (сейчас ${polkiTotalReturnQtySum}). Уменьшите количество или оформите несколько возвратов.`;
    }
    if (hasPolkiQtyOverMax) {
      return "В строке введено больше, чем разрешено («макс. всего» к возврату).";
    }
    if (hasPolkiBonusCashOverMax) {
      return "Сумма компенсации бонуса превышает допустимое значение для строки.";
    }
    if (!stockReadyForLines) return "Данные ещё не готовы…";
    return null;
  }, [
    isPolkiSheet,
    mutation.isPending,
    hasClient,
    isPolkiByOrder,
    polkiOrderIds.length,
    hasWarehouse,
    polkiContextQ.isLoading,
    polkiContextQ.isError,
    polkiContextQ.isSuccess,
    polkiSelectedLinesCount,
    polkiTotalReturnQtySum,
    polkiTotalBonusCashSum,
    hasPolkiQtyOverMax,
    hasPolkiBonusCashOverMax,
    stockReadyForLines
  ]);

  useEffect(() => {
    if (!hasClient) {
      setWarehouseId("");
      setAgentId("");
      setExpeditorUserId("");
      setPaymentMethodRef("");
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
    refusalReasonRefPolki,
    polkiOrderIdsSortedKey,
    paymentMethodRef
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
            ? isPolkiByOrder
              ? "Параметры и состав; по заказу — только доставленные заказы, можно выбрать несколько."
              : "Компактные параметры и таблица состава возврата за период."
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
                    ? "Сначала выберите клиента"
                    : isPolkiByOrder && polkiOrderIds.length === 0
                      ? "Отметьте хотя бы один доставленный заказ"
                      : !hasWarehouse
                        ? "Выберите склад возврата"
                        : polkiTotalReturnQtySum <= 0 && polkiTotalBonusCashSum <= 0
                          ? "Укажите количество к возврату или компенсацию бонуса"
                          : polkiTotalReturnQtySum > MAX_POLKI_RETURN_QTY
                            ? `Не более ${MAX_POLKI_RETURN_QTY} шт на склад в одном документе`
                            : hasPolkiBonusCashOverMax
                              ? "Сумма компенсации вместо бонуса превышает допустимое"
                              : hasPolkiQtyOverMax
                              ? "Количество не больше проданного"
                              : !stockReadyForLines
                                ? "Загрузка данных…"
                                : undefined
                  : !hasClient
                    ? "Avval klientni tanlang"
                    : !hasWarehouse
                      ? "Avval omborni tanlang"
                      : requiresAgentAndPayment && !agentId.trim()
                        ? "Agentni tanlang (savdo zakazi)"
                        : requiresAgentAndPayment && !paymentMethodRef.trim()
                          ? "To‘lov usulini tanlang"
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
                ? isPolkiSheet
                  ? "Оформление…"
                  : "Saqlanmoqda…"
                : isPolkiSheet
                  ? "Возврат"
                  : "Yaratish"}
            </Button>
          </div>
        }
      />

      <div
        className={cn(
          "flex w-full min-w-0 flex-col",
          isPolkiSheet ? "gap-4 pb-24" : "gap-6 pb-32"
        )}
      >
        {localError ? (
          <p className="text-sm text-destructive" role="alert">
            {localError}
          </p>
        ) : null}

        {createCtxQ.isError ? (
          <div
            role="alert"
            className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm"
          >
            <p className="font-semibold text-destructive">API bilan aloqa yo‘q</p>
            <p className="mt-1 text-muted-foreground">
              {isApiUnreachable(createCtxQ.error) ? (
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
                getUserFacingError(createCtxQ.error, "Zakaz formasi ma’lumotlari yuklanmadi.")
              )}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => void createCtxQ.refetch()}
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
            учитываются только продажи со статусом «{orderStatusLabelRu("delivered")}» (товар у клиента, возврат — на
            склад); после проведения — приход на{" "}
            <span className="font-medium text-foreground">склад возврата</span>, суммы и бонусы считает сервер.
            Повторный возврат по тому же заказу возможен, пока в строках остаётся количество к возврату (учтены
            уже проведённые возвраты).
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
                  if (isPolkiByOrder) setPolkiOrderIds([]);
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
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Davr</Label>
                  <button
                    type="button"
                    className={cn(
                      buttonVariants({ variant: "outline", size: "sm" }),
                      fieldClass,
                      "h-10 justify-start gap-2 font-normal",
                      polkiRangeOpen && "border-primary/60 bg-primary/5"
                    )}
                    aria-expanded={polkiRangeOpen}
                    aria-haspopup="dialog"
                    disabled={mutation.isPending || !canPickWarehouse}
                    onClick={(e) => {
                      polkiRangeAnchorRef.current = e.currentTarget;
                      setPolkiRangeOpen((o) => !o);
                    }}
                  >
                    <CalendarDays className="h-4 w-4 shrink-0" />
                    <span className="truncate text-sm">
                      {formatDateRangeButton(polkiDateFrom, polkiDateTo)}
                    </span>
                  </button>
                </div>
              ) : null}
              <div className="space-y-2">
                <Label htmlFor="oc-agent">Agent{requiresAgentAndPayment ? " *" : ""}</Label>
                <FilterSelect
                  id="oc-agent"
                  className={fieldClass}
                  emptyLabel={requiresAgentAndPayment ? "Agentni tanlang" : "Agent (ixtiyoriy)"}
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
              {requiresAgentAndPayment ? (
                <div className="space-y-2">
                  <Label htmlFor="oc-pay-method">To‘lov usuli *</Label>
                  {hasPaymentMethodCatalog ? (
                    <FilterSelect
                      id="oc-pay-method"
                      data-testid="order-create-payment-method"
                      className={fieldClass}
                      emptyLabel="Usulni tanlang"
                      aria-label="To‘lov usuli"
                      value={paymentMethodRef}
                      onChange={(e) => setPaymentMethodRef(e.target.value)}
                      disabled={mutation.isPending || loadingLists || !canPickWarehouse}
                    >
                      {paymentMethodSelectOptions.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.name}
                        </option>
                      ))}
                    </FilterSelect>
                  ) : (
                    <>
                      <Input
                        id="oc-pay-method"
                        data-testid="order-create-payment-method"
                        className={fieldClass}
                        placeholder="Kod yoki qisqa nom (max 64)"
                        maxLength={64}
                        value={paymentMethodRef}
                        onChange={(e) => setPaymentMethodRef(e.target.value)}
                        disabled={mutation.isPending || loadingLists || !canPickWarehouse}
                      />
                      <p className="text-[11px] text-muted-foreground">
                        Sozlamalarda «To‘lov usullari» bo‘sh — qo‘lda kiriting yoki{" "}
                        <Link className="underline" href="/settings">
                          sozlamalar
                        </Link>
                        da katalog qo‘shing.
                      </p>
                    </>
                  )}
                </div>
              ) : null}
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
                    disabled={mutation.isPending || createCtxQ.isPending || !canPickPricingAndExpeditor}
                  >
                    <option value="">Avtobog‘lash</option>
                    <option value="__none__">Ekspeditorsiz</option>
                    {(createCtxQ.data?.expeditors ?? []).map((r) => (
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

              {!isPolkiSheet ? (
                <div className="space-y-2 rounded-md border border-border/60 bg-muted/20 p-3">
                  <label className="flex cursor-pointer items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="mt-0.5 size-4 rounded border-input"
                      checked={orderIsConsignment}
                      onChange={(e) => setOrderIsConsignment(e.target.checked)}
                      disabled={mutation.isPending}
                    />
                    <span>
                      Konsignatsiya zakazi
                      <span className="mt-0.5 block text-[11px] text-muted-foreground">
                        Agent limiti va «Консигнация» sozlamalariga bog‘liq. Agent majburiy.
                      </span>
                    </span>
                  </label>
                  {orderIsConsignment ? (
                    <div className="space-y-1 pl-6">
                      <Label className="text-xs text-muted-foreground">To‘lash muddati (ixtiyoriy)</Label>
                      <button
                        ref={consignmentDueAnchorRef}
                        type="button"
                        disabled={mutation.isPending}
                        className={cn(
                          buttonVariants({ variant: "outline", size: "sm" }),
                          "h-10 w-full max-w-xs justify-start gap-2 font-normal",
                          consignmentDueOpen && "border-primary/60 bg-primary/5"
                        )}
                        aria-expanded={consignmentDueOpen}
                        aria-haspopup="dialog"
                        onClick={() => setConsignmentDueOpen((o) => !o)}
                      >
                        <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="truncate text-sm">
                          {formatRuDateButton(consignmentDueDate) || "kk.oo.yyyy"}
                        </span>
                      </button>
                      <DatePickerPopover
                        open={consignmentDueOpen}
                        onOpenChange={setConsignmentDueOpen}
                        anchorRef={consignmentDueAnchorRef}
                        value={consignmentDueDate}
                        onChange={setConsignmentDueDate}
                        footerLabels={{ clear: "Tozalash", today: "Bugun", close: "Yopish" }}
                      />
                    </div>
                  ) : null}
                </div>
              ) : null}

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
                    {(createCtxQ.data?.price_types?.length ? createCtxQ.data.price_types : ["retail"]).map((t) => (
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
                            mutation.isPending || createCtxQ.isPending || !canPickPricingAndExpeditor
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
            <div className="mb-3 rounded-lg border border-teal-800/25 bg-gradient-to-br from-teal-50/90 via-card to-card p-3 dark:from-teal-950/35 dark:via-card">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,10rem)_minmax(0,1fr)_minmax(0,16rem)] lg:items-end">
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
                  <PolkiClientSearchSelect
                    id="oc-client-polki"
                    data-testid="order-create-client"
                    tenantSlug={tenantSlug}
                    value={clientId}
                    selectedLabel={polkiSelectedClientLabel}
                    placeholder="Выберите клиента"
                    disabled={mutation.isPending || loadingLists}
                    onValueChange={(id) => {
                      setClientId(id);
                      if (isPolkiByOrder) setPolkiOrderIds([]);
                    }}
                  />
                </div>
                <div className="space-y-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Тип цены
                  </p>
                  <div className="flex max-h-[5.5rem] flex-wrap gap-1.5 overflow-y-auto pr-0.5">
                    {(createCtxQ.data?.price_types?.length ? createCtxQ.data.price_types : ["retail"]).map((t) => (
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
                          disabled={mutation.isPending || createCtxQ.isPending}
                        />
                        <span>{POLKI_PRICE_TYPE_LABEL_RU[t] ?? t}</span>
                      </label>
                    ))}
                  </div>
                  <label className="flex cursor-not-allowed items-center gap-2 text-[11px] text-muted-foreground opacity-60">
                    <input type="checkbox" disabled className="size-3.5 rounded border-input" />
                    Старые цены (скоро)
                  </label>
                </div>
              </div>
            </div>

            <div className="rounded-md border border-border bg-muted/15 p-3 shadow-sm">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Параметры возврата
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                <div className="space-y-1 sm:col-span-2 xl:col-span-2">
                  <Label htmlFor="oc-warehouse-p" className="text-xs">
                    Склад возврата
                  </Label>
                  <FilterSelect
                    id="oc-warehouse-p"
                    data-testid="order-create-warehouse"
                    className={cn(fieldClass, "h-9")}
                    emptyLabel="Склад…"
                    aria-label="Склад возврата"
                    value={warehouseId}
                    onChange={(e) => setWarehouseId(e.target.value)}
                    disabled={mutation.isPending || loadingLists || !canPickWarehouse}
                  >
                    {warehouses.map((w) => (
                      <option key={w.id} value={String(w.id)}>
                        {w.name}
                        {w.stock_purpose === "return" ? " · возврат" : ""}
                      </option>
                    ))}
                  </FilterSelect>
                  {!canPickWarehouse ? (
                    <p className="text-[10px] text-muted-foreground">Сначала клиент.</p>
                  ) : null}
                </div>
                {isPolkiFree ? (
                  <div className="space-y-1 sm:col-span-2 xl:col-span-2">
                    <Label className="text-xs text-muted-foreground">Период</Label>
                    <button
                      type="button"
                      className={cn(
                        buttonVariants({ variant: "outline", size: "sm" }),
                        fieldClass,
                        "h-9 justify-start gap-2 font-normal",
                        polkiRangeOpen && "border-primary/60 bg-primary/5"
                      )}
                      aria-expanded={polkiRangeOpen}
                      aria-haspopup="dialog"
                      disabled={mutation.isPending || !canPickWarehouse}
                      onClick={(e) => {
                        polkiRangeAnchorRef.current = e.currentTarget;
                        setPolkiRangeOpen((o) => !o);
                      }}
                    >
                      <CalendarDays className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate text-xs">
                        {formatDateRangeButton(polkiDateFrom, polkiDateTo)}
                      </span>
                    </button>
                  </div>
                ) : null}
                <div className="space-y-1">
                  <Label htmlFor="oc-agent-p" className="text-xs">
                    Агент
                  </Label>
                  <FilterSelect
                    id="oc-agent-p"
                    className={cn(fieldClass, "h-9")}
                    emptyLabel="—"
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
                <div className="space-y-1">
                  <Label htmlFor="oc-polki-trade" className="text-xs">
                    Направление
                  </Label>
                  <select
                    id="oc-polki-trade"
                    className={cn(fieldClass, "h-9 text-sm")}
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
                <div className="space-y-1">
                  <Label htmlFor="oc-polki-skidka" className="text-xs">
                    Скидка
                  </Label>
                  <select
                    id="oc-polki-skidka"
                    className={cn(fieldClass, "h-9 text-sm")}
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
              {isPolkiByOrder ? (
                <div className="mt-3 border-t border-border/70 pt-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="space-y-0.5">
                      <Label className="text-xs font-medium">Заказы (можно несколько)</Label>
                      <p className="text-[10px] leading-snug text-muted-foreground">
                        Только статус{" "}
                        <span className="font-medium text-foreground">
                          «{orderStatusLabelRu("delivered")}»
                        </span>
                        ; остальные не показываются.
                      </p>
                    </div>
                    {polkiOrdersForPick.length > 0 ? (
                      <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-muted-foreground">
                        <input
                          type="checkbox"
                          className="rounded border-input"
                          checked={
                            polkiOrderIds.length > 0 &&
                            polkiOrderIds.length === polkiOrdersForPick.length
                          }
                          onChange={(e) => togglePolkiOrdersSelectAll(e.target.checked)}
                        />
                        Все
                      </label>
                    ) : null}
                  </div>
                  <div className="mt-1.5 overflow-x-auto rounded border border-border/80 bg-background">
                    {!canPickWarehouse ? (
                      <p className="px-2 py-2 text-[11px] text-muted-foreground">Сначала клиент.</p>
                    ) : polkiOrdersPickQ.isLoading ? (
                      <p className="px-2 py-2 text-[11px] text-muted-foreground">Загрузка…</p>
                    ) : polkiOrdersForPick.length === 0 ? (
                      polkiOrdersPickRawCount > 0 ? (
                        <p className="px-2 py-2 text-[11px] text-muted-foreground">
                          Нет заказов со статусом «{orderStatusLabelRu("delivered")}». Возврат с полки по заказу
                          возможен только после доставки (сейчас у клиента есть заказы в статусах вроде «
                          {orderStatusLabelRu("new")}», «{orderStatusLabelRu("confirmed")}» и т.д.).
                        </p>
                      ) : (
                        <p className="px-2 py-2 text-[11px] text-destructive/90">Нет заказов у клиента.</p>
                      )
                    ) : (
                      <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
                        {polkiOrderPickHalfLists
                          .filter((chunk) => chunk.length > 0)
                          .map((chunk, colIdx) => (
                          <div key={colIdx} className="min-w-0 overflow-x-auto">
                            <div className="max-h-[min(48vh,24rem)] overflow-y-auto rounded border border-border/60 bg-background/80">
                              <table className="w-full min-w-[280px] border-collapse text-left text-[11px]">
                                <thead className="sticky top-0 z-[1] border-b border-border/80 bg-muted/40 backdrop-blur-sm">
                                  <tr className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                                    <th className="w-8 px-1 py-1 text-center" title="Выбор">
                                      ✓
                                    </th>
                                    <th className="px-1.5 py-1">Номер</th>
                                    <th className="px-1.5 py-1">Дата</th>
                                    <th className="min-w-[5rem] px-1.5 py-1">Склад</th>
                                    <th className="px-1.5 py-1 text-right tabular-nums">Кол-во</th>
                                    <th className="px-1.5 py-1 text-right tabular-nums">Сумма</th>
                                    <th className="w-10 px-1 py-1 text-center" title="Бонус">
                                      Бон.
                                    </th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {chunk.map((o) => {
                                    const dateStr = o.created_at
                                      ? String(o.created_at).slice(0, 10)
                                      : "—";
                                    const hasBonus = polkiOrderRowHasBonus(o);
                                    const rowSelected = polkiOrderIds.includes(o.id);
                                    const qtyDisp =
                                      o.qty != null && String(o.qty).trim() !== ""
                                        ? formatNumberGrouped(parseStockQty(o.qty), {
                                            maxFractionDigits: 3
                                          })
                                        : "—";
                                    const sumDisp =
                                      o.total_sum != null && String(o.total_sum).trim() !== ""
                                        ? formatNumberGrouped(parsePriceAmount(o.total_sum), {
                                            maxFractionDigits: 0
                                          })
                                        : "—";
                                    return (
                                      <tr
                                        key={o.id}
                                        tabIndex={0}
                                        aria-selected={rowSelected}
                                        aria-label={`Заказ ${o.number}, ${rowSelected ? "выбран" : "не выбран"}, нажмите Enter для переключения`}
                                        data-selected={rowSelected ? "true" : undefined}
                                        className={cn(
                                          "border-b border-border/50 last:border-0 bg-transparent outline-none transition-[background-color,box-shadow] duration-150 select-none",
                                          rowSelected
                                            ? "cursor-pointer bg-teal-100/85 shadow-[inset_0_0_0_1px_rgba(13,148,136,0.35)] hover:bg-teal-100 dark:bg-teal-950/50 dark:shadow-[inset_0_0_0_1px_rgba(45,212,191,0.28)] dark:hover:bg-teal-950/60"
                                            : "cursor-pointer hover:bg-muted/50"
                                        )}
                                        onClick={() => togglePolkiOrderPick(o.id, !rowSelected)}
                                        onKeyDown={(e) => {
                                          if (e.key === "Enter" || e.key === " ") {
                                            e.preventDefault();
                                            togglePolkiOrderPick(o.id, !rowSelected);
                                          }
                                        }}
                                      >
                                        <td
                                          className="px-1 py-0.5 align-middle text-center"
                                          onClick={(e) => e.stopPropagation()}
                                        >
                                          <input
                                            type="checkbox"
                                            className="rounded border-input"
                                            checked={rowSelected}
                                            onChange={(e) =>
                                              togglePolkiOrderPick(o.id, e.target.checked)
                                            }
                                            onClick={(e) => e.stopPropagation()}
                                            aria-label={`Заказ ${o.number}`}
                                          />
                                        </td>
                                        <td className="px-1.5 py-0.5 align-middle font-mono font-medium">
                                          {o.number}
                                        </td>
                                        <td className="px-1.5 py-0.5 align-middle tabular-nums text-muted-foreground">
                                          {dateStr}
                                        </td>
                                        <td
                                          className="max-w-[7rem] truncate px-1.5 py-0.5 align-middle text-muted-foreground"
                                          title={o.warehouse_name?.trim() ? o.warehouse_name : undefined}
                                        >
                                          {o.warehouse_name?.trim() ? o.warehouse_name : "—"}
                                        </td>
                                        <td className="px-1.5 py-0.5 align-middle text-right tabular-nums">
                                          {qtyDisp}
                                        </td>
                                        <td className="px-1.5 py-0.5 align-middle text-right tabular-nums">
                                          {sumDisp}
                                        </td>
                                        <td className="px-1 py-0.5 align-middle text-center">
                                          {hasBonus ? (
                                            <span
                                              className="inline-flex items-center justify-center rounded-full border border-amber-500/40 bg-amber-500/15 p-0.5 text-amber-900 dark:text-amber-100"
                                              title="В заказе есть бонусные позиции"
                                            >
                                              <Gift className="size-3.5 shrink-0" aria-hidden />
                                            </span>
                                          ) : (
                                            <span className="text-muted-foreground">—</span>
                                          )}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  {polkiOrdersForPick.length > 0 && polkiOrderIds.length === 0 ? (
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      Клик по строке или по флажку — отметить заказ; в возврат попадут только отмеченные.
                    </p>
                  ) : null}
                  {polkiOrderIds.length > 0 ? (
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      Выбрано заказов: {polkiOrderIds.length}. Состав возврата и проведение — только по этим
                      заказам (можно одну или несколько строк в таблице).
                    </p>
                  ) : null}
                </div>
              ) : null}
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
              .
            </p>
            {requestTypeOptions.length > 0 ? (
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
              disabled={mutation.isPending || !canPickPricingAndExpeditor}
              placeholder="Buyurtma bo‘yicha eslatma…"
              maxLength={4000}
            />
          </div>
          ) : (
          <div className="mt-3 grid grid-cols-1 gap-3 border-t border-border/60 pt-3 sm:grid-cols-2">
            {refusalReasonPolkiOptions.length > 0 ? (
              <div className="space-y-1">
                <Label htmlFor="oc-polki-refusal-foot" className="text-xs">
                  Причина отказа
                </Label>
                <select
                  id="oc-polki-refusal-foot"
                  className={cn(fieldClass, "h-9 text-sm")}
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
              <div className="space-y-1">
                <Label className="text-xs">Шаблон примечания</Label>
                <Select
                  key={`on-polki-${refSelectKey}`}
                  value={orderNotePreset || undefined}
                  onValueChange={(v) => setOrderNotePreset(v === "__none__" ? "" : v)}
                >
                  <SelectTrigger id="oc-order-note-polki" className="h-9 text-sm">
                    <SelectValue placeholder="—" />
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
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="oc-comment-polki" className="text-xs">
                Комментарий
              </Label>
              <textarea
                id="oc-comment-polki"
                rows={2}
                className={cn(
                  fieldClass,
                  "min-h-[4rem] resize-y py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                )}
                value={orderComment}
                onChange={(e) => setOrderComment(e.target.value)}
                disabled={mutation.isPending}
                placeholder="Дополнительно (необязательно)…"
                maxLength={4000}
              />
            </div>
          </div>
          )}

          {clientSummaryQ.data ? (
            <div className="mt-4 rounded-md border border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
              {isPolkiSheet ? (
                <>
                  <span className="font-medium text-foreground">Финансы клиента: </span>
                  баланс{" "}
                  <span className="font-mono tabular-nums text-foreground">
                    {formatNumberGrouped(clientSummaryQ.data.account_balance, { maxFractionDigits: 2 })}
                  </span>
                  {" · "}кредитный лимит{" "}
                  <span className="font-mono tabular-nums text-foreground">
                    {formatNumberGrouped(clientSummaryQ.data.credit_limit, { maxFractionDigits: 2 })}
                  </span>
                  {" · "}открытые заказы{" "}
                  <span className="font-mono tabular-nums text-foreground">
                    {formatNumberGrouped(clientSummaryQ.data.open_orders_total, { maxFractionDigits: 2 })}
                  </span>
                </>
              ) : (
                <>
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
                </>
              )}
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
                  ? "Один ввод на строку: общее количество возврата; система делит на оплату и бонус. Можно отметить «бонус не на склад» — тогда бонусная часть идёт суммой на баланс. Заказы выбирайте любые (не обязательно все). Поиск и категории ниже."
                  : "Сначала клиент, склад, период или заказ."}
              </p>
              <div className="mt-3">
                <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-medium text-foreground">Категории</span>
                  <span className="text-[10px] text-muted-foreground">
                    {canShowPolkiGrid ? "фильтр таблицы" : "сначала контекст"}
                  </span>
                </div>
                <div
                  className={cn(
                    "rounded-md border border-border/60 bg-muted/10 px-2 py-2",
                    !canShowPolkiGrid && "pointer-events-none opacity-50"
                  )}
                >
                  {!canShowPolkiGrid ? (
                    <p className="text-[11px] text-muted-foreground">
                      {isPolkiByOrder
                        ? "Клиент и хотя бы один заказ."
                        : "Сначала клиент (и период при необходимости)."}
                    </p>
                  ) : (
                    <div className="flex max-h-28 flex-wrap gap-1 overflow-y-auto">
                      <button
                        type="button"
                        onClick={() => setSelectedCategoryId("")}
                        disabled={mutation.isPending}
                        className={cn(
                          "inline-flex items-center gap-0.5 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors",
                          selectedCategoryId === ""
                            ? "border-teal-600 bg-teal-600 text-white"
                            : "border-border bg-background hover:bg-muted"
                        )}
                      >
                        {selectedCategoryId === "" ? <Check className="size-3 shrink-0" /> : null}
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
                              "inline-flex max-w-[10rem] items-center gap-0.5 truncate rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors",
                              active
                                ? "border-teal-600 bg-teal-600 text-white"
                                : "border-border bg-background hover:bg-muted"
                            )}
                            title={c.name}
                          >
                            {active ? <Check className="size-3 shrink-0" /> : null}
                            {c.name}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
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
              polkiOrderGroups={polkiOrderGroups}
              polkiTotalQty={polkiTotalQty}
              setPolkiTotalQty={setPolkiTotalQty}
              polkiBonusToBalance={polkiBonusToBalance}
              setPolkiBonusToBalance={setPolkiBonusToBalance}
              polkiBonusCash={polkiBonusCash}
              setPolkiBonusCash={setPolkiBonusCash}
              mutationPending={mutation.isPending}
              polkiTotalReturnQtySum={polkiTotalReturnQtySum}
              polkiVolumeM3={polkiVolumeM3}
              polkiEstimatedSum={polkiEstimatedSum}
              polkiDebtHintSum={polkiDebtHintSum}
            />
          )}

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
                задаёт сервер. Суммы в таблице и карточках — оценка по ценам продажи. В одном документе — не
                более {MAX_POLKI_RETURN_QTY} шт на склад за раз: в счёт входят и оплата, и бонус, если обе
                части физически возвращаются на склад (как в строке «Авторасп: … опл … бон»). При большем
                объёме оформите несколько возвратов.
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
        <div className="mx-auto flex w-full min-w-0 max-w-6xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-end sm:gap-3">
          {isPolkiSheet && !canSubmit && polkiSubmitBlockedReason ? (
            <p
              role="status"
              className="min-w-0 flex-1 text-xs leading-snug text-destructive sm:max-w-[min(100%,42rem)] sm:pr-2"
            >
              {polkiSubmitBlockedReason}
            </p>
          ) : null}
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 sm:ml-auto">
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
                ? isPolkiSheet
                  ? "Оформление…"
                  : "Saqlanmoqda…"
                : isPolkiSheet
                  ? "Возврат"
                  : "Yaratish"}
            </Button>
          </div>
        </div>
      </div>
      {isPolkiFree ? (
        <DateRangePopover
          open={polkiRangeOpen}
          onOpenChange={setPolkiRangeOpen}
          anchorRef={polkiRangeAnchorRef}
          dateFrom={polkiDateFrom}
          dateTo={polkiDateTo}
          onApply={({ dateFrom, dateTo }) => {
            setPolkiDateFrom(dateFrom);
            setPolkiDateTo(dateTo);
          }}
        />
      ) : null}
    </PageShell>
  );
}
