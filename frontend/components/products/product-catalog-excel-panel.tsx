"use client";

import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { getUserFacingError } from "@/lib/error-utils";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRef, useState } from "react";

type Props = {
  tenantSlug: string | null;
  backHref: string;
  onDone: () => void;
  showCardHeader?: boolean;
};

function triggerBlobDownload(blob: Blob, filename: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function ProductCatalogExcelPanel({
  tenantSlug,
  backHref,
  onDone,
  showCardHeader = true
}: Props) {
  const qc = useQueryClient();
  const fullFileRef = useRef<HTMLInputElement>(null);
  const updateFileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<null | "template" | "export">(null);

  async function downloadBlob(path: string, filename: string) {
    if (!tenantSlug) return;
    try {
      const { data } = await api.get(`/api/${tenantSlug}${path}`, { responseType: "blob" });
      const blob = data instanceof Blob ? data : new Blob([data]);
      const ctype = blob.type || "";
      if (ctype.includes("application/json")) {
        const text = await blob.text();
        try {
          const j = JSON.parse(text) as { error?: string };
          setMsg(j.error ?? "Yuklab olish rad etildi.");
        } catch {
          setMsg("Yuklab olish rad etildi.");
        }
        return;
      }
      triggerBlobDownload(blob, filename);
      setMsg(null);
    } catch (e) {
      setMsg(getUserFacingError(e, "Yuklab bo‘lmadi — tarmoq yoki ruxsat."));
    }
  }

  const importFullMut = useMutation({
    mutationFn: async (file: File) => {
      if (!tenantSlug) throw new Error("no");
      const fd = new FormData();
      fd.append("file", file);
      const { data } = await api.post<{ created: number; updated: number; errors: string[] }>(
        `/api/${tenantSlug}/products/import-catalog`,
        fd
      );
      return data;
    },
    onSuccess: (res) => {
      setMsg(
        `Yaratildi: ${res.created}, yangilandi: ${res.updated}. ${res.errors.length ? res.errors.slice(0, 5).join("; ") : ""}`
      );
      onDone();
      void qc.invalidateQueries({ queryKey: ["products", tenantSlug] });
      if (fullFileRef.current) fullFileRef.current.value = "";
    },
    onError: (e) => setMsg(getUserFacingError(e, "Import xatosi — ustunlar yoki faylni tekshiring."))
  });

  const importUpdateMut = useMutation({
    mutationFn: async (file: File) => {
      if (!tenantSlug) throw new Error("no");
      const fd = new FormData();
      fd.append("file", file);
      const { data } = await api.post<{
        updated: number;
        skipped_empty: number;
        skipped_unknown_sku: number;
        skipped_no_change: number;
        errors: string[];
      }>(`/api/${tenantSlug}/products/import-catalog-update`, fd);
      return data;
    },
    onSuccess: (res) => {
      setMsg(
        `Yangilandi: ${res.updated}. O‘zgarishsiz: ${res.skipped_no_change}. SKU topilmadi: ${res.skipped_unknown_sku}. ${res.errors.length ? res.errors.slice(0, 5).join("; ") : ""}`
      );
      onDone();
      void qc.invalidateQueries({ queryKey: ["products", tenantSlug] });
      if (updateFileRef.current) updateFileRef.current.value = "";
    },
    onError: (e) => setMsg(getUserFacingError(e, "Yangilash importi xatosi."))
  });

  return (
    <Card className="border-primary/20">
      {showCardHeader ? (
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Excel — katalog importi</CardTitle>
          <CardDescription>
            <strong>Название</strong>, <strong>Категория(код)</strong>,{" "}
            <strong>Единица измерения(код)</strong> majburiy (yangi qatorlar va to‘liq importda). Kodlar
            spravochnikdagi <code className="text-foreground">code</code> bilan mos bo‘lishi kerak.
          </CardDescription>
        </CardHeader>
      ) : null}
      <CardContent className={showCardHeader ? "space-y-4 text-sm" : "space-y-4 pt-4 text-sm"}>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={downloading === "template"}
            onClick={async () => {
              setDownloading("template");
              try {
                await downloadBlob("/products/import-template", "import-products-template.xlsx");
              } finally {
                setDownloading(null);
              }
            }}
          >
            {downloading === "template" ? "…" : "Bo‘sh shablon (.xlsx)"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={downloading === "export"}
            onClick={async () => {
              setDownloading("export");
              try {
                await downloadBlob("/products/export-catalog", "products-catalog-export.xlsx");
              } finally {
                setDownloading(null);
              }
            }}
          >
            {downloading === "export" ? "…" : "Joriy mahsulotlar (eksport)"}
          </Button>
        </div>

        <div className="rounded-md border border-border/80 bg-muted/20 p-3 space-y-2">
          <p className="font-medium text-foreground">To‘liq import</p>
          <p className="text-xs text-muted-foreground">
            Yangi mahsulotlar qo‘shiladi; <strong>Код</strong> (SKU) allaqachon bo‘lsa — qator
            yangilanadi. Faylda yo‘q mahsulotlarga tegilmaydi.
          </p>
          <input
            ref={fullFileRef}
            type="file"
            accept=".xlsx,.xls"
            className="text-xs"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) {
                setMsg(null);
                importFullMut.mutate(f);
              }
            }}
          />
        </div>

        <div className="rounded-md border border-border/80 bg-muted/20 p-3 space-y-2">
          <p className="font-medium text-foreground">Faqat yangilash (o‘zgarishlar)</p>
          <p className="text-xs text-muted-foreground">
            Avval «Joriy mahsulotlar»ni yuklab oling, kerakli qatorlarni tahrirlang. Qayta yuklanganda
            faqat faylda qolgan SKU lar yangilanadi va <strong>faqat o‘zgargan</strong> maydonlar yoziladi;
            fayldan olib tashlangan mahsulotlar bazada o‘zgarishsiz qoladi; yangi SKU yaratilmaydi.
          </p>
          <input
            ref={updateFileRef}
            type="file"
            accept=".xlsx,.xls"
            className="text-xs"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) {
                setMsg(null);
                importUpdateMut.mutate(f);
              }
            }}
          />
        </div>

        {msg ? <p className="text-sm text-muted-foreground">{msg}</p> : null}
      </CardContent>
      <div className="border-t border-border/60 px-4 py-3">
        <Link
          href={backHref}
          className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
        >
          ← Ro‘yxatga qaytish
        </Link>
      </div>
    </Card>
  );
}
