"use client";

import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { STALE } from "@/lib/query-stale";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { buttonVariants } from "@/components/ui/button-variants";
import { FilterSelect } from "@/components/ui/filter-select";
import { MonthYearPickerPopover } from "@/components/ui/month-year-picker-popover";
import { SearchableMultiSelectPanel } from "@/components/ui/searchable-multi-select-panel";
import { downloadXlsxSheet } from "@/lib/download-xlsx";
import { cn } from "@/lib/utils";
import { CalendarDays, FileSpreadsheet, Search, Upload } from "lucide-react";

type ConsignmentAgentApi = {
  id: number;
  code: string | null;
  name: string;
  consignment: boolean;
  consignment_limit_amount: string | null;
  consignment_ignore_previous_months_debt: boolean;
  consignment_updated_at: string | null;
  supervisor_user_id: number | null;
  supervisor_name: string | null;
  outstanding_debt: string;
  remaining_limit: string | null;
};

type SupervisorRow = { id: number; fio: string };

type RowDraft = {
  consignment: boolean;
  ignoreDebt: boolean;
  limitStr: string;
};

const RU_MONTHS_SHORT = [
  "янв.",
  "февр.",
  "мар.",
  "апр.",
  "мая",
  "июня",
  "июля",
  "авг.",
  "сент.",
  "окт.",
  "нояб.",
  "дек."
];

