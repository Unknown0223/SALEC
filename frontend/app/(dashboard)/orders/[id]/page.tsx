"use client";

import { OrderDetailView } from "@/components/orders/order-detail-view";
import { NakladnoyExportSettingsDialog } from "@/components/orders/nakladnoy-export-settings-dialog";
import { PageHeader } from "@/components/dashboard/page-header";
import { PageShell } from "@/components/dashboard/page-shell";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { useAuthStore, useAuthStoreHydrated, useEffectiveRole } from "@/lib/auth-store";
import {
  DEFAULT_NAKLADNOY_EXPORT_PREFS,
  downloadOrdersNakladnoyXlsx,
  loadNakladnoyExportPrefs,
  NAKLADNOY_TEMPLATE_OPTIONS,
  type NakladnoyExportPrefs,
  type NakladnoyTemplateId
} from "@/lib/order-nakladnoy";
import { getUserFacingError } from "@/lib/error-utils";
import { cn } from "@/lib/utils";
import { useMutation } from "@tanstack/react-query";
import { Settings } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

export default function OrderDetailPage() {
  const params = useParams();
  const raw = params.id;
  const idStr = Array.isArray(raw) ? raw[0] : raw;
  const orderId = Number.parseInt(idStr ?? "", 10);
  const tenantSlug = useAuthStore((s) => s.tenantSlug);
  const hydrated = useAuthStoreHydrated();
  const effectiveRole = useEffectiveRole();
  const [showPrint, setShowPrint] = useState(false);
  const [nakladnoyTemplate, setNakladnoyTemplate] = useState<NakladnoyTemplateId>("nakladnoy_warehouse");
  const [nakladnoyPrefs, setNakladnoyPrefs] = useState<NakladnoyExportPrefs>(DEFAULT_NAKLADNOY_EXPORT_PREFS);
  const [nakladnoySettingsOpen, setNakladnoySettingsOpen] = useState(false);
  const [nakladnoyFeedback, setNakladnoyFeedback] = useState<string | null>(null);

  const invalid = !Number.isFinite(orderId) || orderId < 1;
  const canNakladnoyExcel = effectiveRole === "admin" || effectiveRole === "operator";

  useEffect(() => {
    setNakladnoyPrefs(loadNakladnoyExportPrefs());
  }, []);

  const nakladnoyMut = useMutation({
    mutationFn: async () => {
      await downloadOrdersNakladnoyXlsx({
        tenantSlug: tenantSlug!,
        orderIds: [orderId],
        template: nakladnoyTemplate,
        prefs: nakladnoyPrefs
      });
    },
    onSuccess: () => setNakladnoyFeedback("Excel (.xlsx) yuklab olindi."),
    onError: (err: unknown) =>
      setNakladnoyFeedback(getUserFacingError(err, "Nakladnoyni yuklab bo‘lmadi."))
  });

  const handlePrint = () => {
    setShowPrint(true);
    setTimeout(() => {
      window.print();
      setShowPrint(false);
    }, 200);
  };

  return (
    <PageShell className="pb-12">
      <Link
        href="/orders"
        className={cn(
          buttonVariants({ variant: "ghost", size: "sm" }),
          "h-8 w-fit -ml-2 text-muted-foreground"
        )}
      >
        ← Zakazlar ro’yxati
      </Link>
      <PageHeader
        title="Zakaz tafsilotlari"
        description={!invalid ? `id #${orderId}` : undefined}
        actions={
          <>
            <button
              type="button"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
              onClick={handlePrint}
            >
              🖨 Chop etish
            </button>
            {canNakladnoyExcel && !invalid ? (
              <>
                <label className="flex items-center gap-2 text-xs text-muted-foreground sm:flex-col sm:items-stretch sm:gap-1">
                  <span className="hidden sm:inline">Накладной</span>
                  <select
                    className="h-9 min-w-[10rem] rounded-md border border-input bg-background px-2 text-sm text-foreground"
                    value={nakladnoyTemplate}
                    onChange={(e) => {
                      setNakladnoyTemplate(e.target.value as NakladnoyTemplateId);
                      setNakladnoyFeedback(null);
                    }}
                    aria-label="Nakladnoy shabloni"
                  >
                    {NAKLADNOY_TEMPLATE_OPTIONS.map((opt) => (
                      <option key={opt.id} value={opt.id}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </label>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-9 w-9 shrink-0"
                  title="Nakladnoy Excel sozlamalari"
                  aria-label="Nakladnoy Excel sozlamalari"
                  onClick={() => setNakladnoySettingsOpen(true)}
                >
                  <Settings className="size-4" />
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="bg-teal-700 text-white hover:bg-teal-800"
                  disabled={nakladnoyMut.isPending}
                  onClick={() => {
                    setNakladnoyFeedback(null);
                    nakladnoyMut.mutate();
                  }}
                >
                  {nakladnoyMut.isPending ? "Excel…" : "Nakladnoy (.xlsx)"}
                </Button>
              </>
            ) : null}
            <Link className={cn(buttonVariants({ variant: "outline", size: "sm" }))} href={`/payments/new?order_id=${orderId}`}>
              To’lov qabul
            </Link>
            <Link className={cn(buttonVariants({ variant: "outline", size: "sm" }))} href={`/returns/new?order_id=${orderId}`}>
              Qaytarish
            </Link>
          </>
        }
      />

      {nakladnoyFeedback ? (
        <p
          className={cn(
            "mb-3 rounded-md border px-3 py-2 text-xs",
            nakladnoyFeedback.includes("bo‘lmadi") || nakladnoyFeedback.includes("xato")
              ? "border-destructive/50 bg-destructive/10 text-destructive"
              : "border-border bg-muted/40 text-foreground"
          )}
        >
          {nakladnoyFeedback}
        </p>
      ) : null}

      {!hydrated ? (
        <p className="text-sm text-muted-foreground">Sessiya yuklanmoqda…</p>
      ) : !tenantSlug ? (
        <p className="text-sm text-destructive">
          <Link href="/login" className="underline">
            Qayta kiring
          </Link>
        </p>
      ) : invalid ? (
        <p className="text-sm text-destructive">Zakaz identifikatori noto’g’ri.</p>
      ) : (
        <OrderDetailView tenantSlug={tenantSlug} orderId={orderId} showPrintView={showPrint} />
      )}

      <NakladnoyExportSettingsDialog
        open={nakladnoySettingsOpen}
        onOpenChange={setNakladnoySettingsOpen}
        prefs={nakladnoyPrefs}
        onSave={(next) => {
          setNakladnoyPrefs(next);
          setNakladnoyFeedback(null);
        }}
      />
    </PageShell>
  );
}
