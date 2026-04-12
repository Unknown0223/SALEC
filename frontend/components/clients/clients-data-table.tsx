"use client";

import type { ClientRow } from "@/lib/client-types";
import type { ClientRefDisplayMaps } from "@/lib/client-ref-display-maps";
import { pickCityTerritoryHint } from "@/lib/city-territory-hint";
import {
  displayAddress,
  displayAgentDay,
  displayAgentName,
  displayExpeditorPhone,
  displayLegalName,
  displayPinfl,
  getClientSlotsWithDataInRows,
  getVisitWeekdaysForSlot,
  parseGpsText
} from "@/lib/client-column-display";
import {
  CLIENT_COLUMN_TO_SORT,
  type ClientSortField
} from "@/lib/client-list-sort";
import {
  CLIENT_TABLE_COLUMNS,
  getDefaultColumnVisibility,
  type ClientColumnId
} from "@/lib/client-table-columns";
import { formatDigitsGroupedLoose, formatGroupedInteger, formatNumberGrouped } from "@/lib/format-numbers";
import { TableRowActionGroup } from "@/components/data-table/table-row-actions";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";
import { ArrowDown, ArrowUp, ArrowUpDown, Pencil, UserRound } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef } from "react";

type Props = {
  rows: ClientRow[];
  /** Eski rejim: visibility bo‘yicha; `orderedVisibleColumnIds` berilsa ustunlar tartibi server prefs dan */
  visibility: Record<string, boolean>;
  /** `useUserTablePrefs.visibleColumnOrder` — Amallar ustuni avtomatik qo‘shiladi */
  orderedVisibleColumnIds?: string[];
  /** Spravochnik kodlari o‘rniga nom chiqarish */
  refDisplayMaps?: ClientRefDisplayMaps;
  onEdit: (row: ClientRow) => void;
  /** Guruh amallari: birinchi ustunda tanlash */
  bulkSelect?: boolean;
  selectedIds?: ReadonlySet<number>;
  onToggleRow?: (id: number, selected: boolean) => void;
  /** Joriy sahifadagi barcha qatorlarni tanlash / bekor qilish */
  onTogglePage?: (selectAll: boolean) => void;
  /** Server tartiblash: ustun sarlavhasini bosish */
  sortField?: ClientSortField;
  sortOrder?: "asc" | "desc";
  onSortByColumn?: (columnId: ClientColumnId) => void;
};

/** Bo‘sh qiymat — faqat chiziq (—) */
function Dash() {
  return <span className="text-muted-foreground">—</span>;
}

function Txt(v: string | null | undefined): ReactNode {
  const t = v?.trim();
  if (!t) return <Dash />;
  return <span className="text-xs">{t}</span>;
}

function TxtMono(v: string | null | undefined): ReactNode {
  const t = v?.trim();
  if (!t) return <Dash />;
  return <span className="font-mono text-xs">{t}</span>;
}

function displayMapped(raw: string | null | undefined, map?: Record<string, string>): string | null {
  const t = raw?.trim();
  if (!t) return null;
  return map?.[t] ?? t;
}

function territoryHintForRow(maps: ClientRefDisplayMaps | undefined, city: string | null | undefined) {
  const hints = maps?.cityTerritoryHints;
  if (!hints) return null;
  return pickCityTerritoryHint(hints, city ?? "");
}

function agentSlotFromColumnId(colId: string): number | null {
  const a = /^agent_(\d+)$/.exec(colId);
  if (a) return Number(a[1]);
  const d = /^agent_(\d+)_day$/.exec(colId);
  if (d) return Number(d[1]);
  const e = /^expeditor_(\d+)$/.exec(colId);
  if (e) return Number(e[1]);
  return null;
}

const WD_SHORT = ["", "Du", "Se", "Ch", "Pa", "Ju", "Sh", "Ya"];

function WeekdayTags({ days }: { days: number[] }) {
  const show = days.slice(0, 5);
  const rest = days.length - show.length;
  return (
    <span className="flex max-w-[14rem] flex-wrap gap-1">
      {show.map((d, i) => (
        <span
          key={`${d}-${i}`}
          className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary"
        >
          {WD_SHORT[d] ?? d}
        </span>
      ))}
      {rest > 0 ? (
        <span className="self-center text-[10px] text-muted-foreground">+{rest}</span>
      ) : null}
    </span>
  );
}

