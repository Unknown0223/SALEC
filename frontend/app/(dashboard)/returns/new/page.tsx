"use client";

import { PageShell } from "@/components/dashboard/page-shell";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";

/** Eski `/returns/new?...` havolalari → polki qaytarish sahifasi. */
export default function ReturnsNewRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const next = new URLSearchParams();
    next.set("tab", "polki");
    const client_id = searchParams.get("client_id");
    const order_id = searchParams.get("order_id");
    if (client_id) next.set("client_id", client_id);
    if (order_id) {
      next.set("order_id", order_id);
      next.set("polki_mode", "order");
    }
    router.replace(`/returns?${next.toString()}`);
  }, [router, searchParams]);

  return (
    <PageShell>
      <p className="text-sm text-muted-foreground">Qaytarish (polki) sahifasiga yo&apos;naltirilmoqda…</p>
    </PageShell>
  );
}
