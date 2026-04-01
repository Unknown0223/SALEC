"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuthStore, useAuthStoreHydrated, useEffectiveRole } from "@/lib/auth-store";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useState } from "react";

type TenantProfile = {
  name: string;
  references: {
    payment_types: string[];
    return_reasons: string[];
    regions: string[];
    client_categories: string[];
    client_type_codes: string[];
    client_formats: string[];
    sales_channels: string[];
    client_product_category_refs: string[];
  };
};

function splitLines(s: string): string[] {
  return s
    .split(/[\n,;]+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

export default function ClientListsSpravochnikPage() {
  const tenantSlug = useAuthStore((s) => s.tenantSlug);
  const role = useEffectiveRole();
  const isAdmin = role === "admin";
  const hydrated = useAuthStoreHydrated();
  const qc = useQueryClient();
  const [msg, setMsg] = useState<string | null>(null);
  const [cat, setCat] = useState("");
  const [types, setTypes] = useState("");
  const [formats, setFormats] = useState("");
  const [sales, setSales] = useState("");
  const [prodCat, setProdCat] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["settings", "profile", tenantSlug],
    enabled: Boolean(tenantSlug),
    queryFn: async () => {
      const { data: body } = await api.get<TenantProfile>(`/api/${tenantSlug}/settings/profile`);
      return body;
    }
  });

  useEffect(() => {
    if (!data?.references) return;
    const r = data.references;
    setCat((r.client_categories ?? []).join("\n"));
    setTypes((r.client_type_codes ?? []).join("\n"));
    setFormats((r.client_formats ?? []).join("\n"));
    setSales((r.sales_channels ?? []).join("\n"));
    setProdCat((r.client_product_category_refs ?? []).join("\n"));
  }, [data]);

  const save = useMutation({
    mutationFn: async () => {
      if (!tenantSlug) throw new Error("no");
      const { data: body } = await api.patch<TenantProfile>(`/api/${tenantSlug}/settings/profile`, {
        references: {
          client_categories: splitLines(cat),
          client_type_codes: splitLines(types),
          client_formats: splitLines(formats),
          sales_channels: splitLines(sales),
          client_product_category_refs: splitLines(prodCat)
        }
      });
      return body;
    },
    onSuccess: (p) => {
      void qc.setQueryData(["settings", "profile", tenantSlug], p);
      void qc.invalidateQueries({ queryKey: ["clients-references", tenantSlug] });
      setMsg("Saqlandi. Mijoz tahriri sahifasida tanlov ro‘yxati yangilanadi.");
    },
    onError: () => setMsg("Xato yoki faqat admin saqlashi mumkin.")
  });

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold">Mijoz kartochkasi — spravochniklar</h1>
        <p className="text-sm text-muted-foreground">
          Bu yerda qiymatlar <strong>yaratiladi</strong>. Mijozni tahrirlashda ular <strong>tanlanadi</strong> (dropdown).
        </p>
        <div className="mt-2 flex flex-wrap gap-2 text-sm">
          <Link className="text-primary underline-offset-4 hover:underline" href="/settings/spravochnik">
            ← Barcha spravochniklar
          </Link>
          <span className="text-muted-foreground">|</span>
          <Link className="text-primary underline-offset-4 hover:underline" href="/settings/spravochnik/agents">
            Agentlar
          </Link>
          <Link className="text-primary underline-offset-4 hover:underline" href="/settings/spravochnik/expeditors">
            Ekspeditorlar
          </Link>
          <Link className="text-primary underline-offset-4 hover:underline" href="/settings/spravochnik/supervisors">
            Supervizorlar
          </Link>
        </div>
      </div>

      {!hydrated || !tenantSlug ? (
        <p className="text-sm text-muted-foreground">…</p>
      ) : isLoading ? (
        <p className="text-sm text-muted-foreground">Yuklanmoqda…</p>
      ) : !isAdmin ? (
        <p className="text-sm text-destructive">Faqat admin tahrirlashi mumkin.</p>
      ) : (
        <div className="space-y-6">
          <section className="rounded-lg border border-dashed border-primary/30 bg-muted/20 p-4 text-xs text-muted-foreground">
            <p className="font-medium text-foreground">Qanday ishlatiladi</p>
            <ul className="mt-2 list-disc space-y-1 pl-4">
              <li>Har qatorga bitta qiymat yoki vergul/nuqtali vergul bilan bir nechta.</li>
              <li>Mavjud mijozlarda allaqachon bor qiymatlar ham tanlovda ko‘rinadi (avtomatik).</li>
              <li>«Teritoriya» uchun asosiy ro‘yxat: Kompaniya sozlamalaridagi hududlar + mijozlardagi viloyat.</li>
            </ul>
          </section>

          {(
            [
              ["ref-category", "Mijoz toifasi (category)", cat, setCat, "Masalan: A, B, retail"],
              ["ref-type", "Mijoz turi (kod)", types, setTypes, "Masalan: FOOD-HPC"],
              ["ref-format", "Mijoz formati", formats, setFormats, "Masalan: Superettes"],
              ["ref-sales", "Savdo kanali", sales, setSales, "Masalan: TRAD TRADE"],
              ["ref-prod-cat", "Mahsulot toifasi (mijozga)", prodCat, setProdCat, "Qo‘shimcha varaqdagi dropdown"]
            ] as const
          ).map(([anchor, title, val, setVal, ph]) => (
            <section key={anchor} id={anchor} className="scroll-mt-20 grid gap-2">
              <Label className="text-sm font-medium">{title}</Label>
              <textarea
                className={cn(
                  "min-h-[88px] rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm",
                  "outline-none focus-visible:ring-2 focus-visible:ring-ring"
                )}
                placeholder={ph}
                value={val}
                onChange={(e) => setVal(e.target.value)}
                disabled={save.isPending}
              />
            </section>
          ))}

          <Button type="button" onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Saqlanmoqda…" : "Saqlash"}
          </Button>
          {msg ? <p className="text-sm text-muted-foreground">{msg}</p> : null}
        </div>
      )}
    </div>
  );
}
