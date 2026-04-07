"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Eski havola: yangi oqim `/stock/transfers/amaliyot` da. */
export default function LegacyNewTransferRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/stock/transfers/amaliyot");
  }, [router]);
  return <p className="p-4 text-sm text-muted-foreground">Yo‘naltirilmoqda…</p>;
}