function cellContent(row: ClientRow, colId: ClientColumnId, maps?: ClientRefDisplayMaps): ReactNode {
  const dash = <Dash />;

  switch (colId) {
    case "name": {
      const t = row.name?.trim();
      return t ? <span className="font-medium">{t}</span> : dash;
    }
    case "client_ref": {
      const ref = row.client_code?.trim();
      if (ref && ref.length > 0) {
        const grouped = /^\d+$/.test(ref.replace(/\s/g, ""))
          ? formatNumberGrouped(ref.replace(/\s/g, ""), { maxFractionDigits: 0 })
          : ref;
        return TxtMono(grouped);
      }
      return TxtMono(`#${formatGroupedInteger(row.id)}`);
    }
    case "legal_name":
      return Txt(displayLegalName(row));
    case "address":
      return Txt(displayAddress(row));
    case "phone": {
      const p = row.phone?.trim();
      if (!p) return dash;
      const g = formatDigitsGroupedLoose(p);
      return TxtMono(g);
    }
    case "contact_person":
      return Txt(row.responsible_person);
    case "landmark":
      return Txt(row.landmark);
    case "inn": {
      const inn = row.inn?.trim();
      if (!inn) return dash;
      return Txt(/^\d[\d\s-]*$/.test(inn) ? formatDigitsGroupedLoose(inn) : inn);
    }
    case "pinfl": {
      const pf = displayPinfl(row);
      if (!pf) return dash;
      return Txt(formatDigitsGroupedLoose(pf));
    }
    case "trade_channel_code": {
      const sc = row.sales_channel?.trim();
      if (sc) return Txt(maps?.salesChannel?.[sc] ?? sc);
      return Txt(row.logistics_service);
    }
    case "client_category_code":
      return Txt(displayMapped(row.category, maps?.category));
    case "client_type_code":
      return Txt(displayMapped(row.client_type_code, maps?.clientType));
    case "format_code":
      return Txt(displayMapped(row.client_format, maps?.clientFormat));
    case "client_region": {
      const fromDb = displayMapped(row.region, maps?.region);
      if (fromDb) return Txt(fromDb);
      const h = territoryHintForRow(maps, row.city);
      return Txt(h?.region_label ?? h?.region_stored ?? null);
    }
    case "client_district": {
      const fromDb = displayMapped(row.district, maps?.district);
      if (fromDb) return Txt(fromDb);
      const h = territoryHintForRow(maps, row.city);
      return Txt(h?.district_label ?? h?.district_stored ?? null);
    }
    case "client_zone": {
      const fromDb = displayMapped(row.zone, maps?.zone);
      if (fromDb) return Txt(fromDb);
      const h = territoryHintForRow(maps, row.city);
      return Txt(h?.zone_label ?? h?.zone_stored ?? null);
    }
    case "city_code":
      return Txt(displayMapped(row.city, maps?.city));
    case "latitude": {
      const explicit =
        typeof row.latitude === "string" && row.latitude.trim() ? row.latitude.trim() : null;
      const parsed = parseGpsText(row.gps_text).lat;
      const v = explicit ?? parsed;
      if (!v?.trim()) return dash;
      return Txt(formatNumberGrouped(v, { maxFractionDigits: 6 }));
    }
    case "longitude": {
      const explicit =
        typeof row.longitude === "string" && row.longitude.trim() ? row.longitude.trim() : null;
      const parsed = parseGpsText(row.gps_text).lng;
      const v = explicit ?? parsed;
      if (!v?.trim()) return dash;
      return Txt(formatNumberGrouped(v, { maxFractionDigits: 6 }));
    }
    case "_actions":
      return null;
    default: {
      const m = /^agent_(\d+)$/.exec(colId);
      if (m) return Txt(displayAgentName(row, Number(m[1])));
      const d = /^agent_(\d+)_day$/.exec(colId);
      if (d) {
        const slot = Number(d[1]);
        const wdays = getVisitWeekdaysForSlot(row, slot);
        if (wdays.length > 0) return <WeekdayTags days={wdays} />;
        return Txt(displayAgentDay(row, slot));
      }
      const e = /^expeditor_(\d+)$/.exec(colId);
      if (e) {
        const ex = displayExpeditorPhone(row, Number(e[1]));
        if (!ex?.trim()) return dash;
        return TxtMono(formatDigitsGroupedLoose(ex));
      }
      return dash;
    }
  }
}

