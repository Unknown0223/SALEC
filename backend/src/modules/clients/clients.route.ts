import { unlink } from "fs/promises";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { writeClientImportTempFile } from "../../jobs/import-temp-file";
import { ensureTenantContext } from "../../lib/tenant-context";
import { enqueueClientsImportJob } from "../jobs/jobs.service";
import { getAccessUser, jwtAccessVerify, requireRoles } from "../auth/auth.prehandlers";
import type { ListClientsQuery } from "./clients.service";
import { getClientBalanceLedger } from "./client-balance-ledger.service";
import { getClientDebtorCreditorMonthly } from "./client-debtor-creditor-report.service";
import { getClientSalesAnalytics } from "./client-sales-analytics.service";
import {
  createClientEquipmentRow,
  createClientPhotoReportRow,
  deleteClientPhotoReport,
  listClientEquipmentSplit,
  listClientPhotoReports,
  markClientEquipmentRemoved
} from "./client-assets.service";
import {
  addClientBalanceMovement,
  bulkSetClientsActive,
  buildClientImportTemplateBuffer,
  buildClientUpdateImportTemplateBuffer,
  createClientMinimal,
  exportClientsFilteredCsv,
  getClientDetail,
  getClientReferences,
  getClientReconciliationPdfBuffer,
  importClientsFromXlsx,
  listClientAuditLogs,
  listClientBalanceMovements,
  listClientsForTenantPaged,
  mergeClientsIntoOne,
  updateClientFields
} from "./clients.service";

const catalogRoles = ["admin", "operator"] as const;

async function sendClientUpdateImportTemplateXlsx(
  reply: FastifyReply,
  tenantId: number,
  q: ListClientsQuery
) {
  const buf = await buildClientUpdateImportTemplateBuffer(tenantId, q);
  return reply
    .header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    .header(
      "Content-Disposition",
      'attachment; filename="klientlarni_yangilash_Excel_shablon.xlsx"'
    )
    .send(buf);
}

const createClientEquipmentBodySchema = z.object({
  inventory_type: z.string().min(1).max(256),
  equipment_kind: z.string().max(256).nullable().optional(),
  serial_number: z.string().max(128).nullable().optional(),
  inventory_number: z.string().max(128).nullable().optional(),
  note: z.string().max(2000).nullable().optional()
});

const createClientPhotoBodySchema = z.object({
  image_url: z.string().min(1).max(4000),
  caption: z.string().max(1000).nullable().optional(),
  order_id: z.number().int().positive().nullable().optional()
});

type ClientImportMultipartOk = {
  buf: Buffer;
  sheetName?: string;
  headerRowIndex?: number;
  columnMap?: Record<string, number>;
  importMode?: "create" | "update";
  duplicateKeyFields?: string[];
  updateApplyFields?: string[];
};

