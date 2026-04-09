export type SettingsItem = {
  title: string;
  slug: string;
  href: string;
  status: "available" | "planned";
  /** Bo‘sh bo‘lmasa — faqat ushbu rollar katalogda punktni ko‘radi (`RBAC.md` bilan sinxron). */
  requiredRoles?: readonly string[];
  /** Pastga ochiladigan pastki punktlar (masalan «Пользователи» → Агент, Экспедиторы…) */
  children?: SettingsItem[];
};

export type SettingsSection = {
  title: string;
  slug: string;
  items: SettingsItem[];
};

function toSlug(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
  if (slug) return slug;
  return "item";
}

function makeItem(
  sectionSlug: string,
  title: string,
  status: "available" | "planned",
  index: number,
  requiredRoles?: readonly string[]
): SettingsItem {
  const baseSlug = toSlug(title);
  const slug = `${baseSlug}-${index + 1}`;
  return {
    title,
    slug,
    href: `/settings/catalog/${sectionSlug}/${slug}`,
    status,
    ...(requiredRoles?.length ? { requiredRoles } : {})
  };
}

export const settingsSections: SettingsSection[] = [
  {
    title: "Интерфейс и оформление",
    slug: "interfeys-oformlenie",
    items: [
      {
        title: "Тема и цвета",
        slug: "tema-tsveta",
        href: "/settings/appearance",
        status: "available"
      }
    ]
  },
  {
    title: "Основные настройки",
    slug: "osnovnye-nastroiki",
    items: [
      makeItem("osnovnye-nastroiki", "Территория", "available", 0),
      makeItem("osnovnye-nastroiki", "Единицы измерения", "available", 1),
      makeItem("osnovnye-nastroiki", "Поставщики", "available", 2),
      makeItem("osnovnye-nastroiki", "Филиалы", "available", 3),
      {
        title: "Должности",
        slug: "dolzhnosti-osnovnye",
        href: "/settings/catalog/osnovnye-nastroiki/dolzhnosti-osnovnye",
        status: "available",
        requiredRoles: ["admin"] as const
      }
    ]
  },
  {
    title: "Клиенты",
    slug: "klienty",
    items: [
      makeItem("klienty", "Формат клиента", "available", 0),
      makeItem("klienty", "Тип клиента", "available", 1),
      makeItem("klienty", "Категория клиента", "available", 2)
    ]
  },
  {
    title: "Продукты",
    slug: "produkty",
    items: [
      makeItem("produkty", "Категория продукта", "available", 0),
      {
        title: "Продукт",
        slug: "produkt-tab",
        href: "/settings/products",
        status: "available"
      },
      {
        title: "Группа товаров",
        slug: "gruppa-tovarov-tab",
        href: "/settings/products?tab=product-groups",
        status: "available"
      },
      {
        title: "Группа взаимозаменяемых",
        slug: "gruppa-vzaimozamenyaemykh-tab",
        href: "/settings/products?tab=interchangeable",
        status: "available"
      },
      {
        title: "Бренд",
        slug: "brend-tab",
        href: "/settings/products?tab=brands",
        status: "available"
      },
      {
        title: "Производитель",
        slug: "proizvoditel-tab",
        href: "/settings/products?tab=manufacturers",
        status: "available"
      },
      {
        title: "Сегменты",
        slug: "segmenty-tab",
        href: "/settings/products?tab=segments",
        status: "available"
      }
    ]
  },
  {
    title: "Финансы",
    slug: "finansy",
    items: [
      makeItem("finansy", "Валюты", "available", 0),
      makeItem("finansy", "Способ оплаты", "available", 1),
      makeItem("finansy", "Тип цены", "available", 2),
      makeItem("finansy", "Цена", "available", 3)
    ]
  },
  {
    title: "Направления продаж",
    slug: "napravleniia-prodazh",
    items: [
      makeItem("napravleniia-prodazh", "Направление торговли", "available", 0),
      makeItem("napravleniia-prodazh", "Канал продаж", "available", 1),
      makeItem("napravleniia-prodazh", "Группа KPI", "available", 2)
    ]
  },
  {
    title: "Бонусы и скидки",
    slug: "bonusy-i-skidki",
    items: [
      {
        title: "Бонусы",
        slug: "bonus-pravila",
        href: "/settings/bonus-rules",
        status: "available"
      },
      makeItem("bonusy-i-skidki", "Скидки", "available", 1),
      makeItem("bonusy-i-skidki", "RLP бонусы", "available", 2),
      makeItem("bonusy-i-skidki", "Надбавки и вычеты к зарплате", "available", 3)
    ]
  },
  {
    title: "Причины и категории",
    slug: "prichiny-i-kategorii",
    items: [
      makeItem("prichiny-i-kategorii", "Причины заявок", "available", 0),
      makeItem("prichiny-i-kategorii", "Причины отказа", "available", 1),
      makeItem("prichiny-i-kategorii", "Причины отмены оплаты", "available", 2),
      makeItem("prichiny-i-kategorii", "Примечание к заказу", "available", 3),
      makeItem("prichiny-i-kategorii", "Типы задач", "available", 4),
      makeItem("prichiny-i-kategorii", "Категория фотоотчёта", "available", 5),
      makeItem("prichiny-i-kategorii", "Категория доходов/расходов", "available", 6)
    ]
  },
  {
    title: "Инвентарь и упаковка",
    slug: "inventar-i-upakovka",
    items: [
      makeItem("inventar-i-upakovka", "Тип инвентаря", "available", 0),
      makeItem("inventar-i-upakovka", "Тип коробки", "available", 1)
    ]
  },
  {
    title: "Оборудование",
    slug: "oborudovanie",
    items: [
      makeItem("oborudovanie", "Принтеры", "available", 0),
      makeItem("oborudovanie", "Тара", "available", 1)
    ]
  },
  {
    title: "База знаний",
    slug: "baza-znanii",
    items: [
      makeItem("baza-znanii", "Тип базы знания", "available", 0),
      makeItem("baza-znanii", "База знаний", "available", 1)
    ]
  },
  {
    title: "Справочники и персонал",
    slug: "spravochniki-personal",
    items: [
      makeItem("spravochniki-personal", "Справочники", "available", 0),
      makeItem("spravochniki-personal", "Компания", "available", 1),
      makeItem("spravochniki-personal", "Должности веб-сотрудников", "available", 2, ["admin"] as const)
    ]
  },
  {
    title: "Система",
    slug: "sistema",
    items: [makeItem("sistema", "Аудит", "available", 0, ["admin"] as const)]
  }
];

