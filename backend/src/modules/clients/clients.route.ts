import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { ensureTenantContext } from "../../lib/tenant-context";
import { getAccessUser, jwtAccessVerify, requireRoles } from "../auth/auth.prehandlers";
import {
  addClientBalanceMovement,
  checkDuplicateCandidates,
  getClientDetail,
  getDuplicatePhoneGroups,
  listClientAuditLogs,
  listClientBalanceMovements,
  listClientsForTenantPaged,
  mergeClientsIntoOne,
  updateClientFields
} from "./clients.service";

const catalogRoles = ["admin", "operator"] as const;

const checkBodySchema = z.object({
  name: z.string().min(1),
  phone: z.string().nullable().optional()
});

const mergeBodySchema = z.object({
  keep_client_id: z.number().int().positive(),
  merge_client_ids: z.array(z.number().int().positive()).min(1)
});

const contactSlotSchema = z.object({
  firstName: z.string().nullable().optional(),
  lastName: z.string().nullable().optional(),
  phone: z.string().nullable().optional()
});

const patchClientSchema = z
  .object({
    name: z.string().min(1).optional(),
    phone: z.string().nullable().optional(),
    credit_limit: z.number().nonnegative().optional(),
    address: z.string().nullable().optional(),
    category: z.string().nullable().optional(),
    responsible_person: z.string().nullable().optional(),
    landmark: z.string().nullable().optional(),
    inn: z.string().nullable().optional(),
    pdl: z.string().nullable().optional(),
    logistics_service: z.string().nullable().optional(),
    license_until: z.string().nullable().optional(),
    working_hours: z.string().nullable().optional(),
    region: z.string().nullable().optional(),
    district: z.string().nullable().optional(),
    neighborhood: z.string().nullable().optional(),
    street: z.string().nullable().optional(),
    house_number: z.string().nullable().optional(),
    apartment: z.string().nullable().optional(),
    gps_text: z.string().nullable().optional(),
    visit_date: z.string().nullable().optional(),
    notes: z.string().nullable().optional(),
    client_format: z.string().nullable().optional(),
    agent_id: z.number().int().positive().nullable().optional(),
    contact_persons: z.array(contactSlotSchema).max(10).optional(),
    is_active: z.boolean().optional()
  })
  .refine((o) => Object.keys(o).length > 0, { message: "empty" });

const balanceMovementBodySchema = z.object({
  delta: z.number().finite(),
  note: z.string().max(500).nullable().optional()
});

