/**
 * Bir martalik: `agent_location_pings` jadvaliga namuna GPS nuqtalari (GPS trek sahifasini tekshirish).
 *
 * Old shartlar:
 *   cd backend && npx prisma migrate deploy && npx prisma generate
 *   API ni yangi kod bilan qayta ishga tushiring (`npm run dev`).
 *
 * Ishga tushirish:
 *   npm run seed:agent-gps-once --prefix backend
 *
 * Ixtiyoriy muhit:
 *   SEED_TENANT_SLUG=test1   (default test1)
 *   SEED_AGENT_ID=102        (berilmasa — tenantdagi birinchi faol agent)
 */
import { PrismaClient, Prisma } from "@prisma/client";
import path from "path";
import { config } from "dotenv";

config({ path: path.join(__dirname, "..", ".env") });

const prisma = new PrismaClient();

async function main() {
  const slug = (process.env.SEED_TENANT_SLUG || "test1").trim();
  const tenant = await prisma.tenant.findUnique({ where: { slug } });
  if (!tenant) {
    throw new Error(`Tenant "${slug}" topilmadi.`);
  }

  let agentId: number;
  const rawAgent = process.env.SEED_AGENT_ID?.trim();
  if (rawAgent) {
    agentId = Number.parseInt(rawAgent, 10);
    if (!Number.isFinite(agentId) || agentId < 1) {
      throw new Error("SEED_AGENT_ID noto‘g‘ri.");
    }
  } else {
    const first = await prisma.user.findFirst({
      where: { tenant_id: tenant.id, role: "agent", is_active: true },
      orderBy: { id: "asc" },
      select: { id: true, name: true }
    });
    if (!first) {
      throw new Error(`"${slug}" da faol agent yo‘q. SEED_AGENT_ID=... bering.`);
    }
    agentId = first.id;
    console.log(`[seed] Agent tanlandi: id=${first.id} (${first.name})`);
  }

  const agent = await prisma.user.findFirst({
    where: { id: agentId, tenant_id: tenant.id, role: "agent", is_active: true },
    select: { id: true, name: true }
  });
  if (!agent) {
    throw new Error(`Agent id=${agentId} topilmadi yoki role≠agent / o‘chirilgan.`);
  }

  // UI dagi default davrga mos: 2026-04-07 14:00 UTC … 2026-04-08 01:30 UTC atrofida
  const t0 = new Date("2026-04-07T14:00:00.000Z");
  const tEnd = new Date("2026-04-08T01:30:00.000Z");
  const stepMs = Math.floor((tEnd.getTime() - t0.getTime()) / 11);

  // Toshkent atrofida silliq "yo‘l"
  let lat = 41.285;
  let lon = 69.22;
  const dLat = 0.0045;
  const dLon = 0.0055;

  const rows: Prisma.AgentLocationPingCreateManyInput[] = [];
  for (let i = 0; i < 12; i++) {
    rows.push({
      tenant_id: tenant.id,
      agent_id: agentId,
      latitude: new Prisma.Decimal(lat.toFixed(8)),
      longitude: new Prisma.Decimal(lon.toFixed(8)),
      accuracy_meters: 8 + (i % 5) * 3,
      recorded_at: new Date(t0.getTime() + i * stepMs)
    });
    lat += dLat + (i % 3) * 0.0005;
    lon += dLon - (i % 2) * 0.0003;
  }

  const res = await prisma.agentLocationPing.createMany({ data: rows });
  console.log(`[seed] ${res.count} ta ping qo‘shildi (tenant=${slug}, agent_id=${agentId}).`);
  console.log("[seed] Brauzerda /routes/track — shu agent va 2026-04-07…2026-04-08 dan/gacha tanlang.");
}

main()
  .catch((e) => {
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2021") {
      console.error(
        "[seed] Jadval yo‘q. Avval: cd backend && npx prisma migrate deploy && npx prisma generate\n",
        e
      );
    } else {
      console.error(e);
    }
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
