import fp from "fastify-plugin";
import { prisma } from "../config/database";

function requestPath(url: string): string {
  const q = url.indexOf("?");
  return q === -1 ? url : url.slice(0, q);
}

export const tenantPlugin = fp(async (app) => {
  app.addHook("preHandler", async (request, reply) => {
    const path = requestPath(request.url);
    if (path === "/health" || path.startsWith("/auth/") || path.startsWith("/api/auth/")) {
      return;
    }

    const slugFromParams = (request.params as { slug?: string } | undefined)?.slug;
    const slugFromHeader = request.headers["x-tenant-slug"];
    const slug = slugFromParams ?? (Array.isArray(slugFromHeader) ? slugFromHeader[0] : slugFromHeader);

    if (!slug) {
      return;
    }

    const tenant = await prisma.tenant.findUnique({
      where: { slug },
      select: { id: true, slug: true, name: true, is_active: true }
    });

    if (!tenant || !tenant.is_active) {
      return reply.status(404).send({ error: "TenantNotFound" });
    }

    request.tenant = tenant;
  });
});
