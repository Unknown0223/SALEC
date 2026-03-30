import { PageHeader } from "@/components/dashboard/page-header";
import { PageShell } from "@/components/dashboard/page-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";

const modules = [
  {
    href: "/products",
    title: "Mahsulotlar",
    desc: "SKU, narxlar, Excel import",
    emoji: "📦"
  },
  {
    href: "/orders",
    title: "Zakazlar",
    desc: "Ro‘yxat, holat filtri, tafsilot",
    emoji: "📋"
  },
  {
    href: "/clients",
    title: "Klientlar",
    desc: "Qidiruv, kredit, kartochka",
    emoji: "👥"
  },
  {
    href: "/clients/duplicates",
    title: "Dublikatlar",
    desc: "Telefon bo‘yicha birlashtirish",
    emoji: "🔗"
  },
  {
    href: "/bonus-rules/active",
    title: "Bonus qoidalari",
    desc: "CRUD, faollik, preview",
    emoji: "🎁"
  },
  {
    href: "/settings/spravochnik",
    title: "Spravochniklar",
    desc: "Kategoriya, ombor, foydalanuvchi",
    emoji: "📚"
  }
] as const;

export default function DashboardPage() {
  return (
    <PageShell>
      <PageHeader
        title="Boshqaruv"
        description="Tezkor modullar. KPI va grafiklar keyingi bosqichda qo‘shiladi."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {modules.map((m) => (
          <Link key={m.href} href={m.href} className="group block outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xl">
            <Card className="h-full border-border/90 transition-all group-hover:border-primary/35 group-hover:shadow-panel-md">
              <CardHeader className="pb-2">
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-lg" aria-hidden>
                    {m.emoji}
                  </span>
                  <div className="min-w-0">
                    <CardTitle className="text-base group-hover:text-primary transition-colors">{m.title}</CardTitle>
                    <CardDescription className="mt-1">{m.desc}</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <span className="text-xs font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
                  Ochish →
                </span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <p className="text-center text-xs text-muted-foreground">
        <Link className="underline-offset-4 hover:text-primary hover:underline" href="/">
          Bosh sahifa
        </Link>
      </p>
    </PageShell>
  );
}
