"use client";

import { PageHeader } from "@/components/dashboard/page-header";
import { PageShell } from "@/components/dashboard/page-shell";
import { ProductBulkAddPanel } from "@/components/products/product-bulk-add-panel";
import { useAuthStore } from "@/lib/auth-store";
import { useQueryClient } from "@tanstack/react-query";

const BACK = "/products?tab=items";

export default function ProductsBulkPage() {
  const tenantSlug = useAuthStore((s) => s.tenantSlug);
  const qc = useQueryClient();

  return (
    <PageShell>
      <PageHeader
        title="Bir nechta mahsulot"
        description="Bir sahifada ketma-ket bir nechta mahsulot kiriting. Har bir to‘ldirilgan qator uchun kategoriya, nom va o‘lchov birligi majburiy."
      />
      <ProductBulkAddPanel
        tenantSlug={tenantSlug}
        backHref={BACK}
        showCardHeader={false}
        onDone={() => void qc.invalidateQueries({ queryKey: ["products", tenantSlug] })}
      />
    </PageShell>
  );
}
