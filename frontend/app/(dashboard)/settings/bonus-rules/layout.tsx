"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { usePathname } from "next/navigation";

const BR = "/settings/bonus-rules";

export default function BonusRulesLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  const showTabs =
    pathname === BR ||
    pathname === `${BR}/active` ||
    pathname === `${BR}/inactive` ||
    pathname === `${BR}/strategy`;

  const isActiveList = pathname === `${BR}/active` || pathname === BR;
  const isInactiveList = pathname === `${BR}/inactive`;
  const isStrategy = pathname === `${BR}/strategy`;

  return (
    <div className="w-full">
      {showTabs ? (
        <div className="mb-4 flex w-full min-w-0 flex-wrap gap-1 border-b border-border bg-muted/25 px-2 py-0 sm:px-3">
          <Link
            href={`${BR}/active`}
            className={cn(
              "-mb-px inline-flex border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
              isActiveList
                ? "border-teal-600 text-teal-800 dark:border-teal-500 dark:text-teal-400"
                : "border-transparent text-foreground/65 hover:text-foreground"
            )}
          >
            Активные
          </Link>
          <Link
            href={`${BR}/inactive`}
            className={cn(
              "-mb-px inline-flex border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
              isInactiveList
                ? "border-teal-600 text-teal-800 dark:border-teal-500 dark:text-teal-400"
                : "border-transparent text-foreground/65 hover:text-foreground"
            )}
          >
            Неактивные
          </Link>
          <Link
            href={`${BR}/strategy`}
            className={cn(
              "-mb-px inline-flex border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
              isStrategy
                ? "border-teal-600 text-teal-800 dark:border-teal-500 dark:text-teal-400"
                : "border-transparent text-foreground/65 hover:text-foreground"
            )}
          >
            Стратегия
          </Link>
        </div>
      ) : null}
      {children}
    </div>
  );
}
