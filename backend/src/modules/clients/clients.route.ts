import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { ensureTenantContext } from "../../lib/tenant-context";
import { getAccessUser, jwtAccessVerify, requireRoles } from "../auth/auth.prehandlers";
import type { ListClientsQuery } from "./clients.service";
import {
  addClientBalanceMovement,
  bulkSetClientsActive,
  buildClientImportTemplateBuffer,
  checkDuplicateCandidates,
  createClientMinimal,
  exportClientsFilteredCsv,
  getClientDetail,
  getClientReferences,
  getDuplicatePhoneGroups,
  importClientsFromXlsx,
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

const createClientBodySchema = z.object({
  name: z.string().min(1).max(500),
  phone: z.string().max(80).nullable().optional()
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

const agentAssignmentSlotSchema = z.object({
  slot: z.number().int().min(1).max(10),
  agent_id: z.number().int().positive().nullable().optional(),
  visit_date: z.string().nullable().optional(),
  expeditor_phone: z.string().nullable().optional(),
  expeditor_user_id: z.number().int().positive().nullable().optional(),
  visit_weekdays: z.array(z.number().int().min(1).max(7)).max(7).optional()
});

const coordIn = z.union([z.number().finite(), z.string(), z.null()]).optional();

const patchClientSchema = z
  .object({
    name: z.string().min(1).optional(),
    legal_name: z.string().nullable().optional(),
    phone: z.string().nullable().optional(),
    credit_limit: z.number().nonnegative().optional(),
    address: z.string().nullable().optional(),
    category: z.string().nullable().optional(),
    client_type_code: z.string().nullable().optional(),
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
    client_code: z.string().nullable().optional(),
    sales_channel: z.string().nullable().optional(),
    product_category_ref: z.string().nullable().optional(),
    bank_name: z.string().nullable().optional(),
    bank_account: z.string().nullable().optional(),
    bank_mfo: z.string().nullable().optional(),
    client_pinfl: z.string().nullable().optional(),
    oked: z.string().nullable().optional(),
    contract_number: z.string().nullable().optional(),
    vat_reg_code: z.string().nullable().optional(),
    latitude: coordIn,
    longitude: coordIn,
    zone: z.string().nullable().optional(),
    agent_id: z.number().int().positive().nullable().optional(),
    agent_assignments: z.array(agentAssignmentSlotSchema).max(10).optional(),
    contact_persons: z.array(contactSlotSchema).max(10).optional(),
    is_active: z.boolean().optional()
  })
  .refine((o) => Object.keys(o).length > 0, { message: "empty" });

const balanceMovementBodySchema = z.object({
  delta: z.number().finite(),
  note: z.string().max(500).nullable().optional()
});

const bulkActiveBodySchema = z.object({
  client_ids: z.array(z.number().int().positive()).min(1).max(500),
  is_active: z.boolean()
});

function parseClientListQuery(q: Record<string, string | undefined>): ListClientsQuery {
  const pageNum = Math.max(1, Number.parseInt(q.page ?? "1", 10) || 1);
  const limitNum = Math.min(100, Math.max(1, Number.parseInt(q.limit ?? "50", 10) || 50));
  const search = q.search?.trim() || undefined;
  let is_active: boolean | undefined;
  if (q.is_active === "true") is_active = true;
  else if (q.is_active === "false") is_active = false;
  const category = q.category?.trim() || undefined;
  const region = q.region?.trim() || undefined;
  const district = q.district?.trim() || undefined;
  const neighborhood = q.neighborhood?.trim() || undefined;
  const zone = q.zone?.trim() || undefined;
  const client_type_code = q.client_type_code?.trim() || undefined;
  const client_format = q.client_format?.trim() || undefined;
  const sales_channel = q.sales_channel?.trim() || undefined;
  let agent_id: number | undefined;
  if (q.agent_id != null && q.agent_id !== "") {
    const n = Number.parseInt(q.agent_id, 10);
    if (Number.isFinite(n) && n > 0) agent_id = n;
  }
  let expeditor_user_id: number | undefined;
  if (q.expeditor_user_id != null && q.expeditor_user_id !== "") {
    const n = Number.parseInt(q.expeditor_user_id, 10);
    if (Number.isFinite(n) && n > 0) expeditor_user_id = n;
  }
  let visit_weekday: number | undefined;
  if (q.visit_weekday != null && q.visit_weekday !== "") {
    const n = Number.parseInt(q.visit_weekday, 10);
    if (Number.isFinite(n) && n >= 1 && n <= 7) visit_weekday = n;
  }
  const inn = q.inn?.trim() || undefined;
  const phone = q.phone?.trim() || undefined;
  const created_from = q.created_from?.trim() || undefined;
  const created_to = q.created_to?.trim() || undefined;
  let supervisor_user_id: number | undefined;
  if (q.supervisor_user_id != null && q.supervisor_user_id !== "") {
    const n = Number.parseInt(q.supervisor_user_id, 10);
    if (Number.isFinite(n) && n > 0) supervisor_user_id = n;
  }
  const sortRaw = q.sort?.trim();
  const sort =
    sortRaw === "phone" ||
    sortRaw === "id" ||
    sortRaw === "created_at" ||
    sortRaw === "region"
      ? sortRaw
      : "name";
  const order = q.order === "desc" ? "desc" : "asc";

  return {
    page: pageNum,
    limit: limitNum,
    search,
    ...(is_active !== undefined ? { is_active } : {}),
    category,
    region,
    district,
    neighborhood,
    ...(zone ? { zone } : {}),
    ...(client_type_code ? { client_type_code } : {}),
    ...(client_format ? { client_format } : {}),
    ...(sales_channel ? { sales_channel } : {}),
    ...(agent_id !== undefined ? { agent_id } : {}),
    ...(expeditor_user_id !== undefined ? { expeditor_user_id } : {}),
    ...(visit_weekday !== undefined ? { visit_weekday } : {}),
    ...(inn ? { inn } : {}),
    ...(phone ? { phone } : {}),
    ...(created_from ? { created_from } : {}),
    ...(created_to ? { created_to } : {}),
    ...(supervisor_user_id !== undefined ? { supervisor_user_id } : {}),
    sort,
    order
  };
}

export async function registerClientRoutes(app: FastifyInstance) {
  app.get(
    "/api/:slug/clients",
    { preHandler: [jwtAccessVerify] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const q = request.query as Record<string, string | undefined>;
      const result = await listClientsForTenantPaged(request.tenant!.id, parseClientListQuery(q));
      return reply.send(result);
    }
  );

  app.post(
    "/api/:slug/clients",
    { preHandler: [jwtAccessVerify, requireRoles(...catalogRoles)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const parsed = createClientBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "ValidationError", details: parsed.error.flatten() });
      }
      try {
        const actor = getAccessUser(request);
        const sub = Number.parseInt(actor.sub, 10);
        const actorUserId = Number.isFinite(sub) && sub > 0 ? sub : null;
        const { id } = await createClientMinimal(request.tenant!.id, actorUserId, {
          name: parsed.data.name,
          phone: parsed.data.phone ?? null
        });
        return reply.status(201).send({ id });
      } catch (e) {
        if (e instanceof Error && e.message === "VALIDATION") {
          return reply.status(400).send({ error: "ValidationError" });
        }
        throw e;
      }
    }
  );

  app.get(
    "/api/:slug/clients/references",
    { preHandler: [jwtAccessVerify] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const refs = await getClientReferences(request.tenant!.id);
      return reply.send(refs);
    }
  );

  app.get(
    "/api/:slug/clients/import/template",
    { preHandler: [jwtAccessVerify, requireRoles(...catalogRoles)] },
    async (_request, reply) => {
      const buf = await buildClientImportTemplateBuffer();
      reply
        .header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
        .header("Content-Disposition", 'attachment; filename="mijozlar_import_shablon.xlsx"');
      return reply.send(buf);
    }
  );

  app.post(
    "/api/:slug/clients/import",
    { preHandler: [jwtAccessVerify, requireRoles(...catalogRoles)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const file = await request.file();
      if (!file) {
        return reply.status(400).send({ error: "NoFile" });
      }
      const buf = await file.toBuffer();
      if (buf.length === 0) {
        return reply.status(400).send({ error: "EmptyFile" });
      }
      const result = await importClientsFromXlsx(request.tenant!.id, buf);
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

  app.get(
    "/api/:slug/clients/export",
    { preHandler: [jwtAccessVerify, requireRoles(...catalogRoles)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const q = request.query as Record<string, string | undefined>;
      const listQ = parseClientListQuery(q);
      const { csv, truncated, totalMatched } = await exportClientsFilteredCsv(request.tenant!.id, listQ);
      reply
        .header("Content-Type", "text/csv; charset=utf-8")
        .header("Content-Disposition", 'attachment; filename="mijozlar.csv"')
        .header("X-Clients-Export-Truncated", truncated ? "1" : "0")
        .header("X-Clients-Export-Total", String(totalMatched));
      return reply.send(csv);
    }
  );

  app.patch(
    "/api/:slug/clients/bulk-active",
    { preHandler: [jwtAccessVerify, requireRoles(...catalogRoles)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const parsed = bulkActiveBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "ValidationError", details: parsed.error.flatten() });
      }
      const actor = getAccessUser(request);
      const sub = Number.parseInt(actor.sub, 10);
      const actorUserId = Number.isFinite(sub) && sub > 0 ? sub : null;
      const result = await bulkSetClientsActive(
        request.tenant!.id,
        parsed.data.client_ids,
        parsed.data.is_active,
        actorUserId
      );
      return reply.send(result);
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
