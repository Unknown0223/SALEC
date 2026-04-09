"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuthStore, useAuthStoreHydrated, useEffectiveRole } from "@/lib/auth-store";
import { api } from "@/lib/api";
import { STALE } from "@/lib/query-stale";
import { cn } from "@/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { AxiosError } from "axios";

type BonusStackDto = {
  mode: "all" | "first_only" | "capped";
  max_units: number | null;
  forbid_apply_all_eligible: boolean;
};

const inputCls =
  "flex h-10 w-full rounded-lg border border-input bg-background px-3 text-sm shadow-sm outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-ring";

export function BonusStrategySettings() {
  const tenantSlug = useAuthStore((s) => s.tenantSlug);
  const role = useEffectiveRole();
  const isAdmin = role === "admin";
  const hydrated = useAuthStoreHydrated();
  const qc = useQueryClient();

  const [mode, setMode] = useState<BonusStackDto["mode"]>("all");
  const [maxUnits, setMaxUnits] = useState("");
  const [forbidAll, setForbidAll] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["settings", "bonus-stack", tenantSlug],
    enabled: Boolean(tenantSlug),
    staleTime: STALE.profile,
    queryFn: async () => {
      const { data: body } = await api.get<{ bonus_stack: BonusStackDto }>(
        `/api/${tenantSlug}/settings/bonus-stack`
      );
      return body.bonus_stack;
    }
  });

  useEffect(() => {
    if (!data) return;
    setMode(data.mode);
    setMaxUnits(data.max_units != null ? String(data.max_units) : "");
    setForbidAll(data.forbid_apply_all_eligible);
  }, [data]);

  const saveMut = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {
        mode,
        forbid_apply_all_eligible: forbidAll
      };
      if (mode === "capped") {
        const n = maxUnits.trim() === "" ? null : Number.parseInt(maxUnits, 10);
        if (n != null && (!Number.isFinite(n) || n < 1)) {
          throw new Error("badmax");
        }
        payload.max_units = n;
      } else {
        payload.max_units = null;
      }
      const { data: body } = await api.patch<{ bonus_stack: BonusStackDto }>(
        `/api/${tenantSlug}/settings/bonus-stack`,
        payload
      );
      return body.bonus_stack;
    },
    onSuccess: (bs) => {
      void qc.setQueryData(["settings", "bonus-stack", tenantSlug], bs);
      setMsg("Saqlandi.");
    },
    onError: (e: Error) => {
      if (e.message === "badmax") {
        setMsg("Max. slot: musbat butun son yoki bo‘sh.");
        return;
      }
      const ax = e as AxiosError<{ error?: string }>;
      if (ax.response?.status === 403) {
        setMsg("Faqat admin o‘zgartira oladi.");
        return;
      }
      setMsg(ax.response?.data?.error ?? "Xato");
    }
  });

  return (
    <>
      {!hydrated ? (
        <p className="text-sm text-muted-foreground">Sessiya…</p>
      ) : !tenantSlug ? (
        <p className="text-sm text-destructive">
          <Link href="/login" className="underline">
            Войти снова
          </Link>
        </p>
      ) : isLoading ? (
        <p className="text-sm text-muted-foreground">Загрузка…</p>
      ) : isError ? (
        <p className="text-sm text-destructive">Yuklab bo‘lmadi.</p>
      ) : (
        <Card className="max-w-lg shadow-panel">
          <CardContent className="pt-6">
            <form
              className="flex flex-col gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (!isAdmin) return;
                setMsg(null);
                saveMut.mutate();
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="bs-mode">Rejim</Label>
                <select
                  id="bs-mode"
                  className={cn(inputCls, "py-0")}
                  value={mode}
                  onChange={(e) => setMode(e.target.value as BonusStackDto["mode"])}
                  disabled={saveMut.isPending || !isAdmin}
                >
                  <option value="all">Barcha mos slotlar (standart)</option>
                  <option value="first_only">Faqat eng yuqori priority li bittasi</option>
                  <option value="capped">Cheklangan son (max_units)</option>
                </select>
              </div>

              {mode === "capped" ? (
                <div className="space-y-2">
                  <Label htmlFor="bs-max">Maks. slotlar soni</Label>
                  <Input
                    id="bs-max"
                    className={inputCls}
                    type="number"
                    min={1}
                    placeholder="Masalan: 2"
                    value={maxUnits}
                    onChange={(e) => setMaxUnits(e.target.value)}
                    disabled={saveMut.isPending || !isAdmin}
                  />
                </div>
              ) : null}

              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={forbidAll}
                  onChange={(e) => setForbidAll(e.target.checked)}
                  disabled={saveMut.isPending || !isAdmin}
                />
                <span>Mos slotlar hammasiga teng bo‘lsa, hammasini berishni taqiqlash (N−1)</span>
              </label>

              <p className="text-xs text-muted-foreground">
                Batafsil: loyiha ichida <code className="rounded bg-muted px-1">docs/BONUS_STACKING_PLAN.md</code>
              </p>

              {!isAdmin ? (
                <p className="text-sm text-muted-foreground">Faqat ko‘rish: o‘zgartirish uchun admin kerak.</p>
              ) : null}

              {msg ? <p className="text-sm text-muted-foreground">{msg}</p> : null}

              <div className="flex flex-wrap gap-2">
                {isAdmin ? (
                  <Button type="submit" disabled={saveMut.isPending}>
                    {saveMut.isPending ? "Saqlanmoqda…" : "Saqlash"}
                  </Button>
                ) : null}
                <Button type="button" variant="outline" onClick={() => void refetch()} disabled={saveMut.isPending}>
                  Yangilash
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </>
  );
}
