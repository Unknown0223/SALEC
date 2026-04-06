/**
 * Tenant `settings.references.territory_nodes` bo‘yicha kodlar audit.
 *
 *   npm run audit:territory-codes
 *   IMPORT_TENANT_SLUG=test1
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type Node = {
  id: string;
  name: string;
  code: string | null;
  children: Node[];
};

function parseNode(item: unknown): Node | null {
  if (item == null || typeof item !== "object" || Array.isArray(item)) return null;
  const row = item as Record<string, unknown>;
  const id = typeof row.id === "string" ? row.id.trim() : "";
  const name = typeof row.name === "string" ? row.name.trim() : "";
  if (!id || !name) return null;
  let code: string | null = null;
  const raw = row.code;
  if (typeof raw === "string") {
    const up = raw.trim().toUpperCase();
    code = up && /^[A-Z0-9_]+$/.test(up) ? up.slice(0, 20) : null;
  } else if (typeof raw === "number" && Number.isInteger(raw)) {
    const up = String(raw).toUpperCase();
    code = up && /^[A-Z0-9_]+$/.test(up) ? up.slice(0, 20) : null;
  }
  const rawCh = row.children;
  const children = Array.isArray(rawCh)
    ? rawCh.map(parseNode).filter((x): x is Node => x != null)
    : [];
  return { id, name, code, children };
}

const DEPTH_LABEL = ["Zona", "Viloyat", "Shahar", "Chuqurroq"];

function walk(
  list: Node[],
  depth: number,
  acc: { total: number; noCodeByDepth: number[]; samplesNoCode: string[] },
  path: string
) {
  for (const n of list) {
    acc.total++;
    const label = DEPTH_LABEL[Math.min(depth, DEPTH_LABEL.length - 1)] ?? `d${depth}`;
    const here = path ? `${path} / ${n.name}` : n.name;
    if (!n.code) {
      acc.noCodeByDepth[depth] = (acc.noCodeByDepth[depth] ?? 0) + 1;
      if (acc.samplesNoCode.length < 25) acc.samplesNoCode.push(`[${label}] ${here}`);
    }
    if (n.children.length) walk(n.children, depth + 1, acc, here);
  }
}

async function main() {
  const slug = (process.env.IMPORT_TENANT_SLUG || "test1").trim();
  const tenant = await prisma.tenant.findUnique({
    where: { slug },
    select: { id: true, slug: true, settings: true }
  });
  if (!tenant) {
    const list = await prisma.tenant.findMany({ select: { slug: true }, take: 30, orderBy: { id: "asc" } });
    throw new Error(
      `Tenant yo‘q: ${slug}. Mavjud: ${list.map((t) => t.slug).join(", ") || "(bo‘sh)"}`
    );
  }

  const settings = tenant.settings as Record<string, unknown> | null;
  const ref = (settings?.references as Record<string, unknown> | undefined) ?? {};
  const raw = ref.territory_nodes;
  const forest = Array.isArray(raw) ? raw.map(parseNode).filter((x): x is Node => x != null) : [];

  const acc = {
    total: 0,
    noCodeByDepth: [] as number[],
    samplesNoCode: [] as string[]
  };
  walk(forest, 0, acc, "");

  console.log(`\n=== territory_nodes audit — tenant ${tenant.slug} (id=${tenant.id}) ===`);
  console.log(`Jami tugunlar: ${acc.total}`);
  for (let d = 0; d < acc.noCodeByDepth.length; d++) {
    const n = acc.noCodeByDepth[d];
    if (n) console.log(`  Kodsiz (${DEPTH_LABEL[d] ?? `depth ${d}`}): ${n}`);
  }
  const noCodeTotal = acc.noCodeByDepth.reduce((a, b) => a + (b ?? 0), 0);
  if (noCodeTotal === 0) {
    console.log("✓ Barcha tugunlarda to‘g‘ri formatdagi kod bor.");
  } else {
    console.log(`\nKodsiz yoki noto‘g‘ri format (jami ${noCodeTotal}):`);
    for (const s of acc.samplesNoCode) console.log(`  - ${s}`);
  }

  const sam = forest
    .flatMap((z) => z.children.map((r) => ({ z: z.name, r })))
    .find(({ r }) => /SAMARQAND/i.test(r.name));
  if (sam) {
    console.log(`\nSAMARQAND viloyati: "${sam.r.name}" (${sam.z} ostida), shaharlar: ${sam.r.children.length}`);
  } else {
    console.log("\nSAMARQAND viloyati tuguni daraxtda topilmadi.");
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
