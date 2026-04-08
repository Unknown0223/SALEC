"use client";

import type { ClientRow } from "@/lib/client-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import {
  formatDigitsGroupedLoose,
  formatGroupedInteger,
  formatNumberGrouped
} from "@/lib/format-numbers";
import { useEffectiveRole } from "@/lib/auth-store";
import { ORDER_STATUS_LABELS } from "@/lib/order-status";
import { cn } from "@/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";

export type ClientDetailApiRow = ClientRow & {
  phone_normalized: string | null;
  open_orders_total: string;
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
    "client.patch": "Rekvizitlar",
    "client.balance_movement": "Balans",
    "client.merge": "Birlashtirish",
    "client.payment": "To‘lov",
    "client.sales_return": "Qaytarish"
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

function localYmd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function parseFilenameFromDisposition(cd: string | undefined): string | null {
  if (!cd) return null;
  const m = /filename\*?=(?:UTF-8'')?["']?([^"';]+)/i.exec(cd);
  return m?.[1] ? decodeURIComponent(m[1].trim()) : null;
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
  const [reconPdfLoading, setReconPdfLoading] = useState(false);
  const [reconPdfError, setReconPdfError] = useState<string | null>(null);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["client", tenantSlug, clientId],
    queryFn: async () => {
      const { data: body } = await api.get<ClientDetailApiRow>(
        `/api/${tenantSlug}/clients/${clientId}`
      );
      return body;
    }
  });

  const movementsQuery = useQuery({
    queryKey: ["client-balance-movements", tenantSlug, clientId, balPage],
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
        throw new Error("Summa 0 dan farq qilishi kerak");
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
        setBalanceFormError("Faqat admin kiritishi mumkin.");
        return;
      }
      if (ax.response?.data?.error === "BadDelta") {
        setBalanceFormError("Noto‘g‘ri summa.");
        return;
      }
      setBalanceFormError(e instanceof Error ? e.message : "Xato");
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
        throw new Error("PDF tayyor bo‘lmadi");
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
      setReconPdfError(e instanceof Error ? e.message : "PDF yuklashda xatolik");
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
        {error instanceof Error ? error.message : "Klient topilmadi yoki xato."}
      </p>
    );
  }

  const balTotalPages =
    movementsQuery.data != null
      ? Math.max(1, Math.ceil(movementsQuery.data.total / movementsQuery.data.limit))
      : 1;

  return (
    <div className="flex flex-col gap-6 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold tracking-tight">{data.name}</h2>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/clients/${clientId}/edit`}
            className="inline-flex h-9 items-center justify-center rounded-md bg-secondary px-3 text-sm font-medium text-secondary-foreground shadow-sm transition-colors hover:bg-secondary/80"
          >
            Tahrir kartochka
          </Link>
          <Link
            href={`/orders?client_id=${clientId}`}
            className="inline-flex h-9 items-center justify-center rounded-md border border-input bg-background px-3 text-sm font-medium shadow-sm transition-colors hover:bg-muted"
          >
            Shu mijozning zakazlari
          </Link>
        </div>
      </div>

      {canReconciliationPdf ? (
        <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/20 p-3 sm:flex-row sm:flex-wrap sm:items-end">
          <p className="text-xs font-medium text-muted-foreground sm:w-full">Akt-sverka (PDF)</p>
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <Label htmlFor="recon-from" className="text-xs">
                Dan
              </Label>
              <Input
                id="recon-from"
                type="date"
                className="h-9 w-[150px] font-mono text-xs"
                value={reconDateFrom}
                onChange={(ev) => setReconDateFrom(ev.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="recon-to" className="text-xs">
                Gacha
              </Label>
              <Input
                id="recon-to"
                type="date"
                className="h-9 w-[150px] font-mono text-xs"
                value={reconDateTo}
                onChange={(ev) => setReconDateTo(ev.target.value)}
              />
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="h-9"
              disabled={reconPdfLoading}
              onClick={() => void downloadReconciliationPdf()}
            >
              {reconPdfLoading ? "Yuklanmoqda…" : "PDF yuklab olish"}
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
            ["main", "Asosiy"],
            ["balance", "Balans"],
            ["orders", "Zakazlar"],
            ["payments", "To‘lovlar"],
            ["audit", "Tarix"]
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
        <div className="overflow-x-auto rounded-lg border shadow-sm">
          <table className="w-full min-w-[520px] border-collapse text-sm">
            <tbody>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground w-44">
                  Telefon
                </th>
                <td className="px-4 py-3 font-mono text-xs">
                  {data.phone?.trim() ? formatDigitsGroupedLoose(data.phone) : "—"}
                </td>
              </tr>
              <tr className="border-b border-border">
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                  Telefon (normal.)
                </th>
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                  {data.phone_normalized?.trim() ? formatDigitsGroupedLoose(data.phone_normalized) : "—"}
                </td>
              </tr>
              <tr className="border-b border-border">
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Manzil</th>
                <td className="px-4 py-3">
                  {data.address ? (
                    <span>
                      {data.address}{" "}
                      <a
                        href={`https://yandex.com/maps/?text=${encodeURIComponent(data.address)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary text-xs underline-offset-2 hover:underline whitespace-nowrap"
                      >
                        Xaritada ochish
                      </a>
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
              <tr className="border-b border-border">
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Toifa</th>
                <td className="px-4 py-3">{data.category ?? "—"}</td>
              </tr>
              <tr className="border-b border-border">
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                  Kredit limiti
                </th>
                <td className="px-4 py-3 tabular-nums font-mono text-xs">
                  {formatNumberGrouped(data.credit_limit, { maxFractionDigits: 2 })}
                </td>
              </tr>
              <tr className="border-b border-border">
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                  Hisob saldosi
                </th>
                <td className="px-4 py-3 tabular-nums font-mono text-xs">
                  {formatNumberGrouped(data.account_balance, { maxFractionDigits: 2 })}
                </td>
              </tr>
              <tr className="border-b border-border">
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                  Ochiq zakazlar (jami)
                </th>
                <td className="px-4 py-3 tabular-nums font-mono text-xs">
                  {formatNumberGrouped(data.open_orders_total, { maxFractionDigits: 2 })}
                </td>
              </tr>
              {showCreditHint ? (
                <>
                  <tr className="border-b border-border bg-muted/15">
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground align-top">
                      Kredit yuki
                    </th>
                    <td className="px-4 py-3">
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
                          {((openNum / creditLimitNum) * 100).toFixed(1)}% limitdan band
                        </p>
                      </div>
                    </td>
                  </tr>
                  <tr className="border-b border-border bg-muted/15">
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                      Qolgan «joy»
                    </th>
                    <td className="px-4 py-3 tabular-nums text-xs">
                      {formatNumberGrouped(creditLimitNum - openNum, { maxFractionDigits: 2 })} (limit − ochiq
                      zakazlar; saldo alohida)
                    </td>
                  </tr>
                </>
              ) : null}
              <tr className="border-b border-border">
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Holat</th>
                <td className="px-4 py-3">
                  <span
                    className={
                      data.is_active ? "text-green-700 dark:text-green-400" : "text-muted-foreground"
                    }
                  >
                    {data.is_active ? "Faol" : "Nofaol"}
                  </span>
                </td>
              </tr>
              <tr className="border-b border-border">
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                  Agent ID
                </th>
                <td className="px-4 py-3 font-mono text-xs">
                  {data.agent_id != null ? formatGroupedInteger(data.agent_id) : "—"}
                </td>
              </tr>
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                  Ro‘yxatga olingan
                </th>
                <td className="px-4 py-3 text-muted-foreground text-xs">
                  {new Date(data.created_at).toLocaleString()}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      ) : null}

      {tab === "balance" ? (
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Joriy saldo:{" "}
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
              <p className="text-sm font-medium">Harakat qo‘shish</p>
              <div className="grid gap-1.5">
                <Label htmlFor="bal-delta">O‘zgarish (UZS, manfiy — chiqim)</Label>
                <Input
                  id="bal-delta"
                  type="text"
                  inputMode="decimal"
                  value={deltaInput}
                  onChange={(e) => setDeltaInput(e.target.value)}
                  disabled={addMovement.isPending}
                  placeholder="masalan 50000 yoki -10000"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="bal-note">Izoh (ixtiyoriy)</Label>
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
                {addMovement.isPending ? "Saqlanmoqda…" : "Qo‘shish"}
              </Button>
            </form>
          ) : (
            <p className="text-xs text-muted-foreground">Harakat qo‘shish faqat admin uchun.</p>
          )}

          {movementsQuery.isLoading ? (
            <p className="text-xs text-muted-foreground">Harakatlar Загрузка…</p>
          ) : movementsQuery.isError ? (
            <p className="text-xs text-destructive">Harakatlarni yuklab bo‘lmadi.</p>
          ) : (
            <>
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full min-w-[480px] border-collapse text-xs">
                  <thead className="app-table-thead">
                    <tr className="border-b bg-muted/50 text-left text-muted-foreground">
                      <th className="px-2 py-2 font-medium">Vaqt</th>
                      <th className="px-2 py-2 font-medium text-right">O‘zgarish</th>
                      <th className="px-2 py-2 font-medium">Izoh</th>
                      <th className="px-2 py-2 font-medium">Kim</th>
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
                    Oldingi
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
                    Keyingi
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
                Barcha zakazlar
              </Link>
            </li>
            <li>
              <Link
                className="text-primary underline-offset-4 hover:underline"
                href={`/orders?client_id=${clientId}`}
              >
                Faqat bu mijoz zakazlari
              </Link>
            </li>
          </ul>
        </div>
      ) : null}

      {tab === "payments" ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">Mijozga bog‘langan to‘lov yozuvlari.</p>
            <Link
              className="text-sm font-medium text-primary underline-offset-4 hover:underline"
              href={`/payments/new?client_id=${clientId}`}
            >
              + Yangi to‘lov
            </Link>
          </div>
          {paymentsTabQ.isLoading ? (
            <p className="text-xs text-muted-foreground">Загрузка…</p>
          ) : paymentsTabQ.isError ? (
            <p className="text-xs text-destructive">Ro‘yxatni yuklab bo‘lmadi (huquq yoki tarmoq).</p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full min-w-[520px] border-collapse text-xs">
                <thead className="app-table-thead">
                  <tr className="border-b bg-muted/50 text-left text-muted-foreground">
                    <th className="px-2 py-2 font-medium">Sana</th>
                    <th className="px-2 py-2 font-medium">Tur</th>
                    <th className="px-2 py-2 font-medium text-right">Summa</th>
                    <th className="px-2 py-2 font-medium">Zakaz</th>
                    <th className="px-2 py-2 font-medium">Izoh</th>
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
                <p className="p-4 text-center text-xs text-muted-foreground">Hozircha yozuv yo‘q.</p>
              ) : null}
            </div>
          )}
        </div>
      ) : null}

      {tab === "audit" ? (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            PATCH, balans harakatlari va birlashtirish jurnali (admin/operator).
          </p>
          {auditQuery.isLoading ? (
            <p className="text-xs text-muted-foreground">Загрузка…</p>
          ) : auditQuery.isError ? (
            <p className="text-xs text-destructive">Jurnalni yuklab bo‘lmadi.</p>
          ) : (
            <>
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full min-w-[560px] border-collapse text-xs">
                  <thead className="app-table-thead">
                    <tr className="border-b bg-muted/50 text-left text-muted-foreground">
                      <th className="px-2 py-2 font-medium">Vaqt</th>
                      <th className="px-2 py-2 font-medium">Harakat</th>
                      <th className="px-2 py-2 font-medium">Kim</th>
                      <th className="px-2 py-2 font-medium">Batafsil</th>
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
                    Oldingi
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
                    Keyingi
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </div>
      ) : null}

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
    return <p className="text-xs text-muted-foreground">Zakazlar Загрузка…</p>;
  }
  const rows = data?.data ?? [];
  if (rows.length === 0) {
    return <p className="text-xs text-muted-foreground">Hozircha zakaz yo‘q.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full min-w-[480px] border-collapse text-xs">
        <thead className="app-table-thead">
          <tr className="border-b bg-muted/50 text-left text-muted-foreground">
            <th className="px-2 py-2 font-medium">Raqam</th>
            <th className="px-2 py-2 font-medium">Holat</th>
            <th className="px-2 py-2 font-medium text-right">Jami</th>
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
                  Ochish
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {data && data.total > rows.length ? (
        <p className="px-2 py-2 text-[11px] text-muted-foreground border-t">
          + yana {formatGroupedInteger(data.total - rows.length)} ta.{" "}
          <Link className="text-primary underline" href={`/orders?client_id=${clientId}`}>
            Hammasi
          </Link>
        </p>
      ) : null}
    </div>
  );
}
