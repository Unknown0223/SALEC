"use client";

import { ProductForm } from "@/components/products/product-form";
import { PageShell } from "@/components/dashboard/page-shell";
import { useAuthStore, useAuthStoreHydrated } from "@/lib/auth-store";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

export default function EditProductPage() {
  const params = useParams();
  const router = useRouter();
  const tenantSlug = useAuthStore((s) => s.tenantSlug);
  const hydrated = useAuthStoreHydrated();
  const rawId = params.id;
  const productId = Number.parseInt(typeof rawId === "string" ? rawId : "", 10);

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

  if (!Number.isFinite(productId) || productId < 1) {
    return (
      <PageShell>
        <p className="text-sm text-destructive">Noto‘g‘ri mahsulot ID.</p>
        <Link href="/products" className="text-sm text-primary underline">
          Ro‘yxatga qaytish
        </Link>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <ProductForm
        tenantSlug={tenantSlug}
        mode="edit"
        productId={productId}
        onSuccess={() => router.push("/products")}
        onCancel={() => router.back()}
      />
    </PageShell>
  );
}