async function parseClientImportMultipart(request: FastifyRequest): Promise<ClientImportMultipartOk | null> {
  let buf: Buffer | null = null;
  let sheetName: string | undefined;
  let headerRowIndex: number | undefined;
  let columnMap: Record<string, number> | undefined;
  let importMode: "create" | "update" | undefined;
  let duplicateKeyFields: string[] | undefined;
  let updateApplyFields: string[] | undefined;

  const parts = request.parts();
  for await (const part of parts) {
    if (part.type === "file") {
      buf = await part.toBuffer();
    } else if (part.type === "field") {
      if (part.fieldname === "sheetName") {
        const s = String(part.value ?? "").trim();
        if (s) sheetName = s;
      } else if (part.fieldname === "headerRowIndex") {
        const n = Number.parseInt(String(part.value ?? ""), 10);
        if (Number.isFinite(n) && n >= 0) headerRowIndex = n;
      } else if (part.fieldname === "columnMap") {
        try {
          const parsed = JSON.parse(String(part.value ?? "{}")) as unknown;
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            columnMap = parsed as Record<string, number>;
          }
        } catch {
          /* ignore */
        }
      } else if (part.fieldname === "importMode") {
        const m = String(part.value ?? "").trim().toLowerCase();
        if (m === "create" || m === "update") importMode = m;
      } else if (part.fieldname === "duplicateKeyFields") {
        try {
          const parsed = JSON.parse(String(part.value ?? "[]")) as unknown;
          if (Array.isArray(parsed)) duplicateKeyFields = parsed.map((x) => String(x ?? "").trim()).filter(Boolean);
        } catch {
          /* ignore */
        }
      } else if (part.fieldname === "updateApplyFields") {
        try {
          const parsed = JSON.parse(String(part.value ?? "[]")) as unknown;
          if (Array.isArray(parsed)) updateApplyFields = parsed.map((x) => String(x ?? "").trim()).filter(Boolean);
        } catch {
          /* ignore */
        }
      }
    }
  }

  if (!buf || buf.length === 0) {
    return null;
  }
  return { buf, sheetName, headerRowIndex, columnMap, importMode, duplicateKeyFields, updateApplyFields };
}

function parseLocalYmd(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(y, mo - 1, d, 0, 0, 0, 0);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  return dt;
}

function endOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

function defaultReconciliationRange(): { from: Date; toEnd: Date } {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const toEnd = endOfLocalDay(now);
  return { from, toEnd };
}

const optionalRefString = z.string().max(500).nullable().optional();

