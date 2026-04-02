"use client";

import { PageShell } from "@/components/dashboard/page-shell";
import { ProductsCatalogWorkspace } from "@/components/products/products-catalog-workspace";

export default function ProductsPage() {
  return (
    <PageShell>
      <ProductsCatalogWorkspace />
    </PageShell>
  );
}
