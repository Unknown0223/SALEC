"use client";

import type { ReactNode } from "react";
import { buttonVariants } from "@/components/ui/button-variants";
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

  return (
    <div className="w-full">
      {showTabs ? (
        <div className="mx-auto mb-4 flex w-full max-w-6xl flex-wrap items-center gap-2 border-b border-border/80 pb-3">
          <Link
            href={`${BR}/active`}
            className={cn(
              buttonVariants({
                variant: pathname === `${BR}/active` ? "default" : "ghost",
                size: "sm"
              }),
              pathname === `${BR}/active` ? "" : "text-muted-foreground"
            )}
          >
            Faol
          </Link>
          <Link
            href={`${BR}/inactive`}
            className={cn(
              buttonVariants({
                variant: pathname === `${BR}/inactive` ? "default" : "ghost",
                size: "sm"
              }),
              pathname === `${BR}/inactive` ? "" : "text-muted-foreground"
            )}
          >
            Nofaol
          </Link>
          <Link
            href={`${BR}/strategy`}
            className={cn(
              buttonVariants({
                variant: pathname === `${BR}/strategy` ? "default" : "ghost",
                size: "sm"
              }),
              pathname === `${BR}/strategy` ? "" : "text-muted-foreground"
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