function ymNow(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function formatYearMonthRu(ym: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(ym);
  if (!m) return ym;
  const mo = Number(m[2]);
  const y = m[1];
  if (mo < 1 || mo > 12) return ym;
  return `${RU_MONTHS_SHORT[mo - 1]} ${y}`;
}

const CURRENCY_LABEL = "So'm";

function normLimit(s: string | null | undefined): string {
  return (s ?? "").trim().replace(/\s/g, "").replace(",", ".");
}

/** Лимит задан и > 0 — тогда доступна опция «без долгов прошлых месяцев» */
function hasPositiveLimit(s: string | null | undefined): boolean {
  const n = normLimit(s);
  if (n === "") return false;
  const v = Number.parseFloat(n);
  return Number.isFinite(v) && v > 0;
}

/** Ввод лимита: только цифры и одна точка (в черновике — для API) */
function sanitizeLimitTyping(input: string): string {
  let t = input.replace(/\s/g, "").replace(",", ".");
  t = t.replace(/[^\d.]/g, "");
  const di = t.indexOf(".");
  if (di === -1) return t;
  const intp = t.slice(0, di);
  const frac = t.slice(di + 1).replace(/\./g, "");
  return `${intp}.${frac}`;
}

/** Чтение сумм: группы по 3 знака (как 2 434 342), ru-RU */
function formatAmountRuReadable(raw: string | null | undefined): string {
  const n = normLimit(raw ?? "");
  if (n === "") return "";
  const x = Number.parseFloat(n);
  if (!Number.isFinite(x)) return String(raw ?? "").trim();
  return x.toLocaleString("ru-RU", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function formatRemainingCell(raw: string | null | undefined): string {
  if (raw == null || raw === "" || raw === "—") return "—";
  return formatAmountRuReadable(raw);
}

function baseDraft(r: ConsignmentAgentApi): RowDraft {
  return {
    consignment: r.consignment,
    ignoreDebt: r.consignment_ignore_previous_months_debt,
    limitStr: r.consignment_limit_amount ?? ""
  };
}

function isRowDirty(r: ConsignmentAgentApi, d: RowDraft | undefined): boolean {
  if (!d) return false;
  const b = baseDraft(r);
  return (
    d.consignment !== b.consignment ||
    d.ignoreDebt !== b.ignoreDebt ||
    normLimit(d.limitStr) !== normLimit(b.limitStr)
  );
}

function buildConsignmentBulkRow(
  r: ConsignmentAgentApi,
  d: RowDraft
): {
  user_id: number;
  consignment: boolean;
  consignment_limit_amount: string | null;
  consignment_ignore_previous_months_debt: boolean;
} {
  const lim = normLimit(d.limitStr);
  const limitPayload = lim === "" ? null : d.limitStr.trim().replace(/\s/g, "").replace(",", ".");
  const ignorePayload = limitPayload == null || !d.consignment ? false : d.ignoreDebt;
  return {
    user_id: r.id,
    consignment: d.consignment,
    consignment_limit_amount: limitPayload,
    consignment_ignore_previous_months_debt: ignorePayload
  };
}

function parseSum(nums: (string | null | undefined)[]): string {
  let t = 0;
  for (const x of nums) {
    if (x == null || x === "" || x === "—") continue;
    const n = Number.parseFloat(String(x).replace(/\s/g, "").replace(",", "."));
    if (Number.isFinite(n)) t += n;
  }
  return t.toLocaleString("ru-RU", { maximumFractionDigits: 2 });
}

export function ConsignmentWorkspace({ tenantSlug }: { tenantSlug: string }) {
  const qc = useQueryClient();
  const importInputRef = useRef<HTMLInputElement>(null);
  const monthPickerAnchorRef = useRef<HTMLButtonElement>(null);
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);
  const [yearMonth, setYearMonth] = useState(ymNow);
  const [supervisorSelected, setSupervisorSelected] = useState<Set<string>>(() => new Set());
  const [consFilter, setConsFilter] = useState<"" | "yes" | "no">("");
  const [search, setSearch] = useState("");
  const [drafts, setDrafts] = useState<Record<number, RowDraft>>({});
  const [toast, setToast] = useState<string | null>(null);
  const [groupSearch, setGroupSearch] = useState<Record<string, string>>({});
  const [savingGroupKey, setSavingGroupKey] = useState<string | null>(null);
  const [savingAll, setSavingAll] = useState(false);
  const [limitFocusedRowId, setLimitFocusedRowId] = useState<number | null>(null);

  const supervisorsQ = useQuery({
    queryKey: ["supervisors", tenantSlug, "consignment"],
    enabled: Boolean(tenantSlug),
    staleTime: STALE.list,
    queryFn: async () => {
      const { data } = await api.get<{ data: SupervisorRow[] }>(`/api/${tenantSlug}/supervisors`);
      return data.data;
    }
  });

  const supervisorPanelItems = useMemo(
    () => [
      { id: "__no_sup__", title: "Агенты без супервайзера" },
      ...(supervisorsQ.data ?? []).map((s) => ({ id: String(s.id), title: s.fio }))
    ],
    [supervisorsQ.data]
  );

  const supKeyForQuery = Array.from(supervisorSelected).sort().join(",");

  const listQ = useQuery({
    queryKey: ["consignment", tenantSlug, yearMonth, supKeyForQuery, consFilter, search],
    enabled: Boolean(tenantSlug),
    staleTime: 30_000,
    queryFn: async () => {
      const p = new URLSearchParams();
      p.set("year_month", yearMonth);
      if (consFilter === "yes" || consFilter === "no") p.set("consignment", consFilter);
      if (search.trim()) p.set("search", search.trim());
      if (supervisorSelected.has("__no_sup__")) {
        p.set("agents_without_supervisor", "1");
      } else {
        const raw = Array.from(supervisorSelected).find((x) => x !== "__no_sup__");
        if (raw) {
          const n = Number.parseInt(raw, 10);
          if (Number.isFinite(n) && n > 0) p.set("supervisor_user_id", String(n));
        }
      }
      const { data } = await api.get<{ data: ConsignmentAgentApi[] }>(
        `/api/${tenantSlug}/consignment/agents?${p.toString()}`
      );
      return data.data;
    }
  });

  const rows = listQ.data ?? [];

  /** После обновления списка с сервера — сбрасываем черновики, совпавшие с данными */
  useEffect(() => {
    setDrafts((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const r of rows) {
        const d = next[r.id];
        if (d && !isRowDirty(r, d)) {
          delete next[r.id];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [rows]);

  const grouped = useMemo(() => {
    const m = new Map<string, ConsignmentAgentApi[]>();
    for (const r of rows) {
      const key = r.supervisor_name?.trim() || "Без супервайзера";
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(r);
    }
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0], "ru"));
  }, [rows]);

  const toggleSupervisorSingleSelect: Dispatch<SetStateAction<Set<string>>> = (action) => {
    setSupervisorSelected((prev) => {
      const next = typeof action === "function" ? action(prev) : action;
      if (next.size === 0) return next;
      const last = Array.from(next).at(-1)!;
      return new Set([last]);
    });
  };

  const updateDraft = (r: ConsignmentAgentApi, patch: Partial<RowDraft>) => {
    setDrafts((prev) => {
      const cur = prev[r.id] ?? baseDraft(r);
      let nextPatch = { ...patch };
      if (patch.consignment === false) {
        nextPatch = { ...nextPatch, ignoreDebt: false };
      }
      const merged = { ...cur, ...nextPatch };
      if (patch.limitStr !== undefined && !hasPositiveLimit(patch.limitStr)) {
        merged.ignoreDebt = false;
      }
      return { ...prev, [r.id]: merged };
    });
  };

  const patchAllDrafts = (list: ConsignmentAgentApi[], patch: Partial<RowDraft>) => {
    setDrafts((prev) => {
      const next = { ...prev };
      for (const r of list) {
        let cur = { ...(next[r.id] ?? baseDraft(r)), ...patch };
        if (patch.consignment === false) cur.ignoreDebt = false;
        if (patch.limitStr !== undefined && !hasPositiveLimit(patch.limitStr)) cur.ignoreDebt = false;
        next[r.id] = cur;
      }
      return next;
    });
  };

  /** Галочка «без долгов…» только при лимите & вкл. консигнации */
  const patchAllIgnoreDebtInGroup = (list: ConsignmentAgentApi[], value: boolean) => {
    setDrafts((prev) => {
      const next = { ...prev };
      for (const r of list) {
        const cur = next[r.id] ?? baseDraft(r);
        const limStr = cur.limitStr ?? r.consignment_limit_amount ?? "";
        if (!cur.consignment || !hasPositiveLimit(limStr)) {
          next[r.id] = { ...cur, ignoreDebt: false };
        } else {
          next[r.id] = { ...cur, ignoreDebt: value };
        }
      }
      return next;
    });
  };

  const rowConsignment = (r: ConsignmentAgentApi) =>
    drafts[r.id]?.consignment ?? r.consignment;
  const rowIgnoreDebt = (r: ConsignmentAgentApi) =>
    drafts[r.id]?.ignoreDebt ?? r.consignment_ignore_previous_months_debt;

  const cancelDraftsInList = (list: ConsignmentAgentApi[]) => {
    setDrafts((prev) => {
      const next = { ...prev };
      for (const r of list) delete next[r.id];
      return next;
    });
  };

  const saveGroupDrafts = async (groupTitle: string, visible: ConsignmentAgentApi[]) => {
    const dirty = visible.filter((r) => isRowDirty(r, drafts[r.id]));
    if (dirty.length === 0) return;
    setSavingGroupKey(groupTitle);
    try {
      const body = {
        rows: dirty.map((r) => buildConsignmentBulkRow(r, drafts[r.id]!))
      };
      await api.patch(`/api/${tenantSlug}/consignment/agents/bulk-rows`, body);
      cancelDraftsInList(dirty);
      setToast(`Сохранено строк: ${dirty.length}`);
      void qc.invalidateQueries({ queryKey: ["consignment", tenantSlug] });
      void qc.invalidateQueries({ queryKey: ["staff", tenantSlug, "agents"] });
    } catch {
      setToast("Ошибка сохранения — проверьте данные и права");
    } finally {
      setSavingGroupKey(null);
    }
  };

  const anyDirtyGlobal = useMemo(
    () => rows.some((r) => isRowDirty(r, drafts[r.id])),
    [rows, drafts]
  );

  const saveAllDrafts = async () => {
    const dirty = rows.filter((r) => isRowDirty(r, drafts[r.id]));
    if (dirty.length === 0) return;
    setSavingAll(true);
    try {
      const body = {
        rows: dirty.map((r) => buildConsignmentBulkRow(r, drafts[r.id]!))
      };
      await api.patch(`/api/${tenantSlug}/consignment/agents/bulk-rows`, body);
      cancelDraftsInList(dirty);
      setToast(`Сохранено изменений: ${dirty.length}`);
      void qc.invalidateQueries({ queryKey: ["consignment", tenantSlug] });
      void qc.invalidateQueries({ queryKey: ["staff", tenantSlug, "agents"] });
    } catch {
      setToast("Ошибка сохранения — проверьте данные и права");
    } finally {
      setSavingAll(false);
    }
  };

  const groupHasDirty = (visible: ConsignmentAgentApi[]) =>
    visible.some((r) => isRowDirty(r, drafts[r.id]));

  const exportExcel = async () => {
    const headers = [
      "Код",
      "Название Т.П.",
      "Валюта",
      "Вкл/откл консигнация",
      "Дата последнего изменения",
      "Лимит без учёта долгов за прошлые месяцы",
      "Установленный лимит",
      "Текущий лимит",
      "Супервайзер"
    ];
    const dataRows = rows.map((r) => [
      r.code ?? "",
      r.name,
      CURRENCY_LABEL,
      r.consignment ? "Да" : "Нет",
      r.consignment_updated_at
        ? new Date(r.consignment_updated_at).toLocaleString("ru-RU")
        : "",
      r.consignment_ignore_previous_months_debt ? "Да" : "Нет",
      r.consignment_limit_amount ?? "",
      r.remaining_limit ?? "",
      r.supervisor_name ?? "—"
    ]);
    await downloadXlsxSheet(
      `konsignatsiya-${yearMonth}.xlsx`,
      "Консигнация",
      headers,
      dataRows,
      { colWidths: [10, 28, 8, 12, 18, 14, 14, 14, 22] }
    );
  };

  const filterRowsInGroup = (groupKey: string, list: ConsignmentAgentApi[]) => {
    const q = (groupSearch[groupKey] ?? "").trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (r) =>
        (r.code ?? "").toLowerCase().includes(q) ||
        r.name.toLowerCase().includes(q)
    );
  };

  const limitStrForRow = (r: ConsignmentAgentApi) =>
    drafts[r.id]?.limitStr ?? r.consignment_limit_amount ?? "";

  const displayRow = (r: ConsignmentAgentApi) => {
    const d = drafts[r.id];
    const consignment = d?.consignment ?? r.consignment;
    const limitStr = d?.limitStr ?? r.consignment_limit_amount ?? "";
    const canIgnore = consignment && hasPositiveLimit(limitStr);
    const rawIgnore = d?.ignoreDebt ?? r.consignment_ignore_previous_months_debt;
    return {
      consignment,
      ignoreDebt: canIgnore && rawIgnore,
      limitStr,
      remaining: r.remaining_limit,
      ignoreStale:
        d != null &&
        canIgnore &&
        d.ignoreDebt !== r.consignment_ignore_previous_months_debt,
      canIgnoreDebt: canIgnore
    };
  };

  return (
    <div className="space-y-0">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Консигнация</h1>
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={importInputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={() => {
              setToast("Импорт из Excel — в разработке");
              if (importInputRef.current) importInputRef.current.value = "";
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => void exportExcel()}
            disabled={rows.length === 0}
          >
            <FileSpreadsheet className="size-4" />
            Excel
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => importInputRef.current?.click()}
          >
            <Upload className="size-4" />
            Импортировать с excel
          </Button>
        </div>
      </div>

      {toast ? (
        <p
          className="mb-3 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-foreground"
          role="status"
        >
          {toast}{" "}
          <button type="button" className="ml-2 text-primary underline" onClick={() => setToast(null)}>
            закрыть
          </button>
        </p>
      ) : null}

      <div className="orders-hub-section orders-hub-section--filters mb-8 md:mb-10">
        <Card className="rounded-none border-0 bg-transparent shadow-none hover:shadow-none">
          <CardContent className="p-5 sm:p-6">
            <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-foreground/80">Фильтр</p>
            <div className="flex flex-wrap items-end gap-x-6 gap-y-4 md:gap-x-8">
              <div className="grid min-w-[10rem] max-w-[13.5rem] flex-[1_1_10rem] gap-2">
                <Label className="text-xs font-medium text-foreground/88">Месяц и год</Label>
                <button
                  ref={monthPickerAnchorRef}
                  type="button"
                  className={cn(
                    buttonVariants({ variant: "outline", size: "sm" }),
                    "h-9 w-full justify-start gap-2 font-normal",
                    monthPickerOpen && "border-primary/60 bg-primary/5"
                  )}
                  aria-expanded={monthPickerOpen}
                  aria-haspopup="dialog"
                  aria-label="Выбрать месяц отчёта"
                  onClick={() => setMonthPickerOpen((o) => !o)}
                >
                  <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 truncate text-sm font-medium capitalize tabular-nums text-foreground">
                    {formatYearMonthRu(yearMonth)}
                  </span>
                </button>
                <MonthYearPickerPopover
                  open={monthPickerOpen}
                  onOpenChange={setMonthPickerOpen}
                  anchorRef={monthPickerAnchorRef}
                  value={yearMonth}
                  onChange={(ym) => setYearMonth(ym)}
                />
              </div>
              <div className="grid min-w-[12rem] max-w-[20rem] flex-[1_1_14rem] gap-2">
                <SearchableMultiSelectPanel
                  label="Супервайзер"
                  items={supervisorPanelItems}
                  selected={supervisorSelected}
                  onSelectedChange={toggleSupervisorSingleSelect}
                  loading={supervisorsQ.isLoading}
                  searchPlaceholder="Поиск"
                  triggerPlaceholder="Все"
                  emptyMessage="Нет супервайзеров"
                  className="w-full"
                  minPopoverWidth={320}
                />
              </div>
              <label className="grid min-w-[9.5rem] max-w-[11rem] flex-[0_1_auto] gap-2 text-xs font-medium text-foreground/88">
                <span>Консигнация</span>
                <FilterSelect
                  className="h-9 w-full"
                  emptyLabel="Все"
                  value={consFilter}
                  onChange={(e) => setConsFilter(e.target.value as "" | "yes" | "no")}
                >
                  <option value="yes">Да</option>
                  <option value="no">Нет</option>
                </FilterSelect>
              </label>
              <div className="grid min-w-[12rem] flex-[1_1_16rem] gap-2">
                <Label className="text-xs font-medium text-foreground/88">Поиск</Label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="h-9 pl-9"
                    placeholder="Код, название Т.П.…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap items-end gap-3 border-border/50 pt-1 md:border-l md:pl-6 md:pt-0">
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  className="h-9 shrink-0 bg-emerald-600 px-4 text-white hover:bg-emerald-700 disabled:opacity-50"
                  disabled={!anyDirtyGlobal || savingAll || savingGroupKey != null}
                  onClick={() => void saveAllDrafts()}
                >
                  Сохранить всё
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="h-9 shrink-0 px-4"
                  disabled={savingAll || savingGroupKey != null}
                  onClick={() => void listQ.refetch()}
                >
                  Обновить
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {listQ.isLoading ? (
        <div className="mt-6 rounded-lg border bg-card py-12 text-center text-sm text-muted-foreground">
          Загрузка…
        </div>
      ) : null}
      {listQ.isError ? (
        <div className="mt-6 rounded-lg border border-destructive/40 bg-destructive/5 py-12 text-center text-sm text-destructive">
          Не удалось загрузить список
        </div>
      ) : null}

      {!listQ.isLoading && !listQ.isError && grouped.length === 0 ? (
        <div className="mt-6 rounded-lg border bg-card py-12 text-center text-sm text-muted-foreground">
          Нет данных
        </div>
      ) : null}

      <div className="mt-6 space-y-3 md:mt-8 md:space-y-4">
        {grouped.map(([groupTitle, groupRows]) => {
          const visible = filterRowsInGroup(groupTitle, groupRows);
          const consAllOn =
            visible.length > 0 && visible.every((r) => rowConsignment(r));
          const consSome = visible.some((r) => rowConsignment(r));
          const consMixed = consSome && !consAllOn;
          const ignEligible = visible.filter(
            (r) => rowConsignment(r) && hasPositiveLimit(limitStrForRow(r))
          );
          const ignAllOn =
            ignEligible.length > 0 && ignEligible.every((r) => rowIgnoreDebt(r));
          const ignSome = ignEligible.some((r) => rowIgnoreDebt(r));
          const ignMixed = ignSome && !ignAllOn;
          const dirty = groupHasDirty(visible);
          const sumEstablished = parseSum(visible.map((r) => r.consignment_limit_amount));
          const sumCurrent = parseSum(visible.map((r) => r.remaining_limit));
          return (
            <div
              key={groupTitle}
              className="orders-hub-section orders-hub-section--table !mb-3 overflow-hidden last:!mb-0"
            >
              <Card className="overflow-hidden rounded-none border-0 bg-transparent shadow-none hover:shadow-none">
                <CardContent className="p-0">
              <div className="flex flex-col gap-2 border-b border-border/50 bg-muted/15 px-3 py-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-x-3 sm:gap-y-2 sm:px-4">
                <div className="min-w-0 sm:pr-2">
                  <h3 className="truncate text-sm font-semibold leading-tight text-foreground">
                    {groupTitle}
                  </h3>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                  <div className="relative w-full min-w-0 sm:w-[min(100%,240px)]">
                    <Search className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      className="h-8 pl-8 text-xs"
                      placeholder="Поиск в группе…"
                      value={groupSearch[groupTitle] ?? ""}
                      onChange={(e) =>
                        setGroupSearch((g) => ({ ...g, [groupTitle]: e.target.value }))
                      }
                    />
                  </div>
                  <div className="flex shrink-0 flex-row flex-nowrap items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="default"
                      className="h-8 bg-emerald-600 text-white hover:bg-emerald-700"
                      disabled={
                        !dirty || savingGroupKey === groupTitle || savingAll
                      }
                      onClick={() => void saveGroupDrafts(groupTitle, visible)}
                    >
                      Сохранить
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8"
                      disabled={
                        !dirty || savingGroupKey === groupTitle || savingAll
                      }
                      onClick={() => cancelDraftsInList(visible)}
                    >
                      Отменить
                    </Button>
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto bg-card">
                <table className="w-full min-w-[860px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/20 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      <th className="px-2 py-1.5">Код</th>
                      <th className="min-w-[12rem] px-2 py-1.5">Название Т.П.</th>
                      <th className="w-[5.5rem] px-2 py-1.5">Валюта</th>
                      <th className="w-[7rem] px-2 py-1.5 text-center align-middle normal-case">
                        <div className="flex flex-col items-center gap-1">
                          <input
                            type="checkbox"
                            className="size-4 rounded border-input accent-primary"
                            ref={(el) => {
                              if (el) el.indeterminate = consMixed;
                            }}
                            checked={consAllOn}
                            onChange={() => patchAllDrafts(visible, { consignment: !consAllOn })}
                            disabled={visible.length === 0}
                            aria-label="Включить или выключить консигнацию для всех строк группы"
                            title="Отметить все: консигнация вкл/откл"
                          />
                          <span className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                            вкл/откл
                          </span>
                        </div>
                      </th>
                      <th className="min-w-[9rem] px-2 py-1.5">Дата изм.</th>
                      <th
                        className="w-[6rem] px-2 py-1.5 text-center align-middle leading-tight normal-case"
                        title="Без учёта долгов за прошлые месяцы"
                      >
                        <div className="flex flex-col items-center gap-1">
                          <input
                            type="checkbox"
                            className="size-4 rounded border-input accent-primary"
                            ref={(el) => {
                              if (el) el.indeterminate = ignMixed;
                            }}
                            checked={ignAllOn}
                            onChange={() => patchAllIgnoreDebtInGroup(visible, !ignAllOn)}
                            disabled={visible.length === 0 || ignEligible.length === 0}
                            aria-label="Включить опцию «без долгов прошлых месяцев» для всех строк группы (где задан лимит)"
                            title="Только для строк с лимитом и включённой консигнацией"
                          />
                          <span className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground leading-tight">
                            без долг.
                            <br />
                            прошл. мес.
                          </span>
                        </div>
                      </th>
                      <th className="min-w-[8rem] px-2 py-1.5 text-right">Установл. лимит</th>
                      <th className="min-w-[7rem] px-2 py-1.5 text-right">Текущий лимит</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">
                          Нет строк
                        </td>
                      </tr>
                    ) : null}
                    {visible.map((r) => {
                      const disp = displayRow(r);
                      const rowDirty = isRowDirty(r, drafts[r.id]);
                      return (
                        <tr
                          key={r.id}
                          className={cn(
                            "border-b border-border/60 hover:bg-muted/15",
                            rowDirty && "bg-amber-500/5"
                          )}
                        >
                          <td className="px-2 py-1.5 font-mono text-xs align-middle">{r.code ?? "—"}</td>
                          <td className="px-2 py-1.5 align-middle">{r.name}</td>
                          <td className="px-2 py-1.5 align-middle text-xs text-muted-foreground">
                            {CURRENCY_LABEL}
                          </td>
                          <td className="px-2 py-1.5 text-center align-middle">
                            <input
                              type="checkbox"
                              className="size-4 rounded border-input accent-primary"
                              checked={disp.consignment}
                              onChange={(e) => updateDraft(r, { consignment: e.target.checked })}
                              title="Консигнация для агента"
                            />
                          </td>
                          <td className="px-2 py-1.5 align-middle text-xs text-muted-foreground tabular-nums">
                            {r.consignment_updated_at
                              ? new Date(r.consignment_updated_at).toLocaleString("ru-RU")
                              : "—"}
                          </td>
                          <td className="px-2 py-1.5 text-center align-middle">
                            <input
                              type="checkbox"
                              className="size-4 rounded border-input accent-primary disabled:opacity-40"
                              checked={disp.ignoreDebt}
                              disabled={!disp.canIgnoreDebt}
                              onChange={(e) => updateDraft(r, { ignoreDebt: e.target.checked })}
                              title={
                                disp.canIgnoreDebt
                                  ? "Лимит без учёта долгов за прошлые месяцы (только с лимитом и вкл. консигнацией)"
                                  : "Сначала включите консигнацию и укажите лимит > 0"
                              }
                            />
                          </td>
                          <td className="px-2 py-1.5 text-right align-middle">
                            <Input
                              className="h-7 w-full min-w-[7.5rem] text-right text-xs tabular-nums disabled:opacity-50"
                              inputMode="decimal"
                              value={
                                limitFocusedRowId === r.id
                                  ? disp.limitStr
                                  : formatAmountRuReadable(disp.limitStr)
                              }
                              disabled={!disp.consignment}
                              onFocus={() => setLimitFocusedRowId(r.id)}
                              onBlur={() => setLimitFocusedRowId(null)}
                              onChange={(e) =>
                                updateDraft(r, { limitStr: sanitizeLimitTyping(e.target.value) })
                              }
                              placeholder="—"
                              title={
                                disp.consignment
                                  ? "Установленный лимит (группы по 3 цифры при просмотре)"
                                  : "Включите консигнацию для строки"
                              }
                            />
                          </td>
                          <td
                            className={cn(
                              "px-2 py-1.5 text-right text-xs tabular-nums align-middle",
                              disp.remaining != null &&
                                disp.remaining !== "" &&
                                disp.remaining !== "—" &&
                                Number.parseFloat(
                                  String(disp.remaining).replace(/\s/g, "").replace(",", ".")
                                ) < 0
                                ? "font-semibold text-destructive"
                                : "text-foreground"
                            )}
                            title={
                              disp.ignoreStale
                                ? "После сохранения «без долгов…» пересчитается на сервере"
                                : undefined
                            }
                          >
                            {formatRemainingCell(disp.remaining)}
                            {disp.ignoreStale ? (
                              <span className="ml-0.5 text-[10px] text-amber-600">*</span>
                            ) : null}
                          </td>
                        </tr>
                      );
                    })}
                    {visible.length > 0 ? (
                      <tr className="border-t border-border bg-muted/35 font-semibold">
                        <td colSpan={6} className="px-2 py-1.5 text-right text-sm text-foreground">
                          Итого по группе:
                        </td>
                        <td className="px-2 py-1.5 text-right font-mono text-sm text-sky-700 dark:text-sky-400 tabular-nums">
                          {sumEstablished}
                        </td>
                        <td className="px-2 py-1.5 text-right font-mono text-sm text-teal-700 dark:text-teal-400 tabular-nums">
                          {sumCurrent}
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
                </CardContent>
              </Card>
            </div>
          );
        })}
      </div>
    </div>
  );
}