const createClientBodySchema = z.object({
  name: z.string().min(1).max(500),
  phone: z.string().max(80).nullable().optional(),
  category: optionalRefString,
  client_type_code: optionalRefString,
  region: optionalRefString,
  district: optionalRefString,
  city: optionalRefString,
  neighborhood: optionalRefString,
  zone: optionalRefString,
  client_format: optionalRefString,
  sales_channel: optionalRefString,
  product_category_ref: optionalRefString,
  logistics_service: optionalRefString
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
    city: z.string().nullable().optional(),
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

const CLIENT_LIST_ALLOWED_SORT = new Set<string>([
  "name",
  "phone",
  "id",
  "created_at",
  "region",
  "legal_name",
  "address",
  "responsible_person",
  "landmark",
  "inn",
  "client_pinfl",
  "sales_channel",
  "category",
  "client_type_code",
  "client_format",
  "district",
  "neighborhood",
  "zone",
  "city",
  "client_code",
  "latitude",
  "longitude"
]);

function parseClientListQuery(q: Record<string, string | undefined>): ListClientsQuery {
  const pageNum = Math.max(1, Number.parseInt(q.page ?? "1", 10) || 1);
  const mapMode = q.map === "1" || q.map === "true";
  const maxLimit = mapMode ? 4000 : 100;
  const defaultLimit = mapMode ? 2500 : 50;
  const parsedLimit = Number.parseInt(q.limit ?? String(defaultLimit), 10) || defaultLimit;
  const limitNum = Math.min(maxLimit, Math.max(1, parsedLimit));
  const search = q.search?.trim() || undefined;
  let is_active: boolean | undefined;
  if (q.is_active === "true") is_active = true;
  else if (q.is_active === "false") is_active = false;
  const category = q.category?.trim() || undefined;
  const region = q.region?.trim() || undefined;
  const district = q.district?.trim() || undefined;
  const neighborhood = q.neighborhood?.trim() || undefined;
  const zone = q.zone?.trim() || undefined;
  const city = q.city?.trim() || undefined;
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
  const client_pinfl = q.client_pinfl?.trim() || undefined;
  let has_active_equipment: boolean | undefined;
  if (q.has_active_equipment === "true") has_active_equipment = true;
  else if (q.has_active_equipment === "false") has_active_equipment = false;
  const equipment_kind = q.equipment_kind?.trim() || undefined;
  let has_credit: boolean | undefined;
  if (q.has_credit === "true") has_credit = true;
  else if (q.has_credit === "false") has_credit = false;
  let agent_consignment: "yes" | "no" | undefined;
  const acRaw = q.agent_consignment?.trim().toLowerCase();
  if (acRaw === "yes" || acRaw === "true" || acRaw === "1") agent_consignment = "yes";
  else if (acRaw === "no" || acRaw === "false" || acRaw === "0") agent_consignment = "no";
  let agent_consignment_limited: "yes" | "no" | undefined;
  const aclRaw = q.agent_consignment_limited?.trim().toLowerCase();
  if (aclRaw === "yes" || aclRaw === "true" || aclRaw === "1") agent_consignment_limited = "yes";
  else if (aclRaw === "no" || aclRaw === "false" || aclRaw === "0") agent_consignment_limited = "no";
  const created_from = q.created_from?.trim() || undefined;
  const created_to = q.created_to?.trim() || undefined;
  let supervisor_user_id: number | undefined;
  if (q.supervisor_user_id != null && q.supervisor_user_id !== "") {
    const n = Number.parseInt(q.supervisor_user_id, 10);
    if (Number.isFinite(n) && n > 0) supervisor_user_id = n;
  }
  const sortRaw = q.sort?.trim();
  const sort: NonNullable<ListClientsQuery["sort"]> =
    sortRaw && CLIENT_LIST_ALLOWED_SORT.has(sortRaw)
      ? (sortRaw as NonNullable<ListClientsQuery["sort"]>)
      : "name";
  const order = q.order === "desc" ? "desc" : "asc";
  const has_coords = q.has_coords === "1" || q.has_coords === "true";

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
    ...(city ? { city } : {}),
    ...(client_type_code ? { client_type_code } : {}),
    ...(client_format ? { client_format } : {}),
    ...(sales_channel ? { sales_channel } : {}),
    ...(agent_id !== undefined ? { agent_id } : {}),
    ...(expeditor_user_id !== undefined ? { expeditor_user_id } : {}),
    ...(visit_weekday !== undefined ? { visit_weekday } : {}),
    ...(inn ? { inn } : {}),
    ...(phone ? { phone } : {}),
    ...(client_pinfl ? { client_pinfl } : {}),
    ...(has_active_equipment !== undefined ? { has_active_equipment } : {}),
    ...(equipment_kind ? { equipment_kind } : {}),
    ...(has_credit !== undefined ? { has_credit } : {}),
    ...(agent_consignment !== undefined ? { agent_consignment } : {}),
    ...(agent_consignment_limited !== undefined ? { agent_consignment_limited } : {}),
    ...(created_from ? { created_from } : {}),
    ...(created_to ? { created_to } : {}),
    ...(supervisor_user_id !== undefined ? { supervisor_user_id } : {}),
    sort,
    order,
    ...(has_coords ? { has_coords: true } : {})
  };
}

export async function registerClientRoutes(app: FastifyInstance) {
  /** Bir segment — ba’zi marshrut/proksi konfiguratsiyalarida `import/update-template` 404 berishi mumkin. */
  app.get(
    "/api/:slug/clients/import-update-template",
    { preHandler: [jwtAccessVerify, requireRoles(...catalogRoles)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const q = parseClientListQuery(request.query as Record<string, string | undefined>);
      return sendClientUpdateImportTemplateXlsx(reply, request.tenant!.id, q);
    }
  );

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
          phone: parsed.data.phone ?? null,
          category: parsed.data.category,
          client_type_code: parsed.data.client_type_code,
          region: parsed.data.region,
          district: parsed.data.district,
          city: parsed.data.city,
          neighborhood: parsed.data.neighborhood,
          zone: parsed.data.zone,
          client_format: parsed.data.client_format,
          sales_channel: parsed.data.sales_channel,
          product_category_ref: parsed.data.product_category_ref,
          logistics_service: parsed.data.logistics_service
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

  app.get(
    "/api/:slug/clients/import/update-template",
    { preHandler: [jwtAccessVerify, requireRoles(...catalogRoles)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const q = parseClientListQuery(request.query as Record<string, string | undefined>);
      return sendClientUpdateImportTemplateXlsx(reply, request.tenant!.id, q);
    }
  );

  app.post(
    "/api/:slug/clients/import",
    { preHandler: [jwtAccessVerify, requireRoles(...catalogRoles)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const parsed = await parseClientImportMultipart(request);
      if (!parsed) {
        return reply.status(400).send({ error: "NoFile" });
      }
      const result = await importClientsFromXlsx(request.tenant!.id, parsed.buf, {
        sheetName: parsed.sheetName,
        headerRowIndex: parsed.headerRowIndex,
        columnMap: parsed.columnMap,
        importMode: parsed.importMode,
        duplicateKeyFields: parsed.duplicateKeyFields,
        updateApplyFields: parsed.updateApplyFields
      });
      return reply.send(result);
    }
  );

  app.post(
    "/api/:slug/clients/import/async",
    { preHandler: [jwtAccessVerify, requireRoles(...catalogRoles)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const tenant = request.tenant!;
      const user = getAccessUser(request);
      const parsed = await parseClientImportMultipart(request);
      if (!parsed) {
        return reply.status(400).send({ error: "NoFile" });
      }
      let tempPath: string | null = null;
      try {
        tempPath = await writeClientImportTempFile(parsed.buf);
        const { queue, jobId } = await enqueueClientsImportJob(tenant.id, Number(user.sub), tempPath, {
          sheetName: parsed.sheetName,
          headerRowIndex: parsed.headerRowIndex,
          columnMap: parsed.columnMap,
          importMode: parsed.importMode,
          duplicateKeyFields: parsed.duplicateKeyFields,
          updateApplyFields: parsed.updateApplyFields
        });
        tempPath = null;
        return reply.status(202).send({
          queue,
          jobId,
          message:
            "Worker ishga tushgan bo‘lsa, natija uchun GET /api/:slug/jobs/{jobId} ni so‘rang (bir xil JWT)."
        });
      } catch (err) {
        if (tempPath) {
          await unlink(tempPath).catch(() => {});
        }
        request.log.warn({ err }, "clients.import.async enqueue failed");
        return reply.status(503).send({
          error: "JobQueueUnavailable",
          message: "Redis yoki navbat mavjud emas. Worker va REDIS_URL ni tekshiring."
        });
      }
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
    "/api/:slug/clients/:id/reconciliation-pdf",
    { preHandler: [jwtAccessVerify, requireRoles(...catalogRoles)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const id = Number.parseInt((request.params as { id: string }).id, 10);
      if (Number.isNaN(id) || id < 1) {
        return reply.status(400).send({ error: "InvalidId" });
      }
      const q = request.query as Record<string, string | undefined>;
      let dateFrom: Date;
      let dateToEnd: Date;
      if ((q.date_from && q.date_from.trim()) || (q.date_to && q.date_to.trim())) {
        if (!q.date_from?.trim() || !q.date_to?.trim()) {
          return reply.status(400).send({
            error: "DateRangeIncomplete",
            message: "date_from va date_to ikkalasi ham YYYY-MM-DD ko‘rinishida yuborilishi kerak."
          });
        }
        const a = parseLocalYmd(q.date_from);
        const b = parseLocalYmd(q.date_to);
        if (!a || !b) {
          return reply.status(400).send({ error: "InvalidDate" });
        }
        dateFrom = new Date(a.getFullYear(), a.getMonth(), a.getDate(), 0, 0, 0, 0);
        dateToEnd = endOfLocalDay(b);
      } else {
        const d = defaultReconciliationRange();
        dateFrom = d.from;
        dateToEnd = d.toEnd;
      }
      try {
        const buf = await getClientReconciliationPdfBuffer(request.tenant!.id, id, dateFrom, dateToEnd);
        const ymd = (x: Date) =>
          `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
        const fname = `akt-sverka-client-${id}-${ymd(dateFrom)}_${ymd(dateToEnd)}.pdf`;
        return reply
          .header("Content-Type", "application/pdf")
          .header("Content-Disposition", `attachment; filename="${fname}"`)
          .send(buf);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "";
        if (msg === "NOT_FOUND") return reply.status(404).send({ error: "NotFound" });
        if (msg === "BAD_DATE_RANGE") {
          return reply.status(400).send({ error: "BadDateRange", message: "date_from date_to dan katta." });
        }
        if (msg === "DATE_RANGE_TOO_LONG") {
          return reply.status(400).send({
            error: "DateRangeTooLong",
            message: "Davr 400 kundan oshmasligi kerak."
          });
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
    "/api/:slug/clients/:id/sales-analytics",
    { preHandler: [jwtAccessVerify] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const id = Number.parseInt((request.params as { id: string }).id, 10);
      if (Number.isNaN(id)) {
        return reply.status(400).send({ error: "InvalidId" });
      }
      const q = request.query as Record<string, string | undefined>;
      let product_category_id: number | undefined;
      if (q.product_category_id?.trim()) {
        const n = Number.parseInt(q.product_category_id.trim(), 10);
        if (Number.isFinite(n) && n > 0) product_category_id = n;
      }
      let agent_ids: number[] | undefined;
      const agentIdsRaw = q.agent_ids?.trim();
      if (agentIdsRaw) {
        const parts = agentIdsRaw.split(/[,;\s]+/).map((s) => Number.parseInt(s.trim(), 10));
        const ids = parts.filter((n) => Number.isFinite(n) && n > 0);
        if (ids.length > 0) agent_ids = ids;
      }
      const noAgentRaw = q.no_agent?.trim().toLowerCase();
      const include_no_agent = noAgentRaw === "1" || noAgentRaw === "true" || noAgentRaw === "yes";
      try {
        const row = await getClientSalesAnalytics(request.tenant!.id, id, {
          date_from: q.date_from,
          date_to: q.date_to,
          status: q.status,
          order_type: q.order_type,
          consignment: q.consignment,
          product_category_id: product_category_id ?? null,
          payment_type: q.payment_type?.trim() || null,
          agent_ids: agent_ids ?? null,
          include_no_agent: include_no_agent || undefined
        });
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
    "/api/:slug/clients/:id/equipment",
    { preHandler: [jwtAccessVerify] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const id = Number.parseInt((request.params as { id: string }).id, 10);
      if (Number.isNaN(id)) {
        return reply.status(400).send({ error: "InvalidId" });
      }
      try {
        const data = await listClientEquipmentSplit(request.tenant!.id, id);
        return reply.send(data);
      } catch (e) {
        if (e instanceof Error && e.message === "NOT_FOUND") {
          return reply.status(404).send({ error: "NotFound" });
        }
        throw e;
      }
    }
  );

  app.post(
    "/api/:slug/clients/:id/equipment",
    { preHandler: [jwtAccessVerify, requireRoles(...catalogRoles)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const id = Number.parseInt((request.params as { id: string }).id, 10);
      if (Number.isNaN(id)) {
        return reply.status(400).send({ error: "InvalidId" });
      }
      const parsed = createClientEquipmentBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "ValidationError", details: parsed.error.flatten() });
      }
      try {
        const row = await createClientEquipmentRow(request.tenant!.id, id, parsed.data);
        return reply.status(201).send(row);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "";
        if (msg === "NOT_FOUND") return reply.status(404).send({ error: "NotFound" });
        if (msg === "VALIDATION") return reply.status(400).send({ error: "ValidationError" });
        throw e;
      }
    }
  );

  app.post(
    "/api/:slug/clients/:id/equipment/:equipmentId/remove",
    { preHandler: [jwtAccessVerify, requireRoles(...catalogRoles)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const id = Number.parseInt((request.params as { id: string }).id, 10);
      const equipmentId = Number.parseInt((request.params as { equipmentId: string }).equipmentId, 10);
      if (Number.isNaN(id) || Number.isNaN(equipmentId)) {
        return reply.status(400).send({ error: "InvalidId" });
      }
      try {
        await markClientEquipmentRemoved(request.tenant!.id, id, equipmentId);
        return reply.send({ ok: true });
      } catch (e) {
        if (e instanceof Error && e.message === "NOT_FOUND") {
          return reply.status(404).send({ error: "NotFound" });
        }
        throw e;
      }
    }
  );

  app.get(
    "/api/:slug/clients/:id/photo-reports",
    { preHandler: [jwtAccessVerify] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const id = Number.parseInt((request.params as { id: string }).id, 10);
      if (Number.isNaN(id)) {
        return reply.status(400).send({ error: "InvalidId" });
      }
      try {
        const data = await listClientPhotoReports(request.tenant!.id, id);
        return reply.send({ data });
      } catch (e) {
        if (e instanceof Error && e.message === "NOT_FOUND") {
          return reply.status(404).send({ error: "NotFound" });
        }
        throw e;
      }
    }
  );

  app.post(
    "/api/:slug/clients/:id/photo-reports",
    { preHandler: [jwtAccessVerify, requireRoles(...catalogRoles)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const id = Number.parseInt((request.params as { id: string }).id, 10);
      if (Number.isNaN(id)) {
        return reply.status(400).send({ error: "InvalidId" });
      }
      const parsed = createClientPhotoBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "ValidationError", details: parsed.error.flatten() });
      }
      try {
        const actor = getAccessUser(request);
        const sub = Number.parseInt(actor.sub, 10);
        const actorUserId = Number.isFinite(sub) && sub > 0 ? sub : null;
        const row = await createClientPhotoReportRow(request.tenant!.id, id, actorUserId, parsed.data);
        return reply.status(201).send(row);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "";
        if (msg === "NOT_FOUND") return reply.status(404).send({ error: "NotFound" });
        if (msg === "VALIDATION") return reply.status(400).send({ error: "ValidationError" });
        if (msg === "ORDER_NOT_FOUND") return reply.status(400).send({ error: "OrderNotFound" });
        throw e;
      }
    }
  );

  app.delete(
    "/api/:slug/clients/:id/photo-reports/:photoId",
    { preHandler: [jwtAccessVerify, requireRoles(...catalogRoles)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const id = Number.parseInt((request.params as { id: string }).id, 10);
      const photoId = Number.parseInt((request.params as { photoId: string }).photoId, 10);
      if (Number.isNaN(id) || Number.isNaN(photoId)) {
        return reply.status(400).send({ error: "InvalidId" });
      }
      try {
        await deleteClientPhotoReport(request.tenant!.id, id, photoId);
        return reply.send({ ok: true });
      } catch (e) {
        if (e instanceof Error && e.message === "NOT_FOUND") {
          return reply.status(404).send({ error: "NotFound" });
        }
        throw e;
      }
    }
  );

  app.get(
    "/api/:slug/clients/:id/balance-ledger",
    { preHandler: [jwtAccessVerify, requireRoles(...catalogRoles)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const id = Number.parseInt((request.params as { id: string }).id, 10);
      if (Number.isNaN(id)) {
        return reply.status(400).send({ error: "InvalidId" });
      }
      const q = request.query as Record<string, string | undefined>;
      const pageNum = Math.max(1, Number.parseInt(q.page ?? "1", 10) || 1);
      const ledger_detail = q.ledger_detail === "1" || q.ledger_detail === "true";
      const maxLedgerLimit = ledger_detail ? 5000 : 100;
      const limitNum = Math.min(
        maxLedgerLimit,
        Math.max(1, Number.parseInt(q.limit ?? "20", 10) || 20)
      );
      const search = q.search?.trim() || undefined;
      const lkRaw = q.ledger_kind?.trim();
      const ledger_kind =
        lkRaw === "debt" || lkRaw === "payment" ? lkRaw : ("all" as const);
      const noAgent = q.no_agent === "1" || q.no_agent === "true";
      let filter_agent_ids: number[] = [];
      const rawIds = q.agent_ids?.trim();
      if (rawIds) {
        for (const part of rawIds.split(/[,;]+/)) {
          const t = part.trim();
          if (!t) continue;
          const n = Number.parseInt(t, 10);
          if (Number.isFinite(n) && n > 0) filter_agent_ids.push(n);
        }
        filter_agent_ids = [...new Set(filter_agent_ids)];
      }
      let filter_agent_id: number | null = null;
      if (filter_agent_ids.length === 0 && q.agent_id?.trim()) {
        const aid = Number.parseInt(q.agent_id.trim(), 10);
        if (!Number.isFinite(aid) || aid <= 0) {
          return reply.status(400).send({ error: "InvalidAgentId" });
        }
        filter_agent_id = aid;
      }
      let dateFrom: Date | null = null;
      let dateToEnd: Date | null = null;
      if (q.date_from?.trim()) {
        const a = parseLocalYmd(q.date_from);
        if (!a) return reply.status(400).send({ error: "InvalidDate", field: "date_from" });
        dateFrom = new Date(a.getFullYear(), a.getMonth(), a.getDate(), 0, 0, 0, 0);
      }
      if (q.date_to?.trim()) {
        const b = parseLocalYmd(q.date_to);
        if (!b) return reply.status(400).send({ error: "InvalidDate", field: "date_to" });
        dateToEnd = endOfLocalDay(b);
      }
      if (dateFrom && dateToEnd && dateFrom > dateToEnd) {
        return reply.status(400).send({ error: "BadDateRange" });
      }
      try {
        const result = await getClientBalanceLedger(request.tenant!.id, id, {
          page: pageNum,
          limit: limitNum,
          date_from: dateFrom,
          date_to_end: dateToEnd,
          search,
          ledger_kind,
          filter_agent_id: filter_agent_id ?? null,
          filter_agent_ids: filter_agent_ids.length > 0 ? filter_agent_ids : undefined,
          filter_no_agent: noAgent,
          ledger_detail
        });
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
    "/api/:slug/clients/:id/debtor-creditor-monthly",
    { preHandler: [jwtAccessVerify, requireRoles(...catalogRoles)] },
    async (request, reply) => {
      if (!ensureTenantContext(request, reply)) return;
      const id = Number.parseInt((request.params as { id: string }).id, 10);
      if (Number.isNaN(id)) {
        return reply.status(400).send({ error: "InvalidId" });
      }
      try {
        const rows = await getClientDebtorCreditorMonthly(request.tenant!.id, id);
        return reply.send({ rows });
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
      let dateFrom: Date | null = null;
      let dateToEnd: Date | null = null;
      if (q.date_from?.trim()) {
        const a = parseLocalYmd(q.date_from);
        if (!a) return reply.status(400).send({ error: "InvalidDate", field: "date_from" });
        dateFrom = new Date(a.getFullYear(), a.getMonth(), a.getDate(), 0, 0, 0, 0);
      }
      if (q.date_to?.trim()) {
        const b = parseLocalYmd(q.date_to);
        if (!b) return reply.status(400).send({ error: "InvalidDate", field: "date_to" });
        dateToEnd = endOfLocalDay(b);
      }
      try {
        const result = await listClientBalanceMovements(request.tenant!.id, id, pageNum, limitNum, {
          date_from: dateFrom,
          date_to_end: dateToEnd
        });
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
