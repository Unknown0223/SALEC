export type NavItem = { href: string; label: string; roles?: string[] };

export type NavGroup = { title: string; items: NavItem[] };

export const dashboardNavGroups: NavGroup[] = [
  {
    title: "Asosiy",
    items: [
      { href: "/dashboard", label: "Boshqaruv" },
      { href: "/products", label: "Mahsulotlar" },
      { href: "/orders", label: "Zakazlar" },
      { href: "/stock", label: "Ombor" },
      { href: "/stock/warehouses", label: "Omborlar boshqaruvi" },
      { href: "/clients", label: "Klientlar" },
      { href: "/bonus-rules", label: "Bonus qoidalari" }
    ]
  },
  {
    title: "Sozlamalar",
    items: [
      { href: "/settings", label: "Sozlamalar katalogi" },
      { href: "/settings/territories", label: "Territoriyalar" },
      { href: "/settings/units", label: "O'lchov birliklari" },
      { href: "/settings/branches", label: "Filiallar" },
      { href: "/settings/client-formats", label: "Mijoz formati" },
      { href: "/settings/client-types", label: "Mijoz turi" },
      { href: "/settings/client-categories", label: "Mijoz kategoriyasi" },
      { href: "/settings/product-categories", label: "Mahsulot kategoriyalari" },
      { href: "/products", label: "Mahsulotlar" },
      { href: "/settings/spravochnik", label: "Spravochniklar" },
      { href: "/settings/spravochnik/agents", label: "Agentlar" },
      { href: "/settings/spravochnik/expeditors", label: "Ekspeditorlar" },
      { href: "/settings/company", label: "Kompaniya" },
      { href: "/settings/audit", label: "Audit jurnal", roles: ["admin"] }
    ]
  }
];

export function flattenNavItems(groups: NavGroup[]): NavItem[] {
  return groups.flatMap((g) => g.items);
}
