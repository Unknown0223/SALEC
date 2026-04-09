import { normKeyTerritoryMatch } from "../../../shared/territory-lalaku-seed";
import { prisma } from "../../config/database";
import { salesRefStoredValue } from "../sales-directions/sales-directions.service";
import {
  clientRefEntriesFromUnknown,
  territoryCityStoredPairs,
  type ClientRefEntryDto
} from "../tenant-settings/tenant-settings.service";

function asRecord(v: unknown): Record<string, unknown> {
  if (v != null && typeof v === "object" && !Array.isArray(v)) {
    return { ...(v as Record<string, unknown>) };
  }
  return {};
}

function strArr(ref: Record<string, unknown> | undefined, k: string): string[] {
  const v = ref?.[k];
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string" && x.trim() !== "").map((s) => s.trim());
}

function normKey(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

function resolveClientRefEntries(
  raw: string | null,
  entries: ClientRefEntryDto[]
): string | null {
  if (raw == null) return null;
  const t = raw.trim();
  if (!t) return null;
  const nk = normKey(t);
  for (const e of entries) {
    if (e.active === false) continue;
    const name = e.name.trim();
    const code = e.code?.trim() ?? "";
    const stored = code !== "" ? code : name;
    if (!stored) continue;
    if (normKey(stored) === nk || (code && normKey(code) === nk) || normKey(name) === nk) {
      return stored;
    }
  }
  return null;
}

function resolveLegacyList(raw: string | null, list: string[]): string | null {
  if (raw == null) return null;
  const t = raw.trim();
  if (!t) return null;
  const nk = normKey(t);
  for (const x of list) {
    const z = x.trim();
    if (!z) continue;
    if (normKey(z) === nk) return z;
  }
  return null;
}

function resolveCityLegacyList(raw: string | null, list: string[]): string | null {
  if (raw == null) return null;
  const t = raw.trim();
  if (!t) return null;
  const nk = cityImportMatchKey(t);
  for (const x of list) {
    const z = x.trim();
    if (!z) continue;
    if (cityImportMatchKey(z) === nk) return z;
  }
  return null;
}

function resolveSalesRow(
  raw: string | null,
  rows: { code: string | null; name: string }[]
): string | null {
  if (raw == null) return null;
  const t = raw.trim();
  if (!t) return null;
  const nk = normKey(t);
  for (const r of rows) {
    const name = r.name.trim();
    const code = r.code?.trim() ?? "";
    const stored = salesRefStoredValue(r);
    if (!stored) continue;
    if (normKey(stored) === nk || (code && normKey(code) === nk) || normKey(name) === nk) {
      return stored;
    }
  }
  return null;
}

/** Hudud daraxti bilan bir xil: apostrof / `'` variantlari, kod yoki nom. */
function cityImportMatchKey(s: string): string {
  return normKeyTerritoryMatch(s).toLowerCase();
}

function resolveCityPairs(
  raw: string | null,
  pairs: { stored: string; name: string }[]
): string | null {
  if (raw == null) return null;
  const t = raw.trim();
  if (!t) return null;
  const nk = cityImportMatchKey(t);
  for (const { stored, name } of pairs) {
    if (cityImportMatchKey(stored) === nk || cityImportMatchKey(name) === nk) return stored;
  }
  return null;
}

export type ClientImportRefMissCounts = {
  category: number;
  client_type_code: number;
  client_format: number;
  sales_channel: number;
  city: number;
};

/**
 * Excel import: spravochnik maydonlarini kod yoki nom bo‘yicha DB da saqlanadigan qiymatga moslaydi.
 */
export class ClientImportRefResolver {
  readonly miss: ClientImportRefMissCounts = {
    category: 0,
    client_type_code: 0,
    client_format: 0,
    sales_channel: 0,
    city: 0
  };

  private constructor(
    private readonly catEntries: ClientRefEntryDto[],
    private readonly catLegacy: string[],
    private readonly typeEntries: ClientRefEntryDto[],
    private readonly typeLegacy: string[],
    private readonly fmtEntries: ClientRefEntryDto[],
    private readonly fmtLegacy: string[],
    private readonly salesRows: { code: string | null; name: string }[],
    private readonly salesLegacy: string[],
    private readonly cityPairs: { stored: string; name: string }[],
    private readonly cityLegacy: string[]
  ) {}

  static async load(tenantId: number): Promise<ClientImportRefResolver> {
    const [tenant, salesRows] = await Promise.all([
      prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { settings: true }
      }),
      prisma.salesChannelRef.findMany({
        where: { tenant_id: tenantId, is_active: true },
        select: { code: true, name: true }
      })
    ]);

    const settingsRef = asRecord(asRecord(tenant?.settings).references);

    const catParsed = clientRefEntriesFromUnknown(settingsRef?.client_category_entries);
    const catLegacy = strArr(settingsRef, "client_categories");
    const typeParsed = clientRefEntriesFromUnknown(settingsRef?.client_type_entries);
    const typeLegacy = strArr(settingsRef, "client_type_codes");
    const fmtParsed = clientRefEntriesFromUnknown(settingsRef?.client_format_entries);
    const fmtLegacy = strArr(settingsRef, "client_formats");
    const salesLegacy = strArr(settingsRef, "sales_channels");
    const cityLegacy = strArr(settingsRef, "client_cities");
    const cityPairs = territoryCityStoredPairs(settingsRef);

    return new ClientImportRefResolver(
      catParsed,
      catLegacy,
      typeParsed,
      typeLegacy,
      fmtParsed,
      fmtLegacy,
      salesRows,
      salesLegacy,
      cityPairs,
      cityLegacy
    );
  }

  resolveCategory(raw: string | null): string | null {
    if (raw == null || raw.trim() === "") return null;
    let v: string | null = null;
    if (this.catEntries.length > 0) v = resolveClientRefEntries(raw, this.catEntries);
    if (v == null) v = resolveLegacyList(raw, this.catLegacy);
    if (v == null) this.miss.category += 1;
    return v;
  }

  resolveClientType(raw: string | null): string | null {
    if (raw == null || raw.trim() === "") return null;
    let v: string | null = null;
    if (this.typeEntries.length > 0) v = resolveClientRefEntries(raw, this.typeEntries);
    if (v == null) v = resolveLegacyList(raw, this.typeLegacy);
    if (v == null) this.miss.client_type_code += 1;
    return v;
  }

  resolveClientFormat(raw: string | null): string | null {
    if (raw == null || raw.trim() === "") return null;
    let v: string | null = null;
    if (this.fmtEntries.length > 0) v = resolveClientRefEntries(raw, this.fmtEntries);
    if (v == null) v = resolveLegacyList(raw, this.fmtLegacy);
    if (v == null) this.miss.client_format += 1;
    return v;
  }

  resolveSalesChannel(raw: string | null): string | null {
    if (raw == null || raw.trim() === "") return null;
    let v: string | null = null;
    if (this.salesRows.length > 0) v = resolveSalesRow(raw, this.salesRows);
    if (v == null) v = resolveLegacyList(raw, this.salesLegacy);
    if (v == null) this.miss.sales_channel += 1;
    return v;
  }

  resolveCity(raw: string | null): string | null {
    if (raw == null || raw.trim() === "") return null;
    let v: string | null = null;
    if (this.cityPairs.length > 0) v = resolveCityPairs(raw, this.cityPairs);
    if (v == null) v = resolveCityLegacyList(raw, this.cityLegacy);
    if (v == null) this.miss.city += 1;
    return v;
  }

  summarizeMisses(): string[] {
    const out: string[] = [];
    const m = this.miss;
    if (m.category > 0) {
      out.push(
        `Import: ${m.category} qatorda «Категория клиента (код)» qiymati spravochnikda topilmadi — maydon bo‘sh qoldirildi.`
      );
    }
    if (m.client_type_code > 0) {
      out.push(
        `Import: ${m.client_type_code} qatorda «Тип клиента (код)» qiymati spravochnikda topilmadi — maydon bo‘sh qoldirildi.`
      );
    }
    if (m.client_format > 0) {
      out.push(
        `Import: ${m.client_format} qatorda «Формат (код)» qiymati spravochnikda topilmadi — maydon bo‘sh qoldirildi.`
      );
    }
    if (m.sales_channel > 0) {
      out.push(
        `Import: ${m.sales_channel} qatorda «Торговый канал (код)» qiymati spravochnikda topilmadi — maydon bo‘sh qoldirildi.`
      );
    }
    if (m.city > 0) {
      out.push(
        `Import: ${m.city} qatorda «Город (код)» qiymati spravochnik / hudud daraxtida topilmadi — maydon bo‘sh qoldirildi.`
      );
    }
    return out;
  }
}
