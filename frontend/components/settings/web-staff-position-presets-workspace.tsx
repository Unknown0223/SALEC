"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { HistoryIcon, Loader2Icon, ScrollTextIcon } from "lucide-react";

export type WebStaffPositionPresetRow = {
  id: string;
  label: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  created_by_user_id: number | null;
  created_by_label: string | null;
  deactivated_at: string | null;
  deactivated_by_user_id: number | null;
  deactivated_by_label: string | null;
  /** Saqlangan nom bo‘yicha: veb-panel xodimlari `position` maydoni mos keladiganlar soni */
  linked_operator_count: number;
};

type AuditHistoryRow = {
  id: number;
  action: string;
  payload: unknown;
  actor_user_id: number | null;
  actor_login: string | null;
  created_at: string;
};

type Props = { tenantSlug: string };

type PresetTab = "active" | "inactive";

function invalidateOperatorQueries(qc: ReturnType<typeof useQueryClient>, tenantSlug: string) {
  void qc.invalidateQueries({ queryKey: ["operators", tenantSlug] });
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso?.trim()) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("uz-UZ", { dateStyle: "short", timeStyle: "short" }).format(d);
}

function actionLabelUz(action: string): string {
  switch (action) {
    case "create":
      return "Yaratildi";
    case "patch.label":
      return "Nomi o‘zgartirildi";
    case "deactivate":
      return "Nofaollashtirildi";
    case "reactivate":
      return "Faollashtirildi";
    default:
      return action;
  }
}

function payloadSummary(action: string, payload: unknown): string | null {
  if (payload == null || typeof payload !== "object") return null;
  const o = payload as Record<string, unknown>;
  if (action === "patch.label" && typeof o.from === "string" && typeof o.to === "string") {
    return `«${o.from}» → «${o.to}»`;
  }
  if (typeof o.label === "string") {
    return `«${o.label}»`;
  }
  return null;
}

