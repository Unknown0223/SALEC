export type SettingsItem = {
  title: string;
  slug: string;
  href: string;
  status: "available" | "planned";
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

function makeItem(sectionSlug: string, title: string, status: "available" | "planned", index: number): SettingsItem {
  const baseSlug = toSlug(title);
  const slug = `${baseSlug}-${index + 1}`;
  return {
    title,
    slug,
    href: `/settings/catalog/${sectionSlug}/${slug}`,
    status
  };
}

export const settingsSections: SettingsSection[] = [
  {
    title: "Основные настройки",
    slug: "osnovnye-nastroiki",
    items: [
      makeItem("osnovnye-nastroiki", "Территория", "available", 0),
      makeItem("osnovnye-nastroiki", "Единицы измерения", "available", 1),
      makeItem("osnovnye-nastroiki", "Филиалы", "available", 2)
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
      makeItem("produkty", "Продукт", "available", 1)
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
      makeItem("bonusy-i-skidki", "Бонусы", "available", 0),
      makeItem("bonusy-i-skidki", "Скидки", "available", 1),
      makeItem("bonusy-i-skidki", "RLP бонусы", "available", 2),
      makeItem("bonusy-i-skidki", "Надбавки и вычеты к зарплате", "planned", 3)
    ]
  },
  {
    title: "Причины и категории",
    slug: "prichiny-i-kategorii",
    items: [
      makeItem("prichiny-i-kategorii", "Причины заявок", "planned", 0),
      makeItem("prichiny-i-kategorii", "Причины отказа", "available", 1),
      makeItem("prichiny-i-kategorii", "Причины отмены оплаты", "planned", 2),
      makeItem("prichiny-i-kategorii", "Примечание к заказу", "planned", 3),
      makeItem("prichiny-i-kategorii", "Типы задач", "planned", 4),
      makeItem("prichiny-i-kategorii", "Категория фотоотчёта", "planned", 5),
      makeItem("prichiny-i-kategorii", "Категория доходов/расходов", "planned", 6)
    ]
  },
  {
    title: "Инвентарь и упаковка",
    slug: "inventar-i-upakovka",
    items: [
      makeItem("inventar-i-upakovka", "Тип инвентаря", "planned", 0),
      makeItem("inventar-i-upakovka", "Тип коробки", "planned", 1)
    ]
  },
  {
    title: "Оборудование",
    slug: "oborudovanie",
    items: [
      makeItem("oborudovanie", "Принтеры", "planned", 0),
      makeItem("oborudovanie", "Тара", "planned", 1)
    ]
  },
  {
    title: "База знаний",
    slug: "baza-znanii",
    items: [
      makeItem("baza-znanii", "Тип базы знания", "planned", 0),
      makeItem("baza-znanii", "База знаний", "planned", 1)
    ]
  },
  {
    title: "Справочники и персонал",
    slug: "spravochniki-personal",
    items: [
      makeItem("spravochniki-personal", "Справочники", "available", 0),
      makeItem("spravochniki-personal", "Компания", "available", 1)
    ]
  },
  {
    title: "Система",
    slug: "sistema",
    items: [makeItem("sistema", "Аудит", "available", 0)]
  }
];

const existingHrefByItemTitle: Record<string, string> = {
  "территория": "/settings/territories",
  "единицы измерения": "/settings/units",
  "филиалы": "/settings/branches",
  "формат клиента": "/settings/client-formats",
  "тип клиента": "/settings/client-types",
  "категория клиента": "/settings/client-categories",
  "категория продукта": "/settings/product-categories",
  "продукт": "/settings/products",
  "способ оплаты": "/settings/payment-methods",
  "тип цены": "/settings/price-types",
  "валюты": "/settings/currencies",
  "цена": "/settings/prices",
  "направление торговли": "/settings/sales-directions/trade",
  "канал продаж": "/settings/sales-directions/sales-channels",
  "группа kpi": "/settings/sales-directions/kpi-groups",
  "бонусы": "/settings/bonus-stack",
  "скидки": "/settings/bonus-stack",
  "rlp бонусы": "/settings/bonus-stack",
  "причины отказа": "/settings/company#ref-return-reasons",
  "справочники": "/settings/spravochnik",
  "пользователи": "/settings/spravochnik/agents",
  "агент": "/settings/spravochnik/agents",
  "агенты": "/settings/spravochnik/agents",
  "экспедиторы": "/settings/spravochnik/expeditors",
  "супервайзер": "/settings/spravochnik/supervisors",
  "супервизоры": "/settings/spravochnik/supervisors",
  "компания": "/settings/company",
  "аудит": "/settings/audit"
};

export function resolveSettingsItemHref(item: SettingsItem): string {
  return existingHrefByItemTitle[item.title.toLowerCase()] ?? item.href;
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
