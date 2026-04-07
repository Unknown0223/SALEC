/**
 * Lalaku zona → viloyat daraxti (tenant.settings.references.territory_nodes).
 * Backend import va frontend «Test ma’lumot» bir xil manbadan.
 */

export type LalakuTerritoryNode = {
  id: string;
  name: string;
  code: string | null;
  comment: string | null;
  sort_order: number | null;
  active: boolean;
  children: LalakuTerritoryNode[];
};

export const ZONE_ROOT_NAMES = ["FV", "SOUTH-WEST", "TASH OBL", "TASHKENT"] as const;

export const REGION_ZONE_ROWS: { region: string; zone: string }[] = [
  { region: "XORAZM VILOYATI", zone: "SOUTH-WEST" },
  { region: "TOSHKENT VILOYATI", zone: "TASH OBL" },
  { region: "TOSHKENT SHAHAR", zone: "TASHKENT" },
  { region: "SURXANDARYO VILOYATI", zone: "SOUTH-WEST" },
  { region: "SIRDARYO VILOYATI", zone: "SOUTH-WEST" },
  { region: "SAMARQAND VILOYATI", zone: "SOUTH-WEST" },
  { region: "QORAQALPOQISTON", zone: "SOUTH-WEST" },
  { region: "QOQON", zone: "FV" },
  { region: "QASHQADARYO VILOYATI", zone: "SOUTH-WEST" },
  { region: "NAVOIY VILOYATI", zone: "SOUTH-WEST" },
  { region: "NAMANGAN VILOYATI", zone: "FV" },
  { region: "JIZZAX VILOYATI", zone: "SOUTH-WEST" },
  { region: "FARGONA VILOYATI", zone: "FV" },
  { region: "BUXORO VILOYATI", zone: "SOUTH-WEST" },
  { region: "ANDIJON VILOYATI", zone: "FV" }
];

export function normKey(s: string): string {
  return s
    .trim()
    .toUpperCase()
    .replace(/[\s\-_]+/g, " ")
    .replace(/\s+/g, " ");
}

/**
 * Viloyat/shahar nomlarini solishtirish: `FARG'ONA` ≈ `FARGONA`, `QO‘QON` ≈ `QOQON`.
 * `slugId` / zona kalitlari uchun `normKey` ishlatiladi; geografik moslash uchun shu funksiya.
 */
export function normKeyTerritoryMatch(s: string): string {
  return normKey(s.trim().replace(/[''`ʼʻ`]/g, ""));
}

function sanitizeTerritoryCode(raw: string): string | null {
  const up = raw.trim().toUpperCase();
  if (!up || !/^[A-Z0-9_]+$/.test(up)) return null;
  return up.slice(0, 20);
}

/** Ildiz-zona (`territory_nodes` 0-qavat) uchun standart kod. */
export function defaultZoneTerritoryCode(zoneDisplayName: string): string | null {
  const key = normKey(zoneDisplayName);
  const map: Record<string, string> = {
    [normKey("FV")]: "FV",
    [normKey("SOUTH-WEST")]: "SW",
    [normKey("TASH OBL")]: "TASH_OBL",
    [normKey("TASHKENT")]: "TASHKENT"
  };
  const c = map[key];
  return c ? sanitizeTerritoryCode(c) : null;
}

/** Viloyat / shahar darajasidagi viloyat tuguni uchun standart kod. */
export function defaultRegionTerritoryCode(regionDisplayName: string): string | null {
  const map: Record<string, string> = {
    [normKey("ANDIJON VILOYATI")]: "ANDIJON_VIL",
    [normKey("BUXORO VILOYATI")]: "BUXORO_VIL",
    [normKey("FARGONA VILOYATI")]: "FARGONA_VIL",
    [normKey("JIZZAX VILOYATI")]: "JIZZAX_VIL",
    [normKey("NAMANGAN VILOYATI")]: "NAMANGAN_VIL",
    [normKey("NAVOIY VILOYATI")]: "NAVOIY_VIL",
    [normKey("QASHQADARYO VILOYATI")]: "QASHQADARYO_VIL",
    [normKey("QORAQALPOQISTON")]: "QORAQALPOQ",
    [normKey("SAMARQAND VILOYATI")]: "SAMARQAND_VIL",
    [normKey("SIRDARYO VILOYATI")]: "SIRDARYO_VIL",
    [normKey("SURXANDARYO VILOYATI")]: "SURXANDARYO_VIL",
    [normKey("XORAZM VILOYATI")]: "XORAZM_VIL",
    [normKey("TOSHKENT VILOYATI")]: "TOSHKENT_VIL",
    [normKey("TOSHKENT SHAHAR")]: "TOSHKENT_SHA",
    [normKey("QOQON")]: "QOQON"
  };
  const c = map[normKeyTerritoryMatch(regionDisplayName)];
  return c ? sanitizeTerritoryCode(c) : null;
}

