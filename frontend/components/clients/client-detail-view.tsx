"use client";

import type { ClientRow, ContactPersonSlot } from "@/lib/client-types";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { DateRangePopover, formatDateRangeButton, localYmd } from "@/components/ui/date-range-popover";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import {
  formatDigitsGroupedLoose,
  formatGroupedInteger,
  formatNumberGrouped
} from "@/lib/format-numbers";
import { STALE } from "@/lib/query-stale";
import { useEffectiveRole } from "@/lib/auth-store";
import { ORDER_STATUS_LABELS } from "@/lib/order-status";
import { cn } from "@/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays } from "lucide-react";
import Link from "next/link";
import { useRef, useState, type ReactNode } from "react";

export type ClientDetailApiRow = ClientRow & {
  phone_normalized: string | null;
  open_orders_total: string;
  updated_at: string;
  created_by_user_label?: string | null;
  last_modified_by_user_label?: string | null;
};

type BalanceMovementsResponse = {
  data: Array<{
    id: number;
    delta: string;
    note: string | null;
    user_login: string | null;
    created_at: string;
  }>;
  total: number;
  page: number;
  limit: number;
  account_balance: string;
};

function auditActionLabel(action: string): string {
  const m: Record<string, string> = {
    "client.patch": "Реквизиты",
    "client.balance_movement": "Баланс",
    "client.merge": "Объединение",
    "client.payment": "Оплата",
    "client.sales_return": "Возврат"
  };
  return m[action] ?? action;
}

function auditDetailJson(d: unknown): string {
  try {
    return JSON.stringify(d);
  } catch {
    return String(d);
  }
}

type Props = {
  tenantSlug: string;
  clientId: number;
};

type DetailTab = "main" | "balance" | "orders" | "payments" | "audit";

type PaymentRow = {
  id: number;
  amount: string;
  payment_type: string;
  note: string | null;
  created_at: string;
  order_id: number | null;
  order_number: string | null;
};

type ClientAuditResponse = {
  data: Array<{
    id: number;
    action: string;
    detail: unknown;
    user_login: string | null;
    created_at: string;
  }>;
  total: number;
  page: number;
  limit: number;
};

