/**
 * Backend uchun minimal Lalaku territory util'lar.
 * Railway'da `backend` service alohida build qilinayotganda monorepo `../shared` mavjud bo'lmasligi mumkin.
 */

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
 * Viloyat/shahar nomlarini solishtirish: `FARG'ONA` ~= `FARGONA`, `QO'QON` ~= `QOQON`.
 */
export function normKeyTerritoryMatch(s: string): string {
  return normKey(s.trim().replace(/[''`ʼʻ`]/g, ""));
}

function sanitizeTerritoryCode(raw: string): string | null {
  const up = raw.trim().toUpperCase();
  if (!up || !/^[A-Z0-9_]+$/.test(up)) return null;
  return up.slice(0, 20);
}

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
