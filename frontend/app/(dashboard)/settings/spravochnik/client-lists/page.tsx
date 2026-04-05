"use client";

import { Button } from "@/components/ui/button";
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
    sales_channels: string[];
    client_product_category_refs: string[];
    client_districts: string[];
    client_cities: string[];
    client_neighborhoods: string[];
    client_zones: string[];
    client_logistics_services: string[];
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
  const [sales, setSales] = useState("");
  const [prodCat, setProdCat] = useState("");
  const [cities, setCities] = useState("");
  const [districts, setDistricts] = useState("");
  const [neighborhoods, setNeighborhoods] = useState("");
  const [zones, setZones] = useState("");
  const [logisticsSvcs, setLogisticsSvcs] = useState("");

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
    setSales((r.sales_channels ?? []).join("\n"));
    setProdCat((r.client_product_category_refs ?? []).join("\n"));
    setCities((r.client_cities ?? []).join("\n"));
    setDistricts((r.client_districts ?? []).join("\n"));
    setNeighborhoods((r.client_neighborhoods ?? []).join("\n"));
    setZones((r.client_zones ?? []).join("\n"));
    setLogisticsSvcs((r.client_logistics_services ?? []).join("\n"));
  }, [data]);

  const save = useMutation({
    mutationFn: async () => {
      if (!tenantSlug) throw new Error("no");
      const { data: body } = await api.patch<TenantProfile>(`/api/${tenantSlug}/settings/profile`, {
        references: {
          sales_channels: splitLines(sales),
          client_product_category_refs: splitLines(prodCat),
          client_cities: splitLines(cities),
          client_districts: splitLines(districts),
          client_neighborhoods: splitLines(neighborhoods),
          client_zones: splitLines(zones),
          client_logistics_services: splitLines(logisticsSvcs)
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
          <span className="text-muted-foreground">|</span>
          <Link className="text-primary underline-offset-4 hover:underline" href="/settings/client-formats">
            Формат клиента
          </Link>
          <Link className="text-primary underline-offset-4 hover:underline" href="/settings/client-types">
            Тип клиента
          </Link>
          <Link className="text-primary underline-offset-4 hover:underline" href="/settings/client-categories">
            Категория клиента
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
              <li>«Teritoriya» (viloyat): Kompaniya sozlamalaridagi hududlar + mijozlardagi qiymatlar.</li>
              <li>Shahar (gorod), tuman, mahalla, zona, logistika: shu sahifada — mijoz kartasida tanlanadi.</li>
              <li>
                Mijoz <strong>formati</strong>, <strong>turi</strong> va <strong>kategoriyasi</strong> endi sozlamalar
                katalogidagi alohida bo‘limlarda (jadval + modal).
              </li>
            </ul>
          </section>

          {(
            [
              ["ref-sales", "Savdo kanali", sales, setSales, "Masalan: TRAD TRADE"],
              ["ref-prod-cat", "Mahsulot toifasi (mijozga)", prodCat, setProdCat, "Qo‘shimcha varaqdagi dropdown"],
              ["ref-city", "Shahar (gorod)", cities, setCities, "Mijoz manzili — shahar"],
              ["ref-district", "Tuman", districts, setDistricts, "Mijoz manzili — tuman"],
              ["ref-neighborhood", "Mahalla", neighborhoods, setNeighborhoods, "Mijoz manzili — mahalla"],
              ["ref-zone", "Zona", zones, setZones, "Mijoz manzili — zona (masalan savdo zonasi)"],
              ["ref-logistics", "Logistika xizmati", logisticsSvcs, setLogisticsSvcs, "Mijoz kartasidagi logistika tanlovi"]
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
