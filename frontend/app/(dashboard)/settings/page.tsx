"use client";

import Link from "next/link";
import { buttonVariants } from "@/components/ui/button-variants";
import { useEffectiveRole } from "@/lib/auth-store";
import { resolveSettingsItemHref, settingsSections } from "@/lib/settings-structure";
import { cn } from "@/lib/utils";

/** SETTINGS_STRUCTURE_PLAN.md — prioritet (1-navbat) bo‘yicha tezkor havolalar. */
const PRIORITY_QUICK_LINKS: { label: string; href: string }[] = [
  { label: "Должности", href: "/settings/web-staff-position-presets" },
  { label: "Валюты", href: "/settings/currencies" },
  { label: "Цена", href: "/settings/prices" },
  { label: "Направление торговли", href: "/settings/sales-directions/trade" },
  { label: "Причины заявок", href: "/settings/reasons/request-types" },
  { label: "Типы задач", href: "/settings/reasons/task-types" },
  { label: "Тип инвентаря", href: "/settings/inventory/type" },
  { label: "Принтеры", href: "/settings/equipment/printers" }
];

export default function SettingsHubPage() {
  const role = useEffectiveRole();
  const priorityLinks =
    role === "admin"
      ? PRIORITY_QUICK_LINKS
      : PRIORITY_QUICK_LINKS.filter((l) => l.href !== "/settings/web-staff-position-presets");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Sozlamalar</h1>
        <p className="mt-1 max-w-xl text-sm text-muted-foreground">
          Bo‘limlarni chapdagi ro‘yxatdan tanlang. Tezkor kirish:
        </p>
        <p className="mt-2 max-w-xl text-sm text-muted-foreground">
          Klassik ro‘yxat (foydalanuvchilar, mijoz tanlovlari):{" "}
          <Link href="/settings/spravochnik" className="text-primary underline-offset-4 hover:underline">
            Spravochniklar
          </Link>
          .
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link
          href={resolveSettingsItemHref(settingsSections[0]!.items[0]!)}
          className={cn(buttonVariants({ variant: "default", size: "sm" }))}
        >
          Территория
        </Link>
        <Link href="/settings/cash-desks" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
          Кассы
        </Link>
        <Link href="/settings/branches" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
          Филиалы
        </Link>
        <Link href="/settings/units" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
          Единицы измерения
        </Link>
        {priorityLinks.map(({ label, href }) => (
          <Link
            key={href}
            href={href}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            {label}
          </Link>
        ))}
      </div>
    </div>
  );
}
