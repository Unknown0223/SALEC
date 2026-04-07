export type NavItem = { href: string; label: string; roles?: string[] };

export type NavGroup = { title: string; items: NavItem[] };

/** Rasm (Lalaku-style) bo‘yicha: ombor */
export const dashboardStockNav: { sectionTitle: string; items: NavItem[] } = {
  sectionTitle: "Склад",
  items: [
    { href: "/stock", label: "Приход и остаток" },
    { href: "/stock/picking", label: "Комплектация" },
    { href: "/stock/correction", label: "Корректировка склада", roles: ["admin"] },
    { href: "/stock/receipts", label: "Поступление" },
    { href: "/stock/transfers", label: "Перемещение" },
    { href: "/stock/warehouses", label: "Список складов" },
    { href: "/stock/balances", label: "Остатки товаров" },
    { href: "/stock/low", label: "Низкий остаток" },
    { href: "/stock/inventory-counts", label: "Инвентаризация", roles: ["admin", "operator"] }
  ]
};

/** Заявки — Lalaku: ДЕЙСТВИЯ + УПРАВЛЕНИЕ ЗАКАЗАМИ */
export const dashboardOrdersNav: {
  sectionTitle: string;
  groups: { title: string; items: NavItem[] }[];
} = {
  sectionTitle: "Заявки",
  groups: [
    {
      title: "ДЕЙСТВИЯ",
      items: [
        { href: "/orders/new?type=order", label: "Создать заказ" },
        { href: "/orders/new?type=return", label: "Создать возврат с полки" },
        { href: "/orders/new?type=return_by_order", label: "Создать возврат по заказу" },
        { href: "/orders/new?type=exchange", label: "Создать обмен" }
      ]
    },
    {
      title: "УПРАВЛЕНИЕ ЗАКАЗАМИ",
      items: [
        { href: "/orders", label: "Заявки" },
        { href: "/orders?status=cancelled", label: "Отказы" }
      ]
    }
  ]
};

export function dashboardOrdersNavFlatItems(): NavItem[] {
  return dashboardOrdersNav.groups.flatMap((g) => g.items);
}

/** Foydalanuvchilar / spravochnik */
export const dashboardUsersNav: { sectionTitle: string; items: NavItem[] } = {
  sectionTitle: "Пользователи",
  items: [
    { href: "/settings/spravochnik/agents", label: "Агент" },
    { href: "/settings/spravochnik/expeditors", label: "Экспедиторы" },
    { href: "/settings/spravochnik/supervisors", label: "Супервайзер" },
    { href: "/settings/spravochnik/operators", label: "Веб-сотрудники", roles: ["admin"] }
  ]
};

/** Chap panel tartibi — referens UI (yashil sidebar) */
export type SidebarLayoutEntry =
  | { kind: "link"; item: NavItem }
  | { kind: "orders" }
  | { kind: "stock" }
  | { kind: "users" };

export const dashboardSidebarLayout: SidebarLayoutEntry[] = [
  { kind: "link", item: { href: "/dashboard", label: "Дашборд" } },
  { kind: "orders" },
  { kind: "link", item: { href: "/clients", label: "Клиенты" } },
  { kind: "link", item: { href: "/territories", label: "Территории" } },
  { kind: "stock" },
  { kind: "link", item: { href: "/visits", label: "Визиты" } },
  { kind: "link", item: { href: "/tasks", label: "Задачи" } },
  { kind: "link", item: { href: "/routes", label: "Маршрут" } },
  { kind: "link", item: { href: "/settings/cash-desks", label: "Касса" } },
  { kind: "link", item: { href: "/payments", label: "Платежи" } },
  { kind: "link", item: { href: "/expenses", label: "Расходы" } },
  { kind: "link", item: { href: "/reports", label: "Отчёты" } },
  { kind: "users" },
  { kind: "link", item: { href: "/settings", label: "Настройки" } }
];

/** Mobil menyu — barcha havolalar (ixtiyoriy tartibsiz) */
export function flattenMobileNavItems(): NavItem[] {
  const out: NavItem[] = [];
  for (const e of dashboardSidebarLayout) {
    if (e.kind === "link") {
      out.push(e.item);
    } else if (e.kind === "orders") {
      out.push(...dashboardOrdersNavFlatItems());
    } else if (e.kind === "stock") {
      out.push(...dashboardStockNav.items);
    } else if (e.kind === "users") {
      out.push(...dashboardUsersNav.items);
    }
  }
  return out;
}

/** Orqalik: bo‘sh guruh (eski importlar buzilmasin) */
export const dashboardNavGroups: NavGroup[] = [
  {
    title: "Меню",
    items: [
      { href: "/dashboard", label: "Дашборд" },
      { href: "/clients", label: "Клиенты" },
      { href: "/settings", label: "Настройки" }
    ]
  }
];

export function flattenNavItems(groups: NavGroup[]): NavItem[] {
  return groups.flatMap((g) => g.items);
}
