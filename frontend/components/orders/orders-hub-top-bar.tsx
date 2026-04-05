"use client";

import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";
import { ClipboardCheck, Home, MapPinned, Wallet } from "lucide-react";
import Link from "next/link";

/**
 * Lalaku «Заявки» dagi yuqori qatorga o‘xshash: marshrut / tezkor havolalar (GPS + «избранное» analogi).
 */
export function OrdersHubTopBar() {
  return (
    <div
      className="mb-5 flex min-h-11 flex-wrap items-center gap-2 border-b border-border/70 pb-3 md:min-h-12"
      role="navigation"
      aria-label="Zakazlar tezkor paneli"
    >
      <Link
        href="/routes"
        className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5 font-medium")}
      >
        <MapPinned className="size-4 shrink-0" aria-hidden />
        Marshrut
      </Link>
      <Link
        href="/visits"
        className={cn(
          buttonVariants({ variant: "ghost", size: "sm" }),
          "gap-1.5 text-muted-foreground hover:text-foreground"
        )}
      >
        <ClipboardCheck className="size-4 shrink-0" aria-hidden />
        Tashriflar
      </Link>
      <span className="hidden h-6 w-px shrink-0 bg-border sm:block" aria-hidden />
      <div className="flex flex-wrap items-center gap-1 sm:ml-auto">
        <Link
          href="/dashboard"
          className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "text-xs sm:text-sm")}
        >
          <Home className="mr-1 size-3.5 opacity-80" aria-hidden />
          Boshqaruv
        </Link>
        <Link
          href="/payments"
          className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "text-xs sm:text-sm")}
        >
          <Wallet className="mr-1 size-3.5 opacity-80" aria-hidden />
          To‘lovlar
        </Link>
      </div>
    </div>
  );
}
