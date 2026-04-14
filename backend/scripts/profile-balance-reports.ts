import { prisma } from "../src/config/database";
import { listClientBalancesReport } from "../src/modules/client-balances/client-balances.service";
import { listConsignmentBalancesReport } from "../src/modules/client-balances/consignment-balances.service";

type BenchResult = {
  name: string;
  elapsedMs: number;
  total: number;
  rows: number;
};

async function bench(
  name: string,
  fn: () => Promise<{ total: number; data: unknown[] }>
): Promise<BenchResult> {
  const t0 = Date.now();
  const res = await fn();
  return { name, elapsedMs: Date.now() - t0, total: res.total, rows: res.data.length };
}

async function main() {
  const slug = (process.env.IMPORT_TENANT_SLUG || "test1").trim();
  const runs = Number.parseInt(process.env.BENCH_RUNS || "2", 10);
  const tenant = await prisma.tenant.findUnique({ where: { slug }, select: { id: true } });
  if (!tenant) throw new Error(`Tenant not found: ${slug}`);

  const results: BenchResult[] = [];

  for (let i = 1; i <= runs; i++) {
    results.push(
      await bench(`clients_page_run_${i}`, async () =>
        listClientBalancesReport(tenant.id, {
          view: "clients",
          page: 1,
          limit: 30
        })
      )
    );

    results.push(
      await bench(`consignment_page_run_${i}`, async () =>
        listConsignmentBalancesReport(tenant.id, {
          view: "clients",
          page: 1,
          limit: 30
        })
      )
    );
  }

  console.log(JSON.stringify({ tenantId: tenant.id, slug, runs, results }, null, 2));
}

main()
  .catch((e) => {
    console.error("[profile-balance-reports] failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => {});
  });
