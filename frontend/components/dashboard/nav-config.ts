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
      { href: "/settings", label: "Sozlamalar" },
      { href: "/settings/cash-desks", label: "Kassalar (кассы)" }
    ]
  }
];

/** Asosiy yon panel: «Sozlamalar»dan yuqori, suriladigan bo‘lim */
export const dashboardUsersNav: { sectionTitle: string; items: NavItem[] } = {
  sectionTitle: "Пользователи",
  items: [
    { href: "/settings/spravochnik/agents", label: "Агент" },
    { href: "/settings/spravochnik/expeditors", label: "Экспедиторы" },
    { href: "/settings/spravochnik/supervisors", label: "Супервайзер" },
    { href: "/settings/spravochnik/operators", label: "Веб-сотрудники", roles: ["admin"] }
  ]
};

export function flattenNavItems(groups: NavGroup[]): NavItem[] {
  return groups.flatMap((g) => g.items);
}
