"use client";

import type { PaymentListApiRow } from "@/lib/payment-list-types";
import { formatNumberGrouped } from "@/lib/format-numbers";
import {
  chunkReceiptRowsByGroup,
  type PaymentReceiptPrintPrefs
} from "@/lib/payment-receipt-print-prefs";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";
import { useEffect, useMemo } from "react";

function formatDt(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return "—";
  }
}

type Props = {
  rows: PaymentListApiRow[];
  prefs: PaymentReceiptPrintPrefs;
  onClose: () => void;
};

function ReceiptKvRow({
  label,
  children,
  valueClassName
}: {
  label: string;
  children: ReactNode;
  valueClassName?: string;
}) {
  return (
    <div className="receipt-kv-row grid grid-cols-[minmax(8.5rem,34%)_1fr] items-baseline gap-x-4 border-b border-neutral-200 py-2 text-sm last:border-b-0 print:gap-x-3 print:py-1.5">
      <div className="shrink-0 text-neutral-600 print:text-black">{label}</div>
      <div
        className={cn(
          "min-w-0 break-words text-right font-normal text-neutral-900 print:text-black",
          valueClassName
        )}
      >
        {children}
      </div>
    </div>
  );
}

export function PaymentReceiptsPrintView({ rows, prefs, onClose }: Props) {
  const groups = useMemo(() => chunkReceiptRowsByGroup(rows, prefs.groupBy), [rows, prefs.groupBy]);

  useEffect(() => {
    const handleAfterPrint = () => onClose();
    window.addEventListener("afterprint", handleAfterPrint);
    const t = window.setTimeout(() => window.print(), 200);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("afterprint", handleAfterPrint);
    };
  }, [onClose]);

  const territoryLine = (r: PaymentListApiRow) =>
    [r.client_region, r.client_city, r.client_district].filter((x) => x?.trim()).join(" / ") || "—";

  return (
    <div
      className="payment-receipts-print-root fixed inset-0 z-[100] overflow-auto bg-white p-4 text-black print:static print:inset-auto print:z-auto print:p-0"
      data-testid="payment-receipts-print-view"
    >
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          .payment-receipts-print-root, .payment-receipts-print-root * { visibility: visible !important; }
          .payment-receipts-print-root { position: absolute; left: 0; top: 0; width: 100%; background: white; }
          .no-print { display: none !important; }
        }
        @media screen {
          .payment-receipts-print-root { box-shadow: 0 0 0 1px #e5e7eb; }
        }
      `}</style>

      <div className="no-print mb-4 flex gap-2 border-b border-border pb-3">
        <button
          type="button"
          className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
          onClick={() => onClose()}
        >
          Закрыть предпросмотр
        </button>
      </div>

      <header className="mb-6 text-center">
        <h1 className="text-lg font-bold">Квитанции об оплате</h1>
        <p className="text-sm text-neutral-600">
          Документ сформирован: {new Date().toLocaleString("ru-RU")} · записей: {rows.length}
        </p>
      </header>

      {groups.map((g, gi) => (
        <section
          key={g.key || "all"}
          className={cn("mb-8 break-inside-avoid", gi > 0 && prefs.groupBy !== "none" && "print:break-before-page")}
        >
          {prefs.groupBy !== "none" && g.key ? (
            <h2 className="mb-4 border-b border-neutral-400 pb-1 text-base font-semibold">{g.key}</h2>
          ) : null}
          <div className="space-y-6">
            {g.items.map((r) => (
              <article
                key={r.id}
                className="break-inside-avoid border border-neutral-300 px-4 py-3 print:border-neutral-400 print:px-3 print:py-2"
              >
                <div className="receipt-kv-table w-full max-w-xl">
                  {prefs.showPaymentId ? (
                    <ReceiptKvRow label="Платёж №:" valueClassName="font-semibold tabular-nums">
                      {r.id}
                    </ReceiptKvRow>
                  ) : null}
                  {prefs.showDates ? (
                    <>
                      <ReceiptKvRow label="Создан:" valueClassName="tabular-nums text-xs sm:text-sm">
                        {formatDt(r.created_at)}
                      </ReceiptKvRow>
                      <ReceiptKvRow label="Оплата:" valueClassName="tabular-nums text-xs sm:text-sm">
                        {formatDt(r.paid_at)}
                      </ReceiptKvRow>
                    </>
                  ) : null}
                  {prefs.showClient ? <ReceiptKvRow label="Клиент:">{r.client_name}</ReceiptKvRow> : null}
                  {prefs.showClientCode && r.client_code ? (
                    <ReceiptKvRow label="Код:" valueClassName="font-mono text-xs sm:text-sm">
                      {r.client_code}
                    </ReceiptKvRow>
                  ) : null}
                  {prefs.showLegalName && r.client_legal_name ? (
                    <ReceiptKvRow label="Юр. лицо:">{r.client_legal_name}</ReceiptKvRow>
                  ) : null}
                  {prefs.showAmount ? (
                    <ReceiptKvRow
                      label="Сумма:"
                      valueClassName="text-base font-semibold tabular-nums sm:text-lg"
                    >
                      {formatNumberGrouped(r.amount, { maxFractionDigits: 2 })} UZS
                    </ReceiptKvRow>
                  ) : null}
                  {prefs.showMethod ? <ReceiptKvRow label="Способ:">{r.payment_type}</ReceiptKvRow> : null}
                  {prefs.showCashDesk ? (
                    <ReceiptKvRow label="Касса:">{r.cash_desk_name ?? "—"}</ReceiptKvRow>
                  ) : null}
                  {prefs.showAgent ? <ReceiptKvRow label="Агент:">{r.agent_name ?? "—"}</ReceiptKvRow> : null}
                  {prefs.showExpeditor ? (
                    <ReceiptKvRow label="Экспедитор:">{r.expeditor_name ?? "—"}</ReceiptKvRow>
                  ) : null}
                  {prefs.showTerritory ? (
                    <ReceiptKvRow label="Территория:">{territoryLine(r)}</ReceiptKvRow>
                  ) : null}
                  {prefs.showTradeDirection ? (
                    <ReceiptKvRow label="Направление:">{r.trade_direction ?? "—"}</ReceiptKvRow>
                  ) : null}
                  {prefs.showConsignment ? (
                    <ReceiptKvRow label="Консигнация:">{r.consignment ? "Да" : "Нет"}</ReceiptKvRow>
                  ) : null}
                  {prefs.showNote && r.note ? (
                    <ReceiptKvRow label="Комментарий:" valueClassName="whitespace-pre-wrap text-left">
                      {r.note}
                    </ReceiptKvRow>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
