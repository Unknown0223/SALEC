export type NavItem = { href: string; label: string };

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
      { href: "/settings/spravochnik", label: "Spravochniklar" },
      { href: "/settings/spravochnik/agents", label: "Agentlar" },
      { href: "/settings/spravochnik/expeditors", label: "Ekspeditorlar" },
      { href: "/settings/company", label: "Kompaniya" }
    ]
  }
];

export function flattenNavItems(groups: NavGroup[]): NavItem[] {
  return groups.flatMap((g) => g.items);
}
