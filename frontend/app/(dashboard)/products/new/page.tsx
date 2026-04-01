"use client";

import { ProductForm } from "@/components/products/product-form";
import { PageShell } from "@/components/dashboard/page-shell";
import { useAuthStore, useAuthStoreHydrated } from "@/lib/auth-store";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

function NewProductContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tenantSlug = useAuthStore((s) => s.tenantSlug);
  const hydrated = useAuthStoreHydrated();
  const categoryId = searchParams.get("category_id")?.trim() ?? "";

  if (!hydrated) {
    return (
      <PageShell>
        <p className="text-sm text-muted-foreground">Sessiya yuklanmoqda…</p>
      </PageShell>
    );
  }

  if (!tenantSlug) {
    return (
      <PageShell>
        <p className="text-sm text-destructive">
          <Link href="/login" className="underline">
            Qayta kiring
          </Link>
        </p>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <ProductForm
        tenantSlug={tenantSlug}
        mode="create"
        productId={null}
        initialCategoryId={categoryId}
        onSuccess={() => router.push("/products")}
        onCancel={() => router.back()}
      />
    </PageShell>
  );
}

export default function NewProductPage() {
  return (
    <Suspense
      fallback={
        <PageShell>
          <p className="text-sm text-muted-foreground">Yuklanmoqda…</p>
        </PageShell>
      }
    >
      <NewProductContent />
    </Suspense>
  );
}
