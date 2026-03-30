import type { Tenant } from "@prisma/client";

declare module "fastify" {
  interface FastifyRequest {
    tenant?: Pick<Tenant, "id" | "slug" | "name" | "is_active">;
    user?: {
      sub: string;
      tenantId: number;
      role: string;
      login: string;
      iat?: number;
      exp?: number;
    };
  }
}
