"use client";

import { PageShell } from "@/components/dashboard/page-shell";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";

export default function NewReturnRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const qs = searchParams.toString();
    router.replace(`/returns/new?${qs}`);
  }, [router, searchParams]);

  return (
    <PageShell>
      <p className="text-sm text-muted-foreground">Qaytarish sahifasiga yo&apos;naltirilmoqda…</p>
    </PageShell>
  );
}
