import { PageHeader } from "@/components/dashboard/page-header";
import { PageShell } from "@/components/dashboard/page-shell";
import { buttonVariants } from "@/components/ui/button-variants";
import { findSettingsItem, resolveSettingsItemHref, settingsSections } from "@/lib/settings-structure";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { notFound } from "next/navigation";

type Props = {
  params: {
    section: string;
    item: string;
  };
};

export default function SettingsCatalogItemPage({ params }: Props) {
  const section = settingsSections.find((s) => s.slug === params.section);
  const item = findSettingsItem(params.section, params.item);

  if (!section || !item) {
    notFound();
  }

  const realHref = resolveSettingsItemHref(item);
  const isMappedToExisting = realHref !== item.href;

  return (
    <PageShell className="max-w-3xl">
      <PageHeader title={item.title} description={`${section.title} bo'limi elementi`} />
      <div className="rounded-lg border bg-card p-5">
        <div className="mb-4 flex items-center gap-2">
          {item.status === "planned" ? (
            <span className="rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">Rejalashtirilgan</span>
          ) : (
            <span className="rounded-md bg-emerald-600 px-2 py-1 text-xs font-medium text-white">Mavjud</span>
          )}
          {isMappedToExisting ? (
            <span className="rounded-md border px-2 py-1 text-xs font-medium text-muted-foreground">
              Joriy sahifaga moslashtirilgan
            </span>
          ) : null}
        </div>

        {isMappedToExisting ? (
          <p className="mb-4 text-sm text-muted-foreground">
            Bu element hozircha mavjud modulga ulangan. To'liq alohida sahifa keyin ajratiladi.
          </p>
        ) : (
          <p className="mb-4 text-sm text-muted-foreground">
            Bu bo'lim uchun alohida funksional sahifa hali tayyor emas. Hozircha rejalashtirilgan placeholder.
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <Link className={cn(buttonVariants({ variant: "default" }))} href={realHref}>
            {isMappedToExisting ? "Mavjud sahifani ochish" : "Placeholder manzili"}
          </Link>
          <Link className={cn(buttonVariants({ variant: "outline" }))} href="/settings">
            Sozlamalar strukturaga qaytish
          </Link>
        </div>
      </div>
    </PageShell>
  );
}