export function ClientsDataTable({
  rows,
  visibility,
  orderedVisibleColumnIds,
  refDisplayMaps,
  onEdit,
  bulkSelect = false,
  selectedIds,
  onToggleRow,
  onTogglePage,
  sortField,
  sortOrder,
  onSortByColumn
}: Props) {
  const headerCbRef = useRef<HTMLInputElement>(null);

  const slotsWithAgentData = useMemo(() => getClientSlotsWithDataInRows(rows), [rows]);

  const cols = useMemo(() => {
    const filterAgentTriplet = (
      list: (typeof CLIENT_TABLE_COLUMNS)[number][]
    ): (typeof CLIENT_TABLE_COLUMNS)[number][] =>
      list.filter((col) => {
        if (col.id === "_actions") return true;
        const slot = agentSlotFromColumnId(col.id);
        if (slot == null) return true;
        return slotsWithAgentData.has(slot);
      });

    if (orderedVisibleColumnIds?.length) {
      const dataCols = orderedVisibleColumnIds
        .map((id) => CLIENT_TABLE_COLUMNS.find((c) => c.id === id))
        .filter(
          (c): c is (typeof CLIENT_TABLE_COLUMNS)[number] => c != null && c.id !== "_actions"
        );
      const filtered = filterAgentTriplet(dataCols);
      const actions = CLIENT_TABLE_COLUMNS.find((c) => c.id === "_actions");
      return actions ? [...filtered, actions] : filtered;
    }
    let c = CLIENT_TABLE_COLUMNS.filter((x) => visibility[x.id] === true);
    if (c.length === 0) {
      const d = getDefaultColumnVisibility();
      c = CLIENT_TABLE_COLUMNS.filter((x) => d[x.id] === true);
    }
    return filterAgentTriplet(c);
  }, [orderedVisibleColumnIds, visibility, slotsWithAgentData]);

  const sel = selectedIds ?? new Set<number>();
  const allOnPage = rows.length > 0 && rows.every((r) => sel.has(r.id));
  const someOnPage = rows.some((r) => sel.has(r.id));
  useEffect(() => {
    const el = headerCbRef.current;
    if (!el) return;
    el.indeterminate = someOnPage && !allOnPage;
  }, [someOnPage, allOnPage]);

  const colCount = cols.length + (bulkSelect ? 1 : 0);

  return (
    <div className="overflow-x-auto">
      <table className="w-max min-w-full max-w-none border-separate border-spacing-0 text-left text-sm table-auto">
        <thead className="app-table-thead">
          <tr>
            {bulkSelect ? (
              <th className="w-10 whitespace-nowrap px-2 py-2">
                <input
                  ref={headerCbRef}
                  type="checkbox"
                  className="h-4 w-4 rounded border-input accent-primary"
                  checked={allOnPage}
                  onChange={(e) => onTogglePage?.(e.target.checked)}
                  aria-label="Sahifani tanlash"
                />
              </th>
            ) : null}
            {cols.map((c) => {
              const sortKey = CLIENT_COLUMN_TO_SORT[c.id];
              const interactive = Boolean(sortKey && onSortByColumn);
              return (
                <th
                  key={c.id}
                  className="whitespace-nowrap px-2 py-2.5 text-left align-bottom text-xs !font-bold leading-tight text-foreground"
                >
                  {interactive ? (
                    <button
                      type="button"
                      className={cn(
                        "-mx-1 inline-flex max-w-none shrink-0 items-center gap-1 rounded px-1 py-0.5 text-left text-xs !font-bold hover:bg-muted/80",
                        sortField === sortKey ? "text-foreground" : "text-muted-foreground"
                      )}
                      onClick={() => onSortByColumn!(c.id)}
                      title="Tartiblash"
                    >
                      <span className="text-left">{c.label}</span>
                      {sortField === sortKey ? (
                        sortOrder === "asc" ? (
                          <ArrowUp className="size-3.5 shrink-0 text-primary" strokeWidth={2.5} aria-hidden />
                        ) : (
                          <ArrowDown className="size-3.5 shrink-0 text-primary" strokeWidth={2.5} aria-hidden />
                        )
                      ) : (
                        <ArrowUpDown className="size-3.5 shrink-0 opacity-40" aria-hidden />
                      )}
                    </button>
                  ) : (
                    c.label
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={colCount} className="px-3 py-8 text-center text-muted-foreground">
                Клиенты не найдены
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row.id} className="border-b last:border-0">
                {bulkSelect ? (
                  <td className="w-10 px-2 py-2 align-top">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-input accent-primary"
                      checked={sel.has(row.id)}
                      onChange={(e) => onToggleRow?.(row.id, e.target.checked)}
                      aria-label={`Клиент №${row.id}`}
                    />
                  </td>
                ) : null}
                {cols.map((c) => (
                  <td
                    key={c.id}
                    className={cn(
                      "px-2 py-2 align-top",
                      c.id !== "_actions" &&
                        "min-w-0 max-w-[13rem] break-words [word-break:break-word]"
                    )}
                  >
                    {c.id === "_actions" ? (
                      <TableRowActionGroup>
                        <Button
                          type="button"
                          size="icon-sm"
                          variant="outline"
                          className="text-muted-foreground hover:text-foreground"
                          onClick={() => onEdit(row)}
                          title="Tahrirlash"
                          aria-label="Tahrirlash"
                        >
                          <Pencil className="size-3.5" aria-hidden />
                        </Button>
                        <Link
                          href={`/clients/${row.id}/balances`}
                          className={cn(
                            buttonVariants({ variant: "ghost", size: "icon-sm" }),
                            "text-primary hover:bg-primary/10 hover:text-primary"
                          )}
                          title="Kartochka"
                          aria-label="Kartochka"
                        >
                          <UserRound className="size-3.5" aria-hidden />
                        </Link>
                      </TableRowActionGroup>
                    ) : (
                      cellContent(row, c.id, refDisplayMaps)
                    )}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
