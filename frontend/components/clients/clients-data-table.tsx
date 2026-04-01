"use client";

import type { ClientRow } from "@/lib/client-types";
import {
  displayAddress,
  displayAgentDay,
  displayAgentName,
  displayCityCode,
  displayClientCategory,
  displayClientType,
  displayExpeditorPhone,
  displayFormatCode,
  displayLegalName,
  displayPinfl,
  displayTradeChannel,
  getVisitWeekdaysForSlot,
  parseGpsText
} from "@/lib/client-column-display";
import {
  CLIENT_TABLE_COLUMNS,
  getDefaultColumnVisibility,
  type ClientColumnId
} from "@/lib/client-table-columns";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useRef } from "react";

type Props = {
  rows: ClientRow[];
  visibility: Record<string, boolean>;
  onEdit: (row: ClientRow) => void;
  /** Guruh amallari: birinchi ustunda tanlash */
  bulkSelect?: boolean;
  selectedIds?: ReadonlySet<number>;
  onToggleRow?: (id: number, selected: boolean) => void;
  /** Joriy sahifadagi barcha qatorlarni tanlash / bekor qilish */
  onTogglePage?: (selectAll: boolean) => void;
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

function cellContent(row: ClientRow, colId: ClientColumnId): ReactNode {
  const dash = <Dash />;

  switch (colId) {
    case "name": {
      const t = row.name?.trim();
      return t ? <span className="font-medium">{t}</span> : dash;
    }
    case "legal_name":
      return Txt(displayLegalName(row));
    case "address":
      return Txt(displayAddress(row));
    case "phone":
      return TxtMono(row.phone);
    case "contact_person":
      return Txt(row.responsible_person);
    case "landmark":
      return Txt(row.landmark);
    case "inn":
      return Txt(row.inn);
    case "pinfl":
      return Txt(displayPinfl(row));
    case "trade_channel_code":
      return Txt(displayTradeChannel(row));
    case "client_category_code":
      return Txt(displayClientCategory(row));
    case "client_type_code":
      return Txt(displayClientType(row));
    case "format_code":
      return Txt(displayFormatCode(row));
    case "client_region":
      return Txt(row.region);
    case "client_district":
      return Txt(row.district);
    case "client_zone":
      return Txt(row.zone);
    case "city_code":
      return Txt(displayCityCode(row));
    case "latitude": {
      const explicit =
        typeof row.latitude === "string" && row.latitude.trim() ? row.latitude.trim() : null;
      const parsed = parseGpsText(row.gps_text).lat;
      return Txt(explicit ?? parsed);
    }
    case "longitude": {
      const explicit =
        typeof row.longitude === "string" && row.longitude.trim() ? row.longitude.trim() : null;
      const parsed = parseGpsText(row.gps_text).lng;
      return Txt(explicit ?? parsed);
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
      if (e) return TxtMono(displayExpeditorPhone(row, Number(e[1])));
      return dash;
    }
  }
}

export function ClientsDataTable({
  rows,
  visibility,
  onEdit,
  bulkSelect = false,
  selectedIds,
  onToggleRow,
  onTogglePage
}: Props) {
  const headerCbRef = useRef<HTMLInputElement>(null);

  let cols = CLIENT_TABLE_COLUMNS.filter((c) => visibility[c.id] === true);
  if (cols.length === 0) {
    const d = getDefaultColumnVisibility();
    cols = CLIENT_TABLE_COLUMNS.filter((c) => d[c.id] === true);
  }

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
      <table className="w-full min-w-[1200px] text-left text-sm">
        <thead className="border-b bg-muted/60">
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
            {cols.map((c) => (
              <th
                key={c.id}
                className={cn(
                  "whitespace-nowrap px-2 py-2 font-medium",
                  c.id === "_actions" &&
                    "sticky right-0 z-10 bg-muted/95 text-right shadow-[inset_1px_0_0_hsl(var(--border))]"
                )}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={colCount} className="px-3 py-8 text-center text-muted-foreground">
                Mijoz topilmadi
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
                      aria-label={`Mijoz #${row.id}`}
                    />
                  </td>
                ) : null}
                {cols.map((c) => (
                  <td
                    key={c.id}
                    className={cn(
                      "max-w-[14rem] px-2 py-2 align-top",
                      c.id === "_actions" &&
                        "sticky right-0 z-10 bg-background shadow-[inset_1px_0_0_hsl(var(--border))]"
                    )}
                  >
                    {c.id === "_actions" ? (
                      <div className="flex flex-col items-end gap-1 sm:flex-row sm:justify-end">
                        <Button type="button" size="sm" variant="outline" onClick={() => onEdit(row)}>
                          Tahrir
                        </Button>
                        <Link
                          href={`/clients/${row.id}`}
                          className="text-xs text-primary underline-offset-2 hover:underline"
                        >
                          Karta
                        </Link>
                      </div>
                    ) : (
                      cellContent(row, c.id)
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
