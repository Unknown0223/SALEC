"use client";

import { PageHeader } from "@/components/dashboard/page-header";
import { PageShell } from "@/components/dashboard/page-shell";
import { ProductCatalogExcelPanel } from "@/components/products/product-catalog-excel-panel";
import { useAuthStore } from "@/lib/auth-store";
import { useQueryClient } from "@tanstack/react-query";

const BACK = "/products?tab=items";

export default function ProductsExcelPage() {
  const tenantSlug = useAuthStore((s) => s.tenantSlug);
  const qc = useQueryClient();

  return (
    <PageShell>
      <PageHeader
        title="Импорт из Excel"
        description="Шаблон, экспорт каталога, полный импорт и обновление только изменённых строк по SKU."
      />
      <ProductCatalogExcelPanel
        tenantSlug={tenantSlug}
        backHref={BACK}
        showCardHeader={false}
        onDone={() => void qc.invalidateQueries({ queryKey: ["products", tenantSlug] })}
      />
    </PageShell>
  );
}
