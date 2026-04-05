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
        code: null,
        comment: null,
        sort_order: null,
        active: true,
        children: []
      };
      topByKey.set(key, z);
      forest.push(z);
    }
    return z;
  };

  for (const zname of ZONE_ROOT_NAMES) {
    ensureZone(zname);
  }

  for (const row of REGION_ZONE_ROWS) {
    const zoneNode = ensureZone(row.zone);
    const rKey = normKey(row.region);
    const exists = zoneNode.children.some((c) => normKey(c.name) === rKey);
    if (!exists) {
      zoneNode.children.push({
        id: slugId("r", `${normKey(row.zone)}-${rKey}`),
        name: row.region,
        code: null,
        comment: null,
        sort_order: null,
        active: true,
        children: []
      });
    }
  }

  return forest;
}
