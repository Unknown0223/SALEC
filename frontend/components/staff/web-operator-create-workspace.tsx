"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { FilterSelect, filterSelectClassName } from "@/components/ui/filter-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/dashboard/page-header";
import { PageShell } from "@/components/dashboard/page-shell";
import { buttonVariants } from "@/components/ui/button-variants";
import { messageFromStaffCreateError } from "@/lib/staff-api-errors";
import type { AxiosError } from "axios";

const POSITION_PRESETS_SETTINGS_HREF = "/settings/web-staff-position-presets";

type FilterOptions = { branches: string[]; positions: string[]; position_presets: string[] };

type Props = { tenantSlug: string };

export function WebOperatorCreateWorkspace({ tenantSlug }: Props) {
  const router = useRouter();
  const qc = useQueryClient();
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    middle_name: "",
    login: "",
    password: "",
    phone: "",
    email: "",
    code: "",
    pinfl: "",
    branch: "",
    position: "",
    max_sessions: "4",
    app_access: false,
    can_authorize: true,
    cash_desk_id: null as number | null,
    cash_desk_link_role: "" as "" | "cashier" | "manager" | "operator"
  });
  const [localError, setLocalError] = useState<string | null>(null);

  const filterOptsQ = useQuery({
    queryKey: ["operators", tenantSlug, "filter-options"],
    enabled: Boolean(tenantSlug),
    queryFn: async () => {
      const { data } = await api.get<{ data: FilterOptions }>(
        `/api/${tenantSlug}/operators/meta/filter-options`
      );
      return data.data;
    }
  });

  const desksQ = useQuery({
    queryKey: ["cash-desks", tenantSlug, "operator-create-page"],
    enabled: Boolean(tenantSlug),
    queryFn: async () => {
      const { data } = await api.get<{ data: { id: number; name: string }[] }>(
        `/api/${tenantSlug}/cash-desks?is_active=true&limit=200&page=1`
      );
      return data.data;
    }
  });

  const deskLinkIncomplete = form.cash_desk_id != null && form.cash_desk_link_role === "";

  const createMut = useMutation({
    mutationFn: async () => {
      const max_sessions = Number.parseInt(form.max_sessions, 10);
      const body: Record<string, unknown> = {
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim() || null,
        middle_name: form.middle_name.trim() || null,
        login: form.login.trim(),
        password: form.password,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        code: form.code.trim() || null,
        pinfl: form.pinfl.trim() || null,
        branch: form.branch.trim() || null,
        position: form.position.trim() || null,
        max_sessions: Number.isFinite(max_sessions) ? max_sessions : 4,
        app_access: form.app_access,
        can_authorize: form.can_authorize,
        is_active: true
      };
      if (form.cash_desk_id != null && form.cash_desk_link_role) {
        body.cash_desk_id = form.cash_desk_id;
        body.cash_desk_link_role = form.cash_desk_link_role;
      }
      await api.post(`/api/${tenantSlug}/operators`, body);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["operators", tenantSlug] });
      router.push("/settings/spravochnik/operators");
    },
    onError: (e: unknown) => {
      const m = messageFromStaffCreateError(e);
      const ax = e as AxiosError<{ error?: string }>;
      setLocalError(m ?? ax.response?.data?.error ?? (e instanceof Error ? e.message : "Xatolik"));
    }
  });

  const branches = filterOptsQ.data?.branches ?? [];
  const positions = filterOptsQ.data?.positions ?? [];

  return (
    <PageShell>
      <PageHeader
        title="Yangi veb xodim"
        description="Login va parol noyob bo‘lishi kerak. Filial va lavozim ro‘yxatdan tanlanadi."
        actions={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Link
              href="/settings/spravochnik/operators"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            >
              ← Ro‘yxat
            </Link>
            <Button
              type="button"
              size="sm"
              disabled={createMut.isPending || deskLinkIncomplete}
              onClick={() => {
                setLocalError(null);
                createMut.mutate();
              }}
            >
              {createMut.isPending ? "…" : "Yaratish"}
            </Button>
          </div>
        }
      />

      <div className="mx-auto max-w-2xl space-y-6 pb-24">
        {localError ? (
          <p className="text-sm text-destructive" role="alert">
            {localError}
          </p>
        ) : null}

        <div className="grid gap-4 rounded-xl border border-border bg-card p-5 text-sm shadow-sm sm:p-6">
          <label className="grid gap-1">
            <span className="text-xs text-muted-foreground">Ism *</span>
            <Input value={form.first_name} onChange={(e) => setForm((f) => ({ ...f, first_name: e.target.value }))} />
          </label>
          <label className="grid gap-1">
            <span className="text-xs text-muted-foreground">Familiya</span>
            <Input value={form.last_name} onChange={(e) => setForm((f) => ({ ...f, last_name: e.target.value }))} />
          </label>
          <label className="grid gap-1">
            <span className="text-xs text-muted-foreground">Otasining ismi</span>
            <Input
              value={form.middle_name}
              onChange={(e) => setForm((f) => ({ ...f, middle_name: e.target.value }))}
            />
          </label>
          <label className="grid gap-1">
            <span className="text-xs text-muted-foreground">Login *</span>
            <Input
              className="font-mono"
              value={form.login}
              onChange={(e) => setForm((f) => ({ ...f, login: e.target.value }))}
              autoComplete="off"
            />
          </label>
          <label className="grid gap-1">
            <span className="text-xs text-muted-foreground">Parol * (min 6)</span>
            <Input
              type="password"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              autoComplete="new-password"
            />
          </label>
          <label className="grid gap-1">
            <span className="text-xs text-muted-foreground">Telefon</span>
            <Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
          </label>
          <label className="grid gap-1">
            <span className="text-xs text-muted-foreground">Email</span>
            <Input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
          </label>
          <label className="grid gap-1">
            <span className="text-xs text-muted-foreground">Kod</span>
            <Input value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} />
          </label>
          <label className="grid gap-1">
            <span className="text-xs text-muted-foreground">PINFL</span>
            <Input value={form.pinfl} onChange={(e) => setForm((f) => ({ ...f, pinfl: e.target.value }))} />
          </label>
          <label className="grid gap-1">
            <span className="text-xs text-muted-foreground">Filial</span>
            <FilterSelect
              className={cn(filterSelectClassName, "h-10 w-full max-w-none")}
              emptyLabel="— Tanlanmagan —"
              aria-label="Filial"
              value={form.branch}
              onChange={(e) => setForm((f) => ({ ...f, branch: e.target.value }))}
            >
              {branches.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </FilterSelect>
          </label>
          <label className="grid gap-1">
            <span className="text-xs text-muted-foreground">Lavozim</span>
            <FilterSelect
              className={cn(filterSelectClassName, "h-10 w-full max-w-none")}
              emptyLabel="— Tanlanmagan —"
              aria-label="Lavozim"
              value={form.position}
              onChange={(e) => setForm((f) => ({ ...f, position: e.target.value }))}
            >
              {positions.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </FilterSelect>
            <span className="text-[11px] leading-snug text-muted-foreground">
              Shablonlar:{" "}
              <Link href={POSITION_PRESETS_SETTINGS_HREF} className="text-primary underline underline-offset-2">
                sozlamalar
              </Link>
              .
            </span>
          </label>
          <label className="grid gap-1">
            <span className="text-xs text-muted-foreground">Parallel veb-sessiyalar (maks.)</span>
            <Input
              inputMode="numeric"
              value={form.max_sessions}
              onChange={(e) => setForm((f) => ({ ...f, max_sessions: e.target.value.replace(/\D/g, "") }))}
            />
          </label>
          <label className="grid gap-1">
            <span className="text-xs text-muted-foreground">Kassa (ixtiyoriy)</span>
            <select
              className={cn(filterSelectClassName, "h-10 w-full text-sm")}
              value={form.cash_desk_id == null ? "" : String(form.cash_desk_id)}
              disabled={desksQ.isLoading}
              onChange={(e) => {
                const v = e.target.value;
                setForm((f) => ({
                  ...f,
                  cash_desk_id: v === "" ? null : Number.parseInt(v, 10),
                  cash_desk_link_role: v === "" ? "" : f.cash_desk_link_role
                }));
              }}
            >
              <option value="">— Tanlanmagan —</option>
              {(desksQ.data ?? []).map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
            {desksQ.isError ? (
              <span className="text-[11px] text-destructive">Kassalar ro‘yxati yuklanmadi</span>
            ) : null}
          </label>
          <label className="grid gap-1">
            <span className="text-xs text-muted-foreground">Kassadagi rol</span>
            <select
              className={cn(filterSelectClassName, "h-10 w-full text-sm")}
              value={form.cash_desk_link_role}
              disabled={form.cash_desk_id == null}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  cash_desk_link_role: (e.target.value || "") as typeof f.cash_desk_link_role
                }))
              }
            >
              <option value="">—</option>
              <option value="cashier">Kassir</option>
              <option value="manager">Menejer</option>
              <option value="operator">Kassa operatori</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={form.app_access}
              onChange={(e) => setForm((f) => ({ ...f, app_access: e.target.checked }))}
            />
            Mobil ilovaga ruxsat
          </label>
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={form.can_authorize}
              onChange={(e) => setForm((f) => ({ ...f, can_authorize: e.target.checked }))}
            />
            Tizimga kirish mumkin
          </label>
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex max-w-2xl flex-wrap items-center justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => router.push("/settings/spravochnik/operators")}>
            Bekor
          </Button>
          <Button
            type="button"
            disabled={createMut.isPending || deskLinkIncomplete}
            onClick={() => {
              setLocalError(null);
              createMut.mutate();
            }}
          >
            {createMut.isPending ? "…" : "Yaratish"}
          </Button>
        </div>
      </div>
    </PageShell>
  );
}