function parseFilenameFromDisposition(cd: string | undefined): string | null {
  if (!cd) return null;
  const m = /filename\*?=(?:UTF-8'')?["']?([^"';]+)/i.exec(cd);
  return m?.[1] ? decodeURIComponent(m[1].trim()) : null;
}

const WEEKDAY_RU: Record<number, string> = {
  1: "Пн",
  2: "Вт",
  3: "Ср",
  4: "Чт",
  5: "Пт",
  6: "Сб",
  7: "Вс"
};

function nz(s: string | null | undefined): boolean {
  return s != null && String(s).trim() !== "";
}

function assignmentHasDetailData(a: ClientRow["agent_assignments"][number]): boolean {
  const wd = Array.isArray(a.visit_weekdays) ? a.visit_weekdays.filter((x) => x >= 1 && x <= 7) : [];
  return (
    nz(a.agent_code) ||
    a.agent_id != null ||
    a.expeditor_user_id != null ||
    wd.length > 0 ||
    (a.visit_date != null && String(a.visit_date).trim() !== "") ||
    (a.expeditor_phone != null && a.expeditor_phone.trim() !== "")
  );
}

function formatVisitDateShort(iso: string | null): string | null {
  if (!iso?.trim()) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

function formatAgentAssignmentLine(a: ClientRow["agent_assignments"][number]): string {
  const code = a.agent_code?.trim() ?? "";
  const name = a.agent_name?.trim() ?? "";
  const chunks: string[] = [];
  if (code) chunks.push(code);
  if (a.agent_id != null) {
    chunks.push(name ? `[${name}]` : `[VACANT]`);
  } else if (name) {
    chunks.push(`[${name}]`);
  } else if (code) {
    chunks.push(`[VACANT]`);
  } else {
    chunks.push("—");
  }
  const d = formatVisitDateShort(a.visit_date);
  if (d) chunks.push(d);
  const wd = Array.isArray(a.visit_weekdays)
    ? Array.from(new Set(a.visit_weekdays)).filter((x) => x >= 1 && x <= 7).sort((x, y) => x - y)
    : [];
  if (wd.length > 0) {
    chunks.push(`(${wd.map((i) => WEEKDAY_RU[i] ?? String(i)).join(" , ")})`);
  }
  return chunks.join(" ");
}

function territoryFullLine(c: ClientRow): string {
  const parts = [c.region, c.city, c.district, c.zone, c.neighborhood].map((x) => (x ?? "").trim()).filter(Boolean);
  return parts.length ? parts.join(" · ") : "";
}

function addressStructuredLine(c: ClientRow): string {
  const line = [c.street, c.house_number, c.apartment].map((x) => (x ?? "").trim()).filter(Boolean).join(", ");
  return line;
}

type DetailRow = { label: string; value: ReactNode };

function DetailSection({ title, rows }: { title: string; rows: Array<DetailRow | null | false> }) {
  const list = rows.filter((r): r is DetailRow => Boolean(r));
  if (list.length === 0) return null;
  return (
    <div className="overflow-hidden rounded-lg border shadow-sm">
      <div className="border-b border-border bg-muted/40 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </div>
      <table className="w-full min-w-[280px] border-collapse text-sm">
        <tbody>
          {list.map((r, i) => (
            <tr key={i} className="border-b border-border last:border-b-0">
              <th className="w-44 max-w-[11rem] px-4 py-2.5 align-top text-left text-xs font-medium text-muted-foreground">
                {r.label}
              </th>
              <td className="px-4 py-2.5 break-words">{r.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function optStrRow(label: string, value: string | null | undefined): DetailRow | null {
  if (!nz(value)) return null;
  return { label, value: String(value).trim() };
}

function buildContactPersonRows(cps: ContactPersonSlot[]): DetailRow[] {
  const nonempty = cps
    .map((cp, idx) => ({ idx, cp }))
    .filter(({ cp }) => nz(cp.firstName) || nz(cp.lastName) || nz(cp.phone));
  return nonempty.map(({ cp }, j) => {
    const namePart = [cp.firstName?.trim(), cp.lastName?.trim()].filter(Boolean).join(" ");
    const phone = cp.phone?.trim();
    const value = (
      <span>
        {namePart || "—"}
        {phone ? (
          <span className="mt-0.5 block font-mono text-xs text-muted-foreground">
            {formatDigitsGroupedLoose(phone)}
          </span>
        ) : null}
      </span>
    );
    const label = nonempty.length > 1 ? `Контактное лицо (${j + 1})` : "Контактное лицо";
    return { label, value };
  });
}

export function ClientDetailView({ tenantSlug, clientId }: Props) {
  const qc = useQueryClient();
  const role = useEffectiveRole();
  const isAdmin = role === "admin";
  const canReconciliationPdf = role === "admin" || role === "operator";
  const [tab, setTab] = useState<DetailTab>("main");
  const [balPage, setBalPage] = useState(1);
  const [deltaInput, setDeltaInput] = useState("");
  const [noteInput, setNoteInput] = useState("");
  const [balanceFormError, setBalanceFormError] = useState<string | null>(null);
  const [auditPage, setAuditPage] = useState(1);
  const [reconDateFrom, setReconDateFrom] = useState(() => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-01`;
  });
  const [reconDateTo, setReconDateTo] = useState(() => localYmd(new Date()));
  const [reconRangeOpen, setReconRangeOpen] = useState(false);
  const reconRangeAnchorRef = useRef<HTMLButtonElement>(null);
  const [reconPdfLoading, setReconPdfLoading] = useState(false);
  const [reconPdfError, setReconPdfError] = useState<string | null>(null);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["client", tenantSlug, clientId],
    staleTime: STALE.detail,
    queryFn: async () => {
      const { data: body } = await api.get<ClientDetailApiRow>(
        `/api/${tenantSlug}/clients/${clientId}`
      );
      return body;
    }
  });

  const movementsQuery = useQuery({
    queryKey: ["client-balance-movements", tenantSlug, clientId, balPage],
    staleTime: STALE.list,
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(balPage), limit: "30" });
      const { data: body } = await api.get<BalanceMovementsResponse>(
        `/api/${tenantSlug}/clients/${clientId}/balance-movements?${params}`
      );
      return body;
    },
    enabled: tab === "balance"
  });

  const auditQuery = useQuery({
    queryKey: ["client-audit", tenantSlug, clientId, auditPage],
    staleTime: STALE.list,
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(auditPage), limit: "30" });
      const { data: body } = await api.get<ClientAuditResponse>(
        `/api/${tenantSlug}/clients/${clientId}/audit?${params}`
      );
      return body;
    },
    enabled: tab === "audit"
  });

  const paymentsTabQ = useQuery({
    queryKey: ["client-payments-tab", tenantSlug, clientId],
    staleTime: STALE.list,
    queryFn: async () => {
      const { data: body } = await api.get<{ data: PaymentRow[] }>(
        `/api/${tenantSlug}/clients/${clientId}/payments`
      );
      return body.data;
    },
    enabled: tab === "payments"
  });

  const addMovement = useMutation({
    mutationFn: async () => {
      const delta = Number.parseFloat(deltaInput.replace(/\s/g, "").replace(",", "."));
      if (!Number.isFinite(delta) || delta === 0) {
        throw new Error("Сумма должна отличаться от 0");
      }
      const { data: row } = await api.post<ClientDetailApiRow>(
        `/api/${tenantSlug}/clients/${clientId}/balance-movements`,
        { delta, note: noteInput.trim() || undefined }
      );
      return row;
    },
    onSuccess: async () => {
      setBalanceFormError(null);
      setDeltaInput("");
      setNoteInput("");
      await qc.invalidateQueries({ queryKey: ["client", tenantSlug, clientId] });
      await qc.invalidateQueries({ queryKey: ["client-balance-movements", tenantSlug, clientId] });
      await qc.invalidateQueries({ queryKey: ["client-audit", tenantSlug, clientId] });
    },
    onError: (e: unknown) => {
      const ax = e as { response?: { status?: number; data?: { error?: string } } };
      if (ax.response?.status === 403) {
        setBalanceFormError("Вводить может только администратор.");
        return;
      }
      if (ax.response?.data?.error === "BadDelta") {
        setBalanceFormError("Некорректная сумма.");
        return;
      }
      setBalanceFormError(e instanceof Error ? e.message : "Ошибка");
    }
  });

  const creditLimitNum = data ? Number.parseFloat(data.credit_limit) : NaN;
  const openNum = data ? Number.parseFloat(data.open_orders_total) : NaN;
  const showCreditHint =
    data != null &&
    Number.isFinite(creditLimitNum) &&
    creditLimitNum > 0 &&
    Number.isFinite(openNum);

  const downloadReconciliationPdf = async () => {
    if (!canReconciliationPdf) return;
    setReconPdfError(null);
    setReconPdfLoading(true);
    try {
      const params = new URLSearchParams({
        date_from: reconDateFrom.trim(),
        date_to: reconDateTo.trim()
      });
      const res = await api.get<Blob>(
        `/api/${tenantSlug}/clients/${clientId}/reconciliation-pdf?${params}`,
        { responseType: "blob" }
      );
      const ct = String(res.headers["content-type"] ?? "").toLowerCase();
      if (!ct.includes("pdf")) {
        throw new Error("Не удалось сформировать PDF");
      }
      const blob = res.data as Blob;
      const filename =
        parseFilenameFromDisposition(
          typeof res.headers["content-disposition"] === "string"
            ? res.headers["content-disposition"]
            : Array.isArray(res.headers["content-disposition"])
              ? res.headers["content-disposition"][0]
              : undefined
        ) ?? `akt-sverka-client-${clientId}.pdf`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setReconPdfError(e instanceof Error ? e.message : "Ошибка загрузки PDF");
    } finally {
      setReconPdfLoading(false);
    }
  };

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Загрузка…</p>;
  }
  if (isError || !data) {
    return (
      <p className="text-sm text-destructive">
        {error instanceof Error ? error.message : "Клиент не найден или ошибка."}
      </p>
    );
  }

  const balTotalPages =
    movementsQuery.data != null
      ? Math.max(1, Math.ceil(movementsQuery.data.total / movementsQuery.data.limit))
      : 1;

  const assignmentsOrdered = [...data.agent_assignments].sort((a, b) => a.slot - b.slot);
  const assignmentsVisible = assignmentsOrdered.filter(assignmentHasDetailData);
  const structuredAddr = addressStructuredLine(data);
  const territoryLine = territoryFullLine(data);

  return (
    <div className="flex flex-col gap-6 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold tracking-tight">{data.name}</h2>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/clients/${clientId}/edit`}
            className="inline-flex h-9 items-center justify-center rounded-md bg-secondary px-3 text-sm font-medium text-secondary-foreground shadow-sm transition-colors hover:bg-secondary/80"
          >
            Редактировать карточку
          </Link>
          <Link
            href={`/orders?client_id=${clientId}`}
            className="inline-flex h-9 items-center justify-center rounded-md border border-input bg-background px-3 text-sm font-medium shadow-sm transition-colors hover:bg-muted"
          >
            Заказы этого клиента
          </Link>
        </div>
      </div>

      {canReconciliationPdf ? (
        <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/20 p-3 sm:flex-row sm:flex-wrap sm:items-end">
          <p className="text-xs font-medium text-muted-foreground sm:w-full">Акт сверки (PDF)</p>
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">Период</span>
              <button
                ref={reconRangeAnchorRef}
                type="button"
                className={cn(
                  buttonVariants({ variant: "outline", size: "sm" }),
                  "h-9 min-w-[200px] max-w-[min(100%,20rem)] justify-start gap-2 font-normal",
                  reconRangeOpen && "border-primary/60 bg-primary/5"
                )}
                aria-expanded={reconRangeOpen}
                aria-haspopup="dialog"
                onClick={() => setReconRangeOpen((o) => !o)}
              >
                <CalendarDays className="h-4 w-4 shrink-0" />
                <span className="truncate text-sm">{formatDateRangeButton(reconDateFrom, reconDateTo)}</span>
              </button>
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="h-9"
              disabled={reconPdfLoading}
              onClick={() => void downloadReconciliationPdf()}
            >
              {reconPdfLoading ? "Загрузка…" : "Скачать PDF"}
            </Button>
          </div>
          {reconPdfError ? (
            <p className="text-xs text-destructive sm:w-full">{reconPdfError}</p>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-1 border-b border-border pb-px">
        {(
          [
            ["main", "Основное"],
            ["balance", "Баланс"],
            ["orders", "Заказы"],
            ["payments", "Оплаты"],
            ["audit", "История"]
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              "rounded-t-md px-3 py-2 text-sm font-medium transition-colors",
              tab === id
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "main" ? (
        <div className="space-y-4">
          <DetailSection
            title="Команда"
            rows={[
              ...(assignmentsVisible.length > 0
                ? assignmentsVisible.flatMap((a) => {
                    const expName = a.expeditor_name?.trim();
                    const expPhone = a.expeditor_phone?.trim();
                    const hasEx = Boolean(expName || expPhone);
                    const agentRow: DetailRow = {
                      label: `Команда ${a.slot}`,
                      value: (
                        <div>
                          <div className="text-xs text-muted-foreground">Агент</div>
                          <div className="font-mono text-xs sm:text-sm">{formatAgentAssignmentLine(a)}</div>
                          {hasEx ? (
                            <div className="mt-2">
                              <div className="text-xs text-muted-foreground">Экспедитор</div>
                              <div>
                                {expName || "—"}
                                {expPhone ? (
                                  <div className="font-mono text-xs text-muted-foreground">
                                    {formatDigitsGroupedLoose(expPhone)}
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          ) : null}
                        </div>
                      )
                    };
                    return [agentRow];
                  })
                : data.agent_id != null || nz(data.agent_name)
                  ? [
                      {
                        label: "Агент (основной)",
                        value: (
                          <span className="font-mono text-xs sm:text-sm">
                            {data.agent_name?.trim()
                              ? `[${data.agent_name.trim()}]`
                              : data.agent_id != null
                                ? `ID ${formatGroupedInteger(data.agent_id)}`
                                : "—"}
                          </span>
                        )
                      }
                    ]
                  : [])
            ]}
          />

          <DetailSection
            title="Фирма"
            rows={[
              { label: "Название", value: data.name },
              optStrRow("Юридическое название", data.legal_name)
            ]}
          />

          <DetailSection
            title="Контакты"
            rows={[
              optStrRow("Ответственное лицо", data.responsible_person),
              ...buildContactPersonRows(data.contact_persons),
              data.phone?.trim()
                ? {
                    label: "Телефон",
                    value: <span className="font-mono text-xs">{formatDigitsGroupedLoose(data.phone)}</span>
                  }
                : null,
              data.phone_normalized?.trim()
                ? {
                    label: "Телефон (норм.)",
                    value: (
                      <span className="font-mono text-xs text-muted-foreground">
                        {formatDigitsGroupedLoose(data.phone_normalized)}
                      </span>
                    )
                  }
                : null
            ]}
          />

          <DetailSection
            title="Территория и адрес"
            rows={[
              optStrRow("Территория", territoryLine || null),
              optStrRow("Ориентир", data.landmark),
              optStrRow("Код клиента", data.client_code),
              data.address?.trim()
                ? {
                    label: "Адрес",
                    value: (
                      <span>
                        {data.address.trim()}{" "}
                        <a
                          href={`https://yandex.com/maps/?text=${encodeURIComponent(data.address.trim())}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary text-xs underline-offset-2 hover:underline whitespace-nowrap"
                        >
                          На карте
                        </a>
                      </span>
                    )
                  }
                : null,
              optStrRow("Улица, дом", structuredAddr || null),
              optStrRow("GPS (текст)", data.gps_text),
              nz(data.latitude) || nz(data.longitude)
                ? {
                    label: "Координаты",
                    value: (
                      <span className="font-mono text-xs">
                        {[data.latitude?.trim(), data.longitude?.trim()].filter(Boolean).join(", ")}
                      </span>
                    )
                  }
                : null
            ]}
          />

          <DetailSection
            title="Классификация"
            rows={[
              optStrRow("Тип клиента", data.client_type_code),
              optStrRow("Формат клиента", data.client_format),
              optStrRow("Категория", data.category),
              optStrRow("Категория товаров", data.product_category_ref),
              optStrRow("Канал продаж", data.sales_channel)
            ]}
          />

          <DetailSection
            title="Статус и учёт"
            rows={[
              {
                label: "Статус",
                value: (
                  <span
                    className={
                      data.is_active ? "text-green-700 dark:text-green-400" : "text-muted-foreground"
                    }
                  >
                    {data.is_active ? "Активный" : "Неактивный"}
                  </span>
                )
              },
              optStrRow("Кто создал", data.created_by_user_label),
              optStrRow("Кто изменил", data.last_modified_by_user_label),
              {
                label: "Дата создания",
                value: (
                  <span className="text-xs text-muted-foreground">
                    {new Date(data.created_at).toLocaleString("ru-RU")}
                  </span>
                )
              },
              {
                label: "Дата обновления",
                value: (
                  <span className="text-xs text-muted-foreground">
                    {new Date(data.updated_at).toLocaleString("ru-RU")}
                  </span>
                )
              }
            ]}
          />

          <DetailSection
            title="Финансы"
            rows={[
              {
                label: "Кредитный лимит",
                value: (
                  <span className="tabular-nums font-mono text-xs">
                    {formatNumberGrouped(data.credit_limit, { maxFractionDigits: 2 })}
                  </span>
                )
              },
              {
                label: "Сальдо счёта",
                value: (
                  <span className="tabular-nums font-mono text-xs">
                    {formatNumberGrouped(data.account_balance, { maxFractionDigits: 2 })}
                  </span>
                )
              },
              {
                label: "Открытые заказы (всего)",
                value: (
                  <span className="tabular-nums font-mono text-xs">
                    {formatNumberGrouped(data.open_orders_total, { maxFractionDigits: 2 })}
                  </span>
                )
              },
              showCreditHint
                ? {
                    label: "Кредитная нагрузка",
                    value: (
                      <div className="max-w-xs space-y-1">
                        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-primary transition-[width]"
                            style={{
                              width: `${Math.min(100, Math.max(0, (openNum / creditLimitNum) * 100))}%`
                            }}
                          />
                        </div>
                        <p className="text-[11px] text-muted-foreground tabular-nums">
                          {((openNum / creditLimitNum) * 100).toFixed(1)}% лимита занято
                        </p>
                      </div>
                    )
                  }
                : null,
              showCreditHint
                ? {
                    label: "Остаток лимита",
                    value: (
                      <span className="tabular-nums text-xs">
                        {formatNumberGrouped(creditLimitNum - openNum, { maxFractionDigits: 2 })}{" "}
                        <span className="text-muted-foreground">
                          (лимит − открытые заказы; сальдо отдельно)
                        </span>
                      </span>
                    )
                  }
                : null
            ]}
          />

          <DetailSection
            title="Реквизиты и прочее"
            rows={[
              optStrRow("ИНН", data.inn),
              optStrRow("ПИНФЛ", data.client_pinfl),
              optStrRow("ПДЛ", data.pdl),
              optStrRow("Номер договора", data.contract_number),
              optStrRow("Банк", data.bank_name),
              optStrRow("Счёт", data.bank_account),
              optStrRow("МФО", data.bank_mfo),
              optStrRow("ОКЭД", data.oked),
              optStrRow("Рег. код плательщика НДС", data.vat_reg_code),
              optStrRow("Лицензия до", data.license_until),
              optStrRow("Логистика", data.logistics_service),
              optStrRow("Часы работы", data.working_hours),
              optStrRow("Дата визита (карточка)", formatVisitDateShort(data.visit_date)),
              optStrRow("Комментарий", data.notes)
            ]}
          />
        </div>
      ) : null}

      {tab === "balance" ? (
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Текущий баланс:{" "}
            <span className="font-mono tabular-nums text-foreground">
              {formatNumberGrouped(movementsQuery.data?.account_balance ?? data.account_balance, {
                maxFractionDigits: 2
              })}
            </span>
          </p>

          {isAdmin ? (
            <form
              className="rounded-lg border p-4 space-y-3 max-w-md"
              onSubmit={(e) => {
                e.preventDefault();
                setBalanceFormError(null);
                addMovement.mutate();
              }}
            >
              <p className="text-sm font-medium">Добавить движение</p>
              <div className="grid gap-1.5">
                <Label htmlFor="bal-delta">Изменение (UZS, отриц. — расход)</Label>
                <Input
                  id="bal-delta"
                  type="text"
                  inputMode="decimal"
                  value={deltaInput}
                  onChange={(e) => setDeltaInput(e.target.value)}
                  disabled={addMovement.isPending}
                  placeholder="например 50000 или -10000"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="bal-note">Примечание (необязательно)</Label>
                <Input
                  id="bal-note"
                  value={noteInput}
                  onChange={(e) => setNoteInput(e.target.value)}
                  disabled={addMovement.isPending}
                />
              </div>
              {balanceFormError ? (
                <p className="text-xs text-destructive">{balanceFormError}</p>
              ) : null}
              <Button type="submit" size="sm" disabled={addMovement.isPending}>
                {addMovement.isPending ? "Сохранение…" : "Добавить"}
              </Button>
            </form>
          ) : (
            <p className="text-xs text-muted-foreground">Добавление движений доступно только администратору.</p>
          )}

          {movementsQuery.isLoading ? (
            <p className="text-xs text-muted-foreground">Загрузка движений…</p>
          ) : movementsQuery.isError ? (
            <p className="text-xs text-destructive">Не удалось загрузить движения.</p>
          ) : (
            <>
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full min-w-[480px] border-collapse text-xs">
                  <thead className="app-table-thead">
                    <tr className="border-b bg-muted/50 text-left text-muted-foreground">
                      <th className="px-2 py-2 font-medium">Время</th>
                      <th className="px-2 py-2 font-medium text-right">Изменение</th>
                      <th className="px-2 py-2 font-medium">Примечание</th>
                      <th className="px-2 py-2 font-medium">Кто</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(movementsQuery.data?.data ?? []).map((m) => (
                      <tr key={m.id} className="border-b last:border-0">
                        <td className="px-2 py-2 text-muted-foreground whitespace-nowrap">
                          {new Date(m.created_at).toLocaleString()}
                        </td>
                        <td className="px-2 py-2 text-right font-mono tabular-nums">
                          {formatNumberGrouped(m.delta, { maxFractionDigits: 2 })}
                        </td>
                        <td className="px-2 py-2">{m.note ?? "—"}</td>
                        <td className="px-2 py-2 font-mono">{m.user_login ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {movementsQuery.data && movementsQuery.data.total > movementsQuery.data.limit ? (
                <div className="flex items-center gap-2 text-xs">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={balPage <= 1}
                    onClick={() => setBalPage((p) => Math.max(1, p - 1))}
                  >
                    Назад
                  </Button>
                  <span className="text-muted-foreground">
                    {formatGroupedInteger(balPage)} / {formatGroupedInteger(balTotalPages)}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={balPage >= balTotalPages}
                    onClick={() => setBalPage((p) => p + 1)}
                  >
                    Вперёд
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </div>
      ) : null}

      {tab === "orders" ? (
        <div className="space-y-2">
          <ClientOrdersSnippet tenantSlug={tenantSlug} clientId={clientId} />
          <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
            <li>
              <Link className="text-primary underline-offset-4 hover:underline" href="/orders">
                Все заказы
              </Link>
            </li>
            <li>
              <Link
                className="text-primary underline-offset-4 hover:underline"
                href={`/orders?client_id=${clientId}`}
              >
                Только заказы этого клиента
              </Link>
            </li>
          </ul>
        </div>
      ) : null}

      {tab === "payments" ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">Платежи, привязанные к клиенту.</p>
            <Link
              className="text-sm font-medium text-primary underline-offset-4 hover:underline"
              href={`/payments/new?client_id=${clientId}`}
            >
              + Новый платёж
            </Link>
          </div>
          {paymentsTabQ.isLoading ? (
            <p className="text-xs text-muted-foreground">Загрузка…</p>
          ) : paymentsTabQ.isError ? (
            <p className="text-xs text-destructive">Не удалось загрузить список (права или сеть).</p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full min-w-[520px] border-collapse text-xs">
                <thead className="app-table-thead">
                  <tr className="border-b bg-muted/50 text-left text-muted-foreground">
                    <th className="px-2 py-2 font-medium">Дата</th>
                    <th className="px-2 py-2 font-medium">Тип</th>
                    <th className="px-2 py-2 font-medium text-right">Сумма</th>
                    <th className="px-2 py-2 font-medium">Заказ</th>
                    <th className="px-2 py-2 font-medium">Примечание</th>
                  </tr>
                </thead>
                <tbody>
                  {(paymentsTabQ.data ?? []).map((p) => (
                    <tr key={p.id} className="border-b last:border-0">
                      <td className="px-2 py-2 whitespace-nowrap text-muted-foreground">
                        {new Date(p.created_at).toLocaleString()}
                      </td>
                      <td className="px-2 py-2">{p.payment_type}</td>
                      <td className="px-2 py-2 text-right font-mono tabular-nums">
                        {formatNumberGrouped(p.amount, { maxFractionDigits: 2 })}
                      </td>
                      <td className="px-2 py-2 font-mono">
                        {p.order_id != null && p.order_number ? (
                          <Link
                            className="text-primary underline-offset-2 hover:underline"
                            href={`/orders/${p.order_id}`}
                          >
                            {p.order_number}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-2 py-2 max-w-[200px] truncate">{p.note ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {(paymentsTabQ.data ?? []).length === 0 ? (
                <p className="p-4 text-center text-xs text-muted-foreground">Пока нет записей.</p>
              ) : null}
            </div>
          )}
        </div>
      ) : null}

      {tab === "audit" ? (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Журнал PATCH, движений баланса и объединений (админ/оператор).
          </p>
          {auditQuery.isLoading ? (
            <p className="text-xs text-muted-foreground">Загрузка…</p>
          ) : auditQuery.isError ? (
            <p className="text-xs text-destructive">Не удалось загрузить журнал.</p>
          ) : (
            <>
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full min-w-[560px] border-collapse text-xs">
                  <thead className="app-table-thead">
                    <tr className="border-b bg-muted/50 text-left text-muted-foreground">
                      <th className="px-2 py-2 font-medium">Время</th>
                      <th className="px-2 py-2 font-medium">Действие</th>
                      <th className="px-2 py-2 font-medium">Кто</th>
                      <th className="px-2 py-2 font-medium">Подробно</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(auditQuery.data?.data ?? []).map((a) => (
                      <tr key={a.id} className="border-b last:border-0 align-top">
                        <td className="px-2 py-2 whitespace-nowrap text-muted-foreground">
                          {new Date(a.created_at).toLocaleString()}
                        </td>
                        <td className="px-2 py-2 font-medium">{auditActionLabel(a.action)}</td>
                        <td className="px-2 py-2 font-mono">{a.user_login ?? "—"}</td>
                        <td className="px-2 py-2 font-mono text-[11px] break-all max-w-[280px]">
                          {auditDetailJson(a.detail)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {auditQuery.data && auditQuery.data.total > auditQuery.data.limit ? (
                <div className="flex items-center gap-2 text-xs">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={auditPage <= 1}
                    onClick={() => setAuditPage((p) => Math.max(1, p - 1))}
                  >
                    Назад
                  </Button>
                  <span className="text-muted-foreground">
                    {formatGroupedInteger(auditPage)} /{" "}
                    {formatGroupedInteger(Math.max(1, Math.ceil(auditQuery.data.total / auditQuery.data.limit)))}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={auditPage * auditQuery.data.limit >= auditQuery.data.total}
                    onClick={() => setAuditPage((p) => p + 1)}
                  >
                    Вперёд
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </div>
      ) : null}

      <DateRangePopover
        open={reconRangeOpen}
        onOpenChange={setReconRangeOpen}
        anchorRef={reconRangeAnchorRef}
        dateFrom={reconDateFrom}
        dateTo={reconDateTo}
        onApply={({ dateFrom, dateTo }) => {
          setReconDateFrom(dateFrom);
          setReconDateTo(dateTo);
        }}
      />
    </div>
  );
}

/** Zakazlar jadvalida klient ustuniga — ixcham havola. */
export function ClientOrdersSnippet({
  tenantSlug,
  clientId,
  limit = 8
}: {
  tenantSlug: string;
  clientId: number;
  limit?: number;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["orders", tenantSlug, 1, "", clientId],
    staleTime: STALE.list,
    queryFn: async () => {
      const params = new URLSearchParams({
        page: "1",
        limit: String(limit),
        client_id: String(clientId)
      });
      const { data: body } = await api.get<{
        data: Array<{
          id: number;
          number: string;
          status: string;
          total_sum: string;
          created_at: string;
        }>;
        total: number;
      }>(`/api/${tenantSlug}/orders?${params}`);
      return body;
    }
  });

  if (isLoading) {
    return <p className="text-xs text-muted-foreground">Загрузка заказов…</p>;
  }
  const rows = data?.data ?? [];
  if (rows.length === 0) {
    return <p className="text-xs text-muted-foreground">Заказов пока нет.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full min-w-[480px] border-collapse text-xs">
        <thead className="app-table-thead">
          <tr className="border-b bg-muted/50 text-left text-muted-foreground">
            <th className="px-2 py-2 font-medium">Номер</th>
            <th className="px-2 py-2 font-medium">Статус</th>
            <th className="px-2 py-2 font-medium text-right">Итого</th>
            <th className="px-2 py-2 font-medium w-20" />
          </tr>
        </thead>
        <tbody>
          {rows.map((o) => (
            <tr key={o.id} className="border-b last:border-0">
              <td className="px-2 py-2 font-mono">{o.number}</td>
              <td className="px-2 py-2">{ORDER_STATUS_LABELS[o.status] ?? o.status}</td>
              <td className="px-2 py-2 text-right tabular-nums">
                {formatNumberGrouped(o.total_sum, { maxFractionDigits: 2 })}
              </td>
              <td className="px-2 py-2">
                <Link
                  className="text-primary underline-offset-2 hover:underline"
                  href={`/orders/${o.id}`}
                >
                  Открыть
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {data && data.total > rows.length ? (
        <p className="px-2 py-2 text-[11px] text-muted-foreground border-t">
          + ещё {formatGroupedInteger(data.total - rows.length)} шт.{" "}
          <Link className="text-primary underline" href={`/orders?client_id=${clientId}`}>
            Все
          </Link>
        </p>
      ) : null}
    </div>
  );
}