const existingHrefByItemTitle: Record<string, string> = {
  "территория": "/settings/territories",
  "единицы измерения": "/settings/units",
  "настройка счёта": "/settings/catalog/osnovnye-nastroiki/item-3",
  "филиалы": "/settings/branches",
  "должности": "/settings/web-staff-position-presets",
  "формат клиента": "/settings/client-formats",
  "тип клиента": "/settings/client-types",
  "категория клиента": "/settings/client-categories",
  "категория продукта": "/settings/product-categories",
  "продукт": "/settings/products",
  "группа товаров": "/settings/products?tab=product-groups",
  "группа взаимозаменяемых": "/settings/products?tab=interchangeable",
  "бренд": "/settings/products?tab=brands",
  "производитель": "/settings/products?tab=manufacturers",
  "сегменты": "/settings/products?tab=segments",
  "способ оплаты": "/settings/payment-methods",
  "тип цены": "/settings/price-types",
  "валюты": "/settings/currencies",
  "цена": "/settings/prices",
  "кассы": "/settings/cash-desks",
  "направление торговли": "/settings/sales-directions/trade",
  "канал продаж": "/settings/sales-directions/sales-channels",
  "группа kpi": "/settings/sales-directions/kpi-groups",
  "бонусы": "/settings/bonus-rules",
  "скидки": "/settings/bonus-stack",
  "rlp бонусы": "/settings/bonus-stack",
  "причины отказа": "/settings/reasons/refusal-reasons",
  "справочники": "/settings/spravochnik",
  "пользователи": "/settings/spravochnik/agents",
  "агент": "/settings/spravochnik/agents",
  "агенты": "/settings/spravochnik/agents",
  "экспедиторы": "/settings/spravochnik/expeditors",
  "супервайзер": "/settings/spravochnik/supervisors",
  "супервизоры": "/settings/spravochnik/supervisors",
  "оператор": "/settings/spravochnik/operators",
  "операторы": "/settings/spravochnik/operators",
  "веб-сотрудники": "/settings/spravochnik/operators",
  "веб сотрудники": "/settings/spravochnik/operators",
  "компания": "/settings/company",
  "аудит": "/settings/audit",
  "должности веб-сотрудников": "/settings/web-staff-position-presets",
  "должности веб сотрудников": "/settings/web-staff-position-presets",
  "lavozimlar": "/settings/web-staff-position-presets",
  "веб ходим лавозимлари": "/settings/web-staff-position-presets",
  "причины заявок": "/settings/reasons/request-types",
  "причины отмены оплаты": "/settings/reasons/cancel-payment-reasons",
  "примечание к заказу": "/settings/reasons/order-notes",
  "типы задач": "/settings/reasons/task-types",
  "категория фотоотчёта": "/settings/reasons/photo-categories",
  "категория доходов/расходов": "/settings/reasons/finance-categories",
  "тип инвентаря": "/settings/inventory/type",
  "тип коробки": "/settings/inventory/box-type",
  "принтеры": "/settings/equipment/printers",
  "тара": "/settings/equipment/tare",
  "тип базы знания": "/settings/knowledge-base/type",
  "база знаний": "/settings/knowledge-base/base",
  "надбавки и вычеты к зарплате": "/settings/payroll/adjustments",
  "поставщики": "/settings/suppliers",
  "тема и цвета": "/settings/appearance"
};

export function resolveSettingsItemHref(item: SettingsItem): string {
  return existingHrefByItemTitle[item.title.toLowerCase()] ?? item.href;
}

function filterSettingsItemByRole(item: SettingsItem, role: string | null): SettingsItem | null {
  if (item.requiredRoles?.length) {
    if (!role || !item.requiredRoles.includes(role)) return null;
  }
  if (item.children?.length) {
    const kids = item.children.filter(
      (c) => !c.requiredRoles?.length || (role != null && c.requiredRoles.includes(role))
    );
    if (!kids.length) return null;
    return { ...item, children: kids };
  }
  return item;
}

/** Katalog yon paneli: `requiredRoles` bo‘yicha (null rol — admin-only punktlar yashirin). */
export function filterSettingsSectionsByRole(
  sections: SettingsSection[],
  role: string | null
): SettingsSection[] {
  const out: SettingsSection[] = [];
  for (const section of sections) {
    const items = section.items
      .map((item) => filterSettingsItemByRole(item, role))
      .filter((item): item is SettingsItem => item != null);
    if (items.length) out.push({ ...section, items });
  }
  return out;
}

export function findSettingsItem(sectionSlug: string, itemSlug: string): SettingsItem | null {
  const section = settingsSections.find((s) => s.slug === sectionSlug);
  if (!section) return null;
  for (const item of section.items) {
    if (item.slug === itemSlug) return item;
    const child = item.children?.find((c) => c.slug === itemSlug);
    if (child) return child;
  }
  return null;
}
