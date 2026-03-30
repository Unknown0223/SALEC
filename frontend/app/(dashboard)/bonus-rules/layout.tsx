"use client";

import type { ReactNode } from "react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function BonusRulesLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  const showTabs =
    pathname === "/bonus-rules" ||
    pathname === "/bonus-rules/active" ||
    pathname === "/bonus-rules/inactive" ||
    pathname === "/bonus-rules/strategy";

  return (
    <div className="w-full">
      {showTabs ? (
        <div className="mx-auto mb-4 flex w-full max-w-6xl flex-wrap items-center gap-2 border-b border-border/80 pb-3">
          <Link
            href="/bonus-rules/active"
            className={cn(
              buttonVariants({ variant: pathname === "/bonus-rules/active" ? "default" : "ghost", size: "sm" }),
              pathname === "/bonus-rules/active" ? "" : "text-muted-foreground"
            )}
          >
            Faol
          </Link>
          <Link
            href="/bonus-rules/inactive"
            className={cn(
              buttonVariants({ variant: pathname === "/bonus-rules/inactive" ? "default" : "ghost", size: "sm" }),
              pathname === "/bonus-rules/inactive" ? "" : "text-muted-foreground"
            )}
          >
            Nofaol
          </Link>
          <Link
            href="/bonus-rules/strategy"
            className={cn(
              buttonVariants({ variant: pathname === "/bonus-rules/strategy" ? "default" : "ghost", size: "sm" }),
              pathname === "/bonus-rules/strategy" ? "" : "text-muted-foreground"
            )}
          >
            Strategiya
          </Link>
        </div>
      ) : null}
      {children}
    </div>
  );
}
