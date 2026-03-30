"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuthStore, useAuthStoreHydrated } from "@/lib/auth-store";
import { api } from "@/lib/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo, useState } from "react";

type DupGroup = {
  phone_normalized: string;
  client_ids: number[];
  clients: Array<{
    id: number;
    name: string;
    phone: string | null;
    is_active: boolean;
    merged_into_client_id: number | null;
  }>;
};

function digitsOnly(s: string): string {
  return s.replace(/\D/g, "");
}

export default function ClientDuplicatesPage() {
  const tenantSlug = useAuthStore((s) => s.tenantSlug);
  const authHydrated = useAuthStoreHydrated();
  const qc = useQueryClient();
  const [keepByGroup, setKeepByGroup] = useState<Record<string, number>>({});
  const [phoneSearch, setPhoneSearch] = useState("");
  const [minGroupSize, setMinGroupSize] = useState("2");
  const [feedback, setFeedback] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["client-duplicate-groups", tenantSlug],
    enabled: Boolean(tenantSlug),
    queryFn: async () => {
      const { data: body } = await api.get<{ data: DupGroup[] }>(
        `/api/${tenantSlug}/clients/duplicate-groups`
      );
      return body.data;
    }
  });

  const mergeMut = useMutation({
    mutationFn: async ({ keep, merge }: { keep: number; merge: number[] }) => {
      const { data: body } = await api.post<{
        kept: number;
        merged: number[];
        orders_reassigned: number;
      }>(`/api/${tenantSlug}/clients/merge`, {
        keep_client_id: keep,
        merge_client_ids: merge
      });
      return body;
    },
    onSuccess: async (res) => {
      setFeedback({
        kind: "ok",
        text: `Birlashtirildi: asosiy ID ${res.kept}, zakazlar ko‘chirildi: ${res.orders_reassigned}. Birlashtirilgan ID: ${res.merged.join(", ")}.`
      });
      await qc.invalidateQueries({ queryKey: ["client-duplicate-groups", tenantSlug] });
      await refetch();
    },
    onError: (e: unknown) => {
      const ax = e as {
        response?: { data?: { error?: string; requestId?: string; message?: string }; status?: number };
      };
      const rid = ax.response?.data?.requestId ? ` (requestId: ${ax.response.data.requestId})` : "";
      if (ax.response?.status === 403) {
        setFeedback({ kind: "err", text: `Ruxsat yo‘q${rid}` });
        return;
      }
      if (ax.response?.data?.error === "AlreadyMerged") {
        setFeedback({ kind: "err", text: `Ba’zi yozuvlar allaqachon birlashtirilgan${rid}` });
        return;
      }
      setFeedback({
        kind: "err",
        text: (ax.response?.data?.message as string) || `Xato${rid}`
      });
    }
  });

  function defaultKeep(g: DupGroup): number {
    return g.clients[0]?.id ?? 0;
  }

  function onMergeGroup(g: DupGroup) {
    const key = g.phone_normalized;
    const keep = keepByGroup[key] ?? defaultKeep(g);
    const merge = g.client_ids.filter((id) => id !== keep);
    if (merge.length === 0) {
      setFeedback({ kind: "err", text: "Birlashtirish uchun kamida 2 ta yozuv kerak." });
      return;
    }
    const names = g.clients.map((c) => `• ${c.name} (ID ${c.id})`).join("\n");
    if (
      !window.confirm(
        `Asosiy saqlanadigan mijoz ID: ${keep}\n\n${names}\n\nQolgan yozuvlar nofaol qilinadi, zakazlar asosiyga o‘tkaziladi. Tasdiqlaysizmi?`
      )
    ) {
      return;
    }
    mergeMut.mutate({ keep, merge });
  }

  const searchDigits = digitsOnly(phoneSearch);

  const filteredGroups = useMemo(() => {
    const list = data ?? [];
    const minN = Math.max(2, Number.parseInt(minGroupSize, 10) || 2);
    let out = list.filter((g) => g.client_ids.length >= minN);
    if (searchDigits) {
      out = out.filter((g) => g.phone_normalized.includes(searchDigits));
    }
    return out;
  }, [data, searchDigits, minGroupSize]);

  const groupCount = (data ?? []).length;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold">Klient dublikatlari</h1>
          <p className="text-sm text-muted-foreground">
            Bir xil telefon (normalizatsiyalangan) bo‘yicha guruhlar. Zakazlar saqlanadi.
          </p>
        </div>
        <div className="flex flex-wrap gap-3 text-sm">
          <Link className="text-primary underline-offset-4 hover:underline" href="/dashboard">
            Dashboard
          </Link>
          <Link className="text-primary underline-offset-4 hover:underline" href="/bonus-rules/active">
            Bonus qoidalari
          </Link>
          <Link className="text-primary underline-offset-4 hover:underline" href="/products">
            Mahsulotlar
          </Link>
        </div>
      </div>

      {!authHydrated ? (
        <p className="text-sm text-muted-foreground">Sessiya yuklanmoqda…</p>
      ) : !tenantSlug ? (
        <p className="text-sm text-destructive">
          <Link href="/login" className="underline">
            Qayta kiring
          </Link>
        </p>
      ) : isLoading ? (
        <p className="text-sm text-muted-foreground">Yuklanmoqda…</p>
      ) : isError ? (
        <p className="text-sm text-destructive">
          {error instanceof Error ? error.message : "Xato"}
          {" — faqat admin/operator ko‘ra oladi."}
        </p>
      ) : (
        <>
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            <div className="grid min-w-[200px] flex-1 gap-1.5">
              <label htmlFor="dup-search" className="text-xs font-medium text-muted-foreground">
                Telefon bo‘yicha qidiruv
              </label>
              <Input
                id="dup-search"
                type="search"
                placeholder="Masalan 998901112233 yoki oxirgi 9 raqam"
                value={phoneSearch}
                onChange={(e) => setPhoneSearch(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <label htmlFor="dup-min" className="text-xs font-medium text-muted-foreground">
                Guruhda kamida mijozlar
              </label>
              <select
                id="dup-min"
                className="h-9 rounded-md border bg-background px-2 text-sm"
                value={minGroupSize}
                onChange={(e) => setMinGroupSize(e.target.value)}
              >
                <option value="2">2+</option>
                <option value="3">3+</option>
                <option value="4">4+</option>
              </select>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setPhoneSearch("");
                  setMinGroupSize("2");
                }}
                disabled={!phoneSearch && minGroupSize === "2"}
              >
                Filterni tozalash
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
                {isFetching ? "Yangilanmoqda…" : "Ro‘yxatni yangilash"}
              </Button>
            </div>
          </div>

          {feedback ? (
            <p
              role="status"
              className={
                feedback.kind === "ok"
                  ? "rounded-md border border-green-600/40 bg-green-500/10 px-3 py-2 text-sm text-green-900 dark:text-green-100"
                  : "rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              }
            >
              {feedback.text}
            </p>
          ) : null}

          {filteredGroups.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {groupCount === 0
                ? "Telefon bo‘yicha dublikat guruhlari topilmadi."
                : "Qidiruvga mos guruh yo‘q — filterni o‘zgartiring."}
            </p>
          ) : (
            <ul className="flex flex-col gap-4">
              {filteredGroups.map((g) => (
                <li key={g.phone_normalized} className="rounded-lg border p-4">
                  <p className="mb-2 font-mono text-sm font-medium">Tel: {g.phone_normalized}</p>
                  <p className="mb-2 text-xs text-muted-foreground">{g.clients.length} ta yozuv</p>
                  <ul className="mb-3 space-y-2">
                    {g.clients.map((c) => (
                      <li key={c.id} className="flex flex-wrap items-center gap-2 text-sm">
                        <label className="flex items-center gap-2">
                          <input
                            type="radio"
                            name={`keep-${g.phone_normalized}`}
                            checked={(keepByGroup[g.phone_normalized] ?? defaultKeep(g)) === c.id}
                            onChange={() =>
                              setKeepByGroup((prev) => ({ ...prev, [g.phone_normalized]: c.id }))
                            }
                          />
                          <span className="font-medium">{c.name}</span>
                          <span className="text-muted-foreground">ID {c.id}</span>
                          {!c.is_active ? (
                            <span className="text-xs text-muted-foreground">(nofaol)</span>
                          ) : null}
                        </label>
                      </li>
                    ))}
                  </ul>
                  <Button
                    type="button"
                    size="sm"
                    disabled={mergeMut.isPending}
                    onClick={() => onMergeGroup(g)}
                  >
                    Tanlangan asosiyga birlashtirish
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
