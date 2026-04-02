"use client";

import { PageHeader } from "@/components/dashboard/page-header";
import { PageShell } from "@/components/dashboard/page-shell";
import { ProductsCatalogWorkspace } from "@/components/products/products-catalog-workspace";

export default function SettingsProductsPage() {
  return (
    <PageShell>
      <PageHeader
        title="Продукты"
        description="Товар, группа товаров, взаимозаменяемые группы, бренд, производитель, сегменты. Категории — отдельная страница."
      />
      <ProductsCatalogWorkspace showSettingsNav hideOuterHeader />
    </PageShell>
  );
}
