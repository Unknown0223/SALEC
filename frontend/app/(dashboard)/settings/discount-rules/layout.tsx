"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { usePathname } from "next/navigation";

const DR = "/settings/discount-rules";

export default function DiscountRulesLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  const showTabs =
    pathname === DR || pathname === `${DR}/active` || pathname === `${DR}/inactive`;

  const isActiveList = pathname === `${DR}/active` || pathname === DR;
  const isInactiveList = pathname === `${DR}/inactive`;

  return (
    <div className="w-full">
      {showTabs ? (
        <div className="mb-4 flex w-full min-w-0 flex-wrap gap-1 border-b border-border bg-muted/25 px-2 py-0 sm:px-3">
          <Link
            href={`${DR}/active`}
            className={cn(
              "-mb-px inline-flex border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
              isActiveList
                ? "border-teal-600 text-teal-800 dark:border-teal-500 dark:text-teal-400"
                : "border-transparent text-foreground/65 hover:text-foreground"
            )}
          >
            Faol
          </Link>
          <Link
            href={`${DR}/inactive`}
            className={cn(
              "-mb-px inline-flex border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
              isInactiveList
                ? "border-teal-600 text-teal-800 dark:border-teal-500 dark:text-teal-400"
                : "border-transparent text-foreground/65 hover:text-foreground"
            )}
          >
            Nofaol
          </Link>
          <Link
            href="/settings/bonus-rules/strategy"
            className={cn(
              "-mb-px ml-auto inline-flex border-b-2 border-transparent px-3 py-2.5 text-sm font-medium text-foreground/65 transition-colors hover:text-foreground"
            )}
            title="Birlashtirish (stack) — bonus va chegirmalar uchun umumiy strategiya"
          >
            Strategiya →
          </Link>
        </div>
      ) : null}
      {children}
    </div>
  );
}
