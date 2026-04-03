import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { resolveSettingsItemHref, settingsSections } from "@/lib/settings-structure";
import { cn } from "@/lib/utils";

export default function SettingsHubPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Sozlamalar</h1>
        <p className="mt-1 max-w-xl text-sm text-muted-foreground">
          Bo‘limlarni chapdagi ro‘yxatdan tanlang. Tezkor kirish:
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
      </div>
    </div>
  );
}
