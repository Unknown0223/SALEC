import bcrypt from "bcryptjs";
import type { PrismaClient } from "@prisma/client";

const DEMO_LOGINS = ["demo_sup_sample", "demo_op_sample", "demo_agent_sample"] as const;

export async function runEnsureDemoStaffLogin(
  prisma: PrismaClient,
  opts: { tenantSlug: string; password?: string }
): Promise<void> {
  const slug = opts.tenantSlug.trim();
  const password = (
    opts.password ||
    process.env.ENSURE_DEMO_PASSWORD ||
    process.env.IMPORT_DEFAULT_PASSWORD ||
    "Parol123!"
  ).trim();
  if (password.length < 6) throw new Error("Parol kamida 6 belgi.");

  const tenant = await prisma.tenant.findUnique({ where: { slug } });
  if (!tenant) throw new Error(`Tenant: ${slug}`);

  const hash = await bcrypt.hash(password, 10);

  console.log("\n── Namuna foydalanuvchilar paroli (demo_*) ──");
  for (const login of DEMO_LOGINS) {
    const u = await prisma.user.findFirst({
      where: { tenant_id: tenant.id, login }
    });
    if (!u) {
      console.warn(`Topilmadi: ${login}`);
      continue;
    }
    await prisma.user.update({
      where: { id: u.id },
      data: {
        password_hash: hash,
        can_authorize: true,
        is_active: true,
        app_access: true
      }
    });
    console.log(`✓ ${login}`);
  }
}