/**
 * Viloyat filtri `*_VIL` kodi yoki standart nom bilan kelganda `clients.region` dagi
 * kod / to‘liq nom / apostrof variantlari bilan moslash uchun barcha ehtimoliy qiymatlar.
 */
export function lalakuExpandRegionFilterTokens(token: string): string[] {
  const raw = token.trim();
  if (!raw) return [];
  const out = new Set<string>([raw]);
  const upper = raw.toUpperCase();
  const rawNorm = normKeyTerritoryMatch(raw);

  for (const row of REGION_ZONE_ROWS) {
    const code = defaultRegionTerritoryCode(row.region);
    const rowNorm = normKeyTerritoryMatch(row.region);
    const byCode = code != null && code === upper;
    const byName = rowNorm === rawNorm;
    if (byCode || byName) {
      out.add(row.region);
      if (code) out.add(code);
      if (code === "FARGONA_VIL" || rowNorm === normKeyTerritoryMatch("FARGONA VILOYATI")) {
        out.add("FARG'ONA VILOYATI");
        out.add("FARG`ONA VILOYATI");
      }
    }
  }

  return Array.from(out).filter((s) => s.length > 0);
}

function slugId(prefix: string, key: string): string {
  const k = normKey(key).replace(/\s+/g, "-").replace(/[^A-Z0-9-]/gi, "");
  return `${prefix}-${k.slice(0, 48)}`;
}

function canonicalZoneName(raw: string): string {
  const k = normKey(raw);
  if (k === "TASH OBL" || k === "TASHOBL") return "TASH OBL";
  return raw.trim().toUpperCase() === raw.trim() ? raw.trim() : raw.trim();
}

function cloneForest(nodes: LalakuTerritoryNode[]): LalakuTerritoryNode[] {
  return nodes.map((n) => ({
    ...n,
    children: cloneForest(n.children)
  }));
}

/** Mavjud daraxt + Lalaku zona ildizlari va viloyatlar (takrorlanmas). */
export function mergeTerritoryBundle(existing: LalakuTerritoryNode[]): LalakuTerritoryNode[] {
  const forest = cloneForest(existing);
  const topByKey = new Map<string, LalakuTerritoryNode>();

  for (const n of forest) {
    topByKey.set(normKey(n.name), n);
  }

  const ensureZone = (displayName: string): LalakuTerritoryNode => {
    const key = normKey(displayName);
    let z = topByKey.get(key);
    if (!z) {
      z = {
        id: slugId("z", key),
        name: canonicalZoneName(displayName),
        code: defaultZoneTerritoryCode(displayName),
        comment: null,
        sort_order: null,
        active: true,
        children: []
      };
      topByKey.set(key, z);
      forest.push(z);
    } else if (!z.code) {
      const dc = defaultZoneTerritoryCode(z.name);
      if (dc) z.code = dc;
    }
    return z;
  };

  for (const zname of ZONE_ROOT_NAMES) {
    ensureZone(zname);
  }

  for (const row of REGION_ZONE_ROWS) {
    const zoneNode = ensureZone(row.zone);
    const rKey = normKey(row.region);
    const existing = zoneNode.children.find((c) => normKey(c.name) === rKey);
    if (!existing) {
      zoneNode.children.push({
        id: slugId("r", `${normKey(row.zone)}-${normKey(row.region)}`),
        name: row.region,
        code: defaultRegionTerritoryCode(row.region),
        comment: null,
        sort_order: null,
        active: true,
        children: []
      });
    } else if (!existing.code) {
      const dc = defaultRegionTerritoryCode(existing.name);
      if (dc) existing.code = dc;
    }
  }

  return forest;
}