export function WebStaffPositionPresetsWorkspace({ tenantSlug }: Props) {
  const qc = useQueryClient();
  const [presetTab, setPresetTab] = useState<PresetTab>("active");
  const [createOpen, setCreateOpen] = useState(false);
  const [createLabel, setCreateLabel] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [historyPresetId, setHistoryPresetId] = useState<string | null>(null);

  const listQ = useQuery({
    queryKey: ["operators", tenantSlug, "position-presets-admin"],
    enabled: Boolean(tenantSlug),
    queryFn: async () => {
      const { data } = await api.get<{ data: WebStaffPositionPresetRow[] }>(
        `/api/${tenantSlug}/operators/meta/position-presets`
      );
      return data.data;
    }
  });

  const historyQ = useQuery({
    queryKey: ["operators", tenantSlug, "position-preset-history", historyPresetId],
    enabled: Boolean(tenantSlug) && Boolean(historyPresetId),
    queryFn: async () => {
      const { data } = await api.get<{
        data: AuditHistoryRow[];
        total: number;
      }>(`/api/${tenantSlug}/operators/meta/position-presets/history/${historyPresetId}`);
      return data;
    }
  });

  const rows = listQ.data ?? [];
  const activeRows = useMemo(() => rows.filter((r) => r.is_active), [rows]);
  const inactiveRows = useMemo(() => rows.filter((r) => !r.is_active), [rows]);
  const subset = presetTab === "active" ? activeRows : inactiveRows;
  const mode = presetTab === "active" ? "active" : "inactive";

  useEffect(() => {
    const next: Record<string, string> = {};
    for (const r of rows) {
      next[r.id] = r.label;
    }
    setDrafts(next);
  }, [rows]);

  const createMut = useMutation({
    mutationFn: async (label: string) => {
      const { data } = await api.post<{ data: WebStaffPositionPresetRow }>(
        `/api/${tenantSlug}/operators/meta/position-presets`,
        { label }
      );
      return data.data;
    },
    onSuccess: async () => {
      setCreateOpen(false);
      setCreateLabel("");
      setPresetTab("active");
      await listQ.refetch();
      invalidateOperatorQueries(qc, tenantSlug);
    }
  });

  const patchMut = useMutation({
    mutationFn: async (args: { presetId: string; body: { label?: string; is_active?: boolean } }) => {
      const { data } = await api.patch<{ data: WebStaffPositionPresetRow }>(
        `/api/${tenantSlug}/operators/meta/position-presets/${args.presetId}`,
        args.body
      );
      return data.data;
    },
    onSuccess: async (_, vars) => {
      await listQ.refetch();
      invalidateOperatorQueries(qc, tenantSlug);
      void qc.invalidateQueries({
        queryKey: ["operators", tenantSlug, "position-preset-history", vars.presetId]
      });
      if (vars.body.is_active === false) setPresetTab("inactive");
      if (vars.body.is_active === true) setPresetTab("active");
    }
  });

  const dirtyById = useMemo(() => {
    const m: Record<string, boolean> = {};
    for (const r of rows) {
      const d = (drafts[r.id] ?? r.label).trim();
      m[r.id] = d !== r.label && d.length > 0;
    }
    return m;
  }, [rows, drafts]);

  function setDraft(id: string, v: string) {
    setDrafts((prev) => ({ ...prev, [id]: v }));
  }

  function submitCreate() {
    const t = createLabel.trim();
    if (!t) return;
    createMut.mutate(t);
  }

  const historyTitleRow = rows.find((r) => r.id === historyPresetId);

  const emptyMsg =
    mode === "active"
      ? "Faol lavozim yo‘q — «Yangi lavozim» bilan qo‘shing."
      : "Nofaol lavozim yo‘q.";

  const colCount = 8;

  return (
    <div className="space-y-4">
      {/* Huddi `agents-workspace`: ixcham pastki chiziqli yorliqlar + qo‘shish o‘ngda */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2 border-b border-border" role="tablist" aria-label="Lavozimlar holati">
          <button
            type="button"
            role="tab"
            id="tab-preset-active"
            aria-selected={presetTab === "active"}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm font-medium",
              presetTab === "active"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
            onClick={() => setPresetTab("active")}
          >
            Faol{activeRows.length ? ` (${activeRows.length})` : ""}
          </button>
          <button
            type="button"
            role="tab"
            id="tab-preset-inactive"
            aria-selected={presetTab === "inactive"}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm font-medium",
              presetTab === "inactive"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
            onClick={() => setPresetTab("inactive")}
          >
            Nofaol{inactiveRows.length ? ` (${inactiveRows.length})` : ""}
          </button>
        </div>
        <Button type="button" size="sm" onClick={() => setCreateOpen(true)}>
          Yangi lavozim
        </Button>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Yangi lavozim</DialogTitle>
            <DialogDescription>
              Har bir lavozim alohida yaratiladi. Ro‘yxat veb xodimlar sahifasida tanlov sifatida ishlatiladi.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="preset-create-label">
              Lavozim nomi
            </label>
            <Input
              id="preset-create-label"
              value={createLabel}
              placeholder="Masalan: Kassir"
              onChange={(e) => setCreateLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  submitCreate();
                }
              }}
            />
          </div>
          <DialogFooter className="border-0 bg-transparent p-0 sm:justify-end">
            <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
              Bekor qilish
            </Button>
            <Button
              type="button"
              disabled={!createLabel.trim() || createMut.isPending}
              onClick={submitCreate}
            >
              {createMut.isPending ? "Yaratilmoqda…" : "Yaratish"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="overflow-hidden rounded-xl border border-border/80 bg-card shadow-sm">
        <div
          className="overflow-x-auto"
          role="tabpanel"
          id={presetTab === "active" ? "panel-preset-active" : "panel-preset-inactive"}
          aria-labelledby={presetTab === "active" ? "tab-preset-active" : "tab-preset-inactive"}
        >
          <table className="w-full min-w-[880px] table-fixed text-sm">
            <thead className="border-b border-border/60 bg-muted/40 text-left text-xs font-medium text-muted-foreground">
              <tr>
                <th className="w-9 px-1.5 py-2.5">№</th>
                <th className="w-[200px] max-w-[200px] px-2 py-2.5">Lavozim nomi</th>
                <th
                  className="w-[52px] px-1 py-2.5 text-center"
                  title="Veb xodimlar kartasidagi «Lavozim» maydoni saqlangan shablon nomi bilan mos keladigan akkauntlar soni"
                >
                  Bog‘langan
                </th>
                {mode === "active" ? (
                  <>
                    <th className="w-[128px] whitespace-nowrap px-2 py-2.5">Yaratilgan</th>
                    <th className="w-[120px] px-2 py-2.5">Kim yaratgan</th>
                  </>
                ) : (
                  <>
                    <th className="w-[128px] whitespace-nowrap px-2 py-2.5">Nofaollashtirilgan</th>
                    <th className="w-[120px] px-2 py-2.5">Kim nofaollashtirgan</th>
                  </>
                )}
                <th
                  className="w-11 px-1 py-2.5 text-center"
                  title="Tarix"
                >
                  <span className="sr-only">Tarix</span>
                  <HistoryIcon className="mx-auto size-3.5 opacity-70" aria-hidden />
                </th>
                <th className="w-[76px] px-1 py-2.5 text-center">Saqlash</th>
                <th className="w-[132px] px-1 py-2.5 text-center">
                  {mode === "active" ? (
                    <span title="Nofaollashtirish">Nofaol</span>
                  ) : (
                    <span title="Faollashtirish">Faol qilish</span>
                  )}
                </th>
              </tr>
            </thead>
            <tbody>
              {listQ.isLoading ? (
                <tr>
                  <td colSpan={colCount} className="px-4 py-10 text-center text-muted-foreground">
                    Yuklanmoqda…
                  </td>
                </tr>
              ) : subset.length === 0 ? (
                <tr>
                  <td colSpan={colCount} className="px-4 py-10 text-center text-muted-foreground">
                    {emptyMsg}
                  </td>
                </tr>
              ) : (
                subset.map((r, i) => (
                  <tr key={r.id} className="border-t border-border/50 transition-colors hover:bg-muted/25">
                    <td className="px-1.5 py-2 tabular-nums text-muted-foreground">{i + 1}</td>
                    <td className="w-[200px] max-w-[200px] px-2 py-2">
                      <Input
                        className="h-9 w-full max-w-[184px]"
                        value={drafts[r.id] ?? r.label}
                        placeholder="Lavozim nomi"
                        disabled={patchMut.isPending}
                        onChange={(e) => setDraft(r.id, e.target.value)}
                      />
                    </td>
                    <td
                      className="px-1 py-2 text-center align-middle tabular-nums text-sm font-medium text-foreground"
                      title={
                        dirtyById[r.id]
                          ? "Hisob saqlangan lavozim nomi bo‘yicha; yangi nomni saqlagach yangilanadi"
                          : "Veb xodimlar «Lavozim» maydoni shu nom bilan mos keladigan akkauntlar"
                      }
                    >
                      {r.linked_operator_count ?? 0}
                    </td>
                    {mode === "active" ? (
                      <>
                        <td className="whitespace-nowrap px-2 py-2 text-xs text-muted-foreground">
                          {formatDateTime(r.created_at)}
                        </td>
                        <td className="truncate px-2 py-2 text-xs" title={r.created_by_label ?? undefined}>
                          {r.created_by_label ?? "—"}
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="whitespace-nowrap px-2 py-2 text-xs text-muted-foreground">
                          {formatDateTime(r.deactivated_at)}
                        </td>
                        <td
                          className="truncate px-2 py-2 text-xs"
                          title={r.deactivated_by_label ?? undefined}
                        >
                          {r.deactivated_by_label ?? "—"}
                        </td>
                      </>
                    )}
                    <td className="px-1 py-2 text-center align-middle">
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        className="size-8 text-muted-foreground hover:text-foreground"
                        title="Tarix"
                        onClick={() => setHistoryPresetId(r.id)}
                      >
                        <HistoryIcon className="size-4" />
                        <span className="sr-only">Tarix</span>
                      </Button>
                    </td>
                    <td className="px-1 py-2 text-center align-middle">
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        className="h-8 min-w-[4.5rem] px-2 text-xs"
                        disabled={!dirtyById[r.id] || patchMut.isPending}
                        onClick={() => {
                          const t = (drafts[r.id] ?? r.label).trim();
                          if (!t) return;
                          patchMut.mutate({ presetId: r.id, body: { label: t } });
                        }}
                      >
                        Saqlash
                      </Button>
                    </td>
                    <td className="px-1 py-2 text-center align-middle">
                      {mode === "active" ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-8 w-full min-w-0 px-2 text-xs whitespace-normal leading-snug"
                          disabled={patchMut.isPending}
                          onClick={() => patchMut.mutate({ presetId: r.id, body: { is_active: false } })}
                        >
                          Nofaollashtirish
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-8 w-full min-w-0 px-2 text-xs"
                          disabled={patchMut.isPending}
                          onClick={() => patchMut.mutate({ presetId: r.id, body: { is_active: true } })}
                        >
                          Faollashtirish
                        </Button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        <span className="font-medium text-foreground">Qayerda ishlatiladi:</span> faol shablonlar{" "}
        <span className="whitespace-nowrap">«Veb xodimlar»</span> jadvalidagi lavozim filtri hamda xodim yaratish va
        tahrirlash oynalaridagi kiritish maydonining takliflari (datalist) orqali beriladi — backend bularni bitta
        ro‘yxatda birlashtiradi (<code className="text-foreground">filter-options</code> →{" "}
        <code className="text-foreground">positions</code>). «Bog‘langan» ustuni — veb xodimlar profilidagi lavozim
        matni shu shablon nomi bilan to‘liq mos (trim) keladigan akkauntlar soni. Nofaol shablonlar tanlovlarda
        chiqmaydi.
        «Nofaollashtirish» yozuvni o‘chirmaydi; JWT <code className="text-foreground">operator</code> rolini
        o‘zgartirmaydi.
      </p>

      <Dialog
        open={historyPresetId != null}
        onOpenChange={(open) => {
          if (!open) setHistoryPresetId(null);
        }}
      >
        <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-[420px]">
          <div className="flex items-start gap-3 border-b border-border/70 bg-gradient-to-b from-muted/50 to-transparent px-4 py-3.5">
            <div
              className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary shadow-inner ring-1 ring-primary/15"
              aria-hidden
            >
              <HistoryIcon className="size-[18px]" strokeWidth={2} />
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <DialogTitle className="text-left text-base font-semibold leading-tight">
                Lavozim tarixi
              </DialogTitle>
              <DialogDescription className="text-left text-xs leading-snug text-muted-foreground">
                {historyTitleRow ? (
                  <>
                    <span className="font-medium text-foreground">{historyTitleRow.label}</span>
                    <span className="text-muted-foreground"> — audit bo‘yicha o‘zgarishlar zanjiri</span>
                  </>
                ) : (
                  "Yuklanmoqda…"
                )}
              </DialogDescription>
            </div>
          </div>

          <div className="max-h-[min(52vh,300px)] overflow-y-auto px-4 py-4">
            {historyQ.isLoading ? (
              <div className="flex flex-col items-center justify-center gap-2 py-10 text-muted-foreground">
                <Loader2Icon className="size-8 animate-spin opacity-50" aria-hidden />
                <p className="text-xs">Yuklanmoqda…</p>
              </div>
            ) : historyQ.isError ? (
              <div className="rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-3 text-center text-xs text-destructive">
                Tarixni yuklab bo‘lmadi. Internet yoki serverni tekshirib, yana «Tarix» ni bosing.
              </div>
            ) : !historyQ.data?.data.length ? (
              <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border/80 bg-muted/15 px-4 py-10 text-center">
                <ScrollTextIcon className="size-11 text-muted-foreground/35" strokeWidth={1.25} aria-hidden />
                <div className="space-y-1">
                  <p className="text-sm font-medium text-foreground">Hozircha yozuv yo‘q</p>
                  <p className="mx-auto max-w-[280px] text-xs leading-relaxed text-muted-foreground">
                    Yangi shablon yoki audit yoqilguncha bo‘sh. Keyingi yaratish, nom o‘zgartirish va
                    nofaollashtirish shu yerda paydo bo‘ladi.
                  </p>
                </div>
              </div>
            ) : (
              <ul className="relative space-y-0 text-sm before:absolute before:top-2 before:bottom-2 before:left-[6px] before:w-px before:bg-border/90">
                {[...historyQ.data.data].reverse().map((ev) => {
                  const extra = payloadSummary(ev.action, ev.payload);
                  return (
                    <li key={ev.id} className="relative pb-5 pl-6 last:pb-0">
                      <span
                        className="absolute top-1.5 left-0 size-2 rounded-full bg-primary shadow-[0_0_0_3px_var(--background)] ring-1 ring-primary/30"
                        aria-hidden
                      />
                      <div className="font-medium leading-snug text-foreground">{actionLabelUz(ev.action)}</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {formatDateTime(ev.created_at)}
                        {ev.actor_login ? (
                          <span className="text-foreground/80"> · {ev.actor_login}</span>
                        ) : ev.actor_user_id ? (
                          <span> · ID {ev.actor_user_id}</span>
                        ) : null}
                      </div>
                      {extra ? (
                        <p className="mt-1.5 rounded-md bg-muted/50 px-2 py-1.5 text-[11px] leading-relaxed text-muted-foreground">
                          {extra}
                        </p>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <DialogFooter className="border-t border-border/70 bg-muted/25 px-4 py-3 sm:justify-end">
            <Button type="button" variant="secondary" size="sm" onClick={() => setHistoryPresetId(null)}>
              Yopish
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