export async function registerClientRoutes(app: FastifyInstance) {
  app.get(
    "/api/:slug/clients",
    { preHandler: [jwtAccessVerify] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const q = request.query as Record<string, string | undefined>;
      const pageNum = Math.max(1, Number.parseInt(q.page ?? "1", 10) || 1);
      const limitNum = Math.min(100, Math.max(1, Number.parseInt(q.limit ?? "50", 10) || 50));
      const search = q.search?.trim() || undefined;
      let is_active: boolean | undefined;
      if (q.is_active === "true") is_active = true;
      else if (q.is_active === "false") is_active = false;
      const category = q.category?.trim() || undefined;
      const sortRaw = q.sort?.trim();
      const sort =
        sortRaw === "phone" ||
        sortRaw === "id" ||
        sortRaw === "created_at" ||
        sortRaw === "region"
          ? sortRaw
          : "name";
      const order = q.order === "desc" ? "desc" : "asc";

      const result = await listClientsForTenantPaged(request.tenant!.id, {
        page: pageNum,
        limit: limitNum,
        search,
        ...(is_active !== undefined ? { is_active } : {}),
        category,
        sort,
        order
      });
      return reply.send(result);
    }
  );

  app.get(
    "/api/:slug/clients/duplicate-groups",
    { preHandler: [jwtAccessVerify, requireRoles(...catalogRoles)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const groups = await getDuplicatePhoneGroups(request.tenant!.id);
      return reply.send({ data: groups });
    }
  );

  app.post(
    "/api/:slug/clients/check-duplicates",
    { preHandler: [jwtAccessVerify, requireRoles(...catalogRoles)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const parsed = checkBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "ValidationError", details: parsed.error.flatten() });
      }
      const matches = await checkDuplicateCandidates(
        request.tenant!.id,
        parsed.data.name,
        parsed.data.phone ?? null
      );
      return reply.send({ matches });
    }
  );

  app.post(
    "/api/:slug/clients/merge",
    { preHandler: [jwtAccessVerify, requireRoles(...catalogRoles)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const parsed = mergeBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "ValidationError", details: parsed.error.flatten() });
      }
      try {
        const actor = getAccessUser(request);
        const sub = Number.parseInt(actor.sub, 10);
        const actorUserId = Number.isFinite(sub) && sub > 0 ? sub : null;
        const result = await mergeClientsIntoOne(
          request.tenant!.id,
          parsed.data.keep_client_id,
          parsed.data.merge_client_ids,
          actorUserId
        );
        return reply.send(result);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "";
        if (msg === "NOT_FOUND") return reply.status(404).send({ error: "NotFound" });
        if (msg === "ALREADY_MERGED") return reply.status(409).send({ error: "AlreadyMerged" });
        if (msg === "NO_MERGE_TARGETS") return reply.status(400).send({ error: "NoMergeTargets" });
        throw e;
      }
    }
  );

  app.get(
    "/api/:slug/clients/:id/audit",
    { preHandler: [jwtAccessVerify, requireRoles(...catalogRoles)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const id = Number.parseInt((request.params as { id: string }).id, 10);
      if (Number.isNaN(id)) {
        return reply.status(400).send({ error: "InvalidId" });
      }
      const q = request.query as Record<string, string | undefined>;
      const pageNum = Math.max(1, Number.parseInt(q.page ?? "1", 10) || 1);
      const limitNum = Math.min(100, Math.max(1, Number.parseInt(q.limit ?? "30", 10) || 30));
      try {
        const result = await listClientAuditLogs(request.tenant!.id, id, pageNum, limitNum);
        return reply.send(result);
      } catch (e) {
        if (e instanceof Error && e.message === "NOT_FOUND") {
          return reply.status(404).send({ error: "NotFound" });
        }
        throw e;
      }
    }
  );

  app.get(
    "/api/:slug/clients/:id",
    { preHandler: [jwtAccessVerify] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const id = Number.parseInt((request.params as { id: string }).id, 10);
      if (Number.isNaN(id)) {
        return reply.status(400).send({ error: "InvalidId" });
      }
      try {
        const row = await getClientDetail(request.tenant!.id, id);
        return reply.send(row);
      } catch (e) {
        if (e instanceof Error && e.message === "NOT_FOUND") {
          return reply.status(404).send({ error: "NotFound" });
        }
        throw e;
      }
    }
  );

  app.get(
    "/api/:slug/clients/:id/balance-movements",
    { preHandler: [jwtAccessVerify, requireRoles(...catalogRoles)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const id = Number.parseInt((request.params as { id: string }).id, 10);
      if (Number.isNaN(id)) {
        return reply.status(400).send({ error: "InvalidId" });
      }
      const q = request.query as Record<string, string | undefined>;
      const pageNum = Math.max(1, Number.parseInt(q.page ?? "1", 10) || 1);
      const limitNum = Math.min(100, Math.max(1, Number.parseInt(q.limit ?? "30", 10) || 30));
      try {
        const result = await listClientBalanceMovements(request.tenant!.id, id, pageNum, limitNum);
        return reply.send(result);
      } catch (e) {
        if (e instanceof Error && e.message === "NOT_FOUND") {
          return reply.status(404).send({ error: "NotFound" });
        }
        throw e;
      }
    }
  );

  app.post(
    "/api/:slug/clients/:id/balance-movements",
    { preHandler: [jwtAccessVerify, requireRoles("admin")] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const id = Number.parseInt((request.params as { id: string }).id, 10);
      if (Number.isNaN(id)) {
        return reply.status(400).send({ error: "InvalidId" });
      }
      const parsed = balanceMovementBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "ValidationError", details: parsed.error.flatten() });
      }
      try {
        const actor = getAccessUser(request);
        const sub = Number.parseInt(actor.sub, 10);
        const actorUserId = Number.isFinite(sub) && sub > 0 ? sub : null;
        const row = await addClientBalanceMovement(
          request.tenant!.id,
          id,
          parsed.data.delta,
          parsed.data.note ?? null,
          actorUserId
        );
        return reply.status(201).send(row);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "";
        if (msg === "NOT_FOUND") return reply.status(404).send({ error: "NotFound" });
        if (msg === "BAD_DELTA") return reply.status(400).send({ error: "BadDelta" });
        throw e;
      }
    }
  );

  app.patch(
    "/api/:slug/clients/:id",
    { preHandler: [jwtAccessVerify, requireRoles(...catalogRoles)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const id = Number.parseInt((request.params as { id: string }).id, 10);
      if (Number.isNaN(id)) {
        return reply.status(400).send({ error: "InvalidId" });
      }
      const parsed = patchClientSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "ValidationError", details: parsed.error.flatten() });
      }
      try {
        const actor = getAccessUser(request);
        const sub = Number.parseInt(actor.sub, 10);
        const actorUserId = Number.isFinite(sub) && sub > 0 ? sub : null;
        const body = parsed.data;
        const mapped = {
          ...body,
          contact_persons: body.contact_persons?.map((s) => ({
            firstName: s.firstName ?? null,
            lastName: s.lastName ?? null,
            phone: s.phone ?? null
          }))
        };
        const row = await updateClientFields(request.tenant!.id, id, mapped, actorUserId);
        return reply.send(row);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "";
        if (msg === "NOT_FOUND") return reply.status(404).send({ error: "NotFound" });
        if (msg === "VALIDATION" || msg === "EMPTY") {
          return reply.status(400).send({ error: msg === "EMPTY" ? "EmptyBody" : "ValidationError" });
        }
        throw e;
      }
    }
  );
}
