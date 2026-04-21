import { getBackgroundQueue } from "../../jobs/background-queue";
import { BACKGROUND_QUEUE_NAME } from "../../jobs/constants";
import type { ClientImportProgress, ClientXlsxImportResult } from "../clients/clients.service";
import { notifyOrderParticipantsStatusChange } from "../notifications/notifications.service";

/** Worker: `order_status_notify` — zakaz statusi o‘zgaganda in-app bildirishnomalar. */
export type OrderStatusNotifyJobData = {
  tenant_id: number;
  order_id: number;
  order_number: string;
  client_name: string;
  from_status: string;
  to_status: string;
  actor_user_id: number | null;
  agent_id: number | null;
  expeditor_user_id: number | null;
};

/**
 * Navbat orqali yuboradi; Redis/navbat ishlamasa — sinxron `notifyOrderParticipantsStatusChange`.
 */
export async function enqueueOrderStatusNotifyJob(data: OrderStatusNotifyJobData): Promise<void> {
  try {
    const q = getBackgroundQueue();
    await q.add("order_status_notify", data, {
      removeOnComplete: 2000,
      removeOnFail: 8000,
      attempts: 5,
      backoff: { type: "exponential", delay: 1500 }
    });
  } catch {
    void notifyOrderParticipantsStatusChange(data);
  }
}

export type EnqueuePingResult = {
  queue: typeof BACKGROUND_QUEUE_NAME;
  jobId: string;
};

export async function enqueuePingJob(tenantId: number, userId: number): Promise<EnqueuePingResult> {
  const q = getBackgroundQueue();
  const job = await q.add(
    "ping",
    { tenant_id: tenantId, requested_by_user_id: userId },
    { removeOnComplete: 1000, removeOnFail: 5000 }
  );
  return { queue: BACKGROUND_QUEUE_NAME, jobId: String(job.id) };
}

export type StockImportEnqueueOpts = {
  defaultWarehouseId?: number;
};

export type ClientImportEnqueueOpts = {
  sheetName?: string;
  headerRowIndex?: number;
  columnMap?: Record<string, number>;
  importMode?: "create" | "update";
  duplicateKeyFields?: string[];
  updateApplyFields?: string[];
};

export async function enqueueClientsImportJob(
  tenantId: number,
  userId: number,
  filePath: string,
  opts?: ClientImportEnqueueOpts
): Promise<EnqueuePingResult> {
  const q = getBackgroundQueue();
  const job = await q.add(
    "import_clients_xlsx",
    {
      tenant_id: tenantId,
      requested_by_user_id: userId,
      file_path: filePath,
      sheetName: opts?.sheetName,
      headerRowIndex: opts?.headerRowIndex,
      columnMap: opts?.columnMap,
      importMode: opts?.importMode,
      duplicateKeyFields: opts?.duplicateKeyFields,
      updateApplyFields: opts?.updateApplyFields
    },
    { removeOnComplete: 1000, removeOnFail: 5000 }
  );
  return { queue: BACKGROUND_QUEUE_NAME, jobId: String(job.id) };
}

export async function enqueueStockImportJob(
  tenantId: number,
  actorUserId: number | null,
  filePath: string,
  opts?: StockImportEnqueueOpts
): Promise<EnqueuePingResult> {
  const q = getBackgroundQueue();
  const job = await q.add(
    "import_stock_xlsx",
    {
      tenant_id: tenantId,
      actor_user_id: actorUserId,
      file_path: filePath,
      defaultWarehouseId: opts?.defaultWarehouseId
    },
    { removeOnComplete: 1000, removeOnFail: 5000 }
  );
  return { queue: BACKGROUND_QUEUE_NAME, jobId: String(job.id) };
}

/** API javobida `file_path` chiqmasin */
const JOBS_REDACT_FILE_PATH = new Set([
  "import_clients_xlsx",
  "import_stock_xlsx",
  "import_products_xlsx",
  "import_products_catalog_xlsx",
  "import_products_catalog_update_xlsx",
  "import_product_prices_xlsx"
]);

export type ProductImportJobMode = "basic" | "catalog" | "catalog_update";

const PRODUCT_IMPORT_JOB_NAME: Record<ProductImportJobMode, string> = {
  basic: "import_products_xlsx",
  catalog: "import_products_catalog_xlsx",
  catalog_update: "import_products_catalog_update_xlsx"
};

export async function enqueueProductsXlsxImportJob(
  tenantId: number,
  actorUserId: number | null,
  filePath: string,
  mode: ProductImportJobMode
): Promise<EnqueuePingResult> {
  const q = getBackgroundQueue();
  const jobName = PRODUCT_IMPORT_JOB_NAME[mode];
  const job = await q.add(
    jobName,
    {
      tenant_id: tenantId,
      actor_user_id: actorUserId,
      file_path: filePath
    },
    { removeOnComplete: 1000, removeOnFail: 5000 }
  );
  return { queue: BACKGROUND_QUEUE_NAME, jobId: String(job.id) };
}

export async function enqueueProductPricesImportJob(
  tenantId: number,
  actorUserId: number | null,
  filePath: string
): Promise<EnqueuePingResult> {
  const q = getBackgroundQueue();
  const job = await q.add(
    "import_product_prices_xlsx",
    {
      tenant_id: tenantId,
      actor_user_id: actorUserId,
      file_path: filePath
    },
    { removeOnComplete: 1000, removeOnFail: 5000 }
  );
  return { queue: BACKGROUND_QUEUE_NAME, jobId: String(job.id) };
}

function sanitizeJobDataForResponse(name: string, data: unknown): unknown {
  if (JOBS_REDACT_FILE_PATH.has(name) && data && typeof data === "object" && !Array.isArray(data)) {
    const o = { ...(data as Record<string, unknown>) };
    delete o.file_path;
    return o;
  }
  return data;
}

export type JobStatusPayload = {
  queue: typeof BACKGROUND_QUEUE_NAME;
  id: string;
  name: string;
  state: string;
  progress: JobProgressPayload;
  returnvalue: unknown;
  failedReason: string | undefined;
  data: unknown;
};

export type JobProgressPayload =
  | ClientImportProgress
  | {
      stage: string;
      percent: number;
      processedRows: number;
      totalRows: number;
      message?: string;
    };

function normalizeClientImportProgress(
  state: string,
  rawProgress: unknown,
  returnvalue: unknown
): JobProgressPayload {
  if (rawProgress != null && typeof rawProgress === "object" && !Array.isArray(rawProgress)) {
    const p = rawProgress as Record<string, unknown>;
    const percent = Number(p.percent);
    const processedRows = Number(p.processedRows);
    const totalRows = Number(p.totalRows);
    if (Number.isFinite(percent) && Number.isFinite(processedRows) && Number.isFinite(totalRows)) {
      return {
        stage: typeof p.stage === "string" ? p.stage : state,
        percent: Math.max(0, Math.min(100, Math.round(percent))),
        processedRows: Math.max(0, Math.floor(processedRows)),
        totalRows: Math.max(0, Math.floor(totalRows)),
        message: typeof p.message === "string" ? p.message : undefined
      };
    }
  }

  if (state === "completed") {
    const rv = returnvalue as ClientXlsxImportResult | undefined;
    const st = rv?.importStats;
    if (st && st.totalRows > 0) {
      return {
        stage: "done",
        percent: 100,
        processedRows: Math.max(0, Math.floor(st.processedRows)),
        totalRows: Math.max(0, Math.floor(st.totalRows)),
        message:
          `Готово: ${st.processedRows} / ${st.totalRows} строк; новых: ${rv?.created ?? 0}, обновлено: ${rv?.updated ?? 0}` +
          (st.skippedDuplicate > 0 ? `; дубликатов: ${st.skippedDuplicate}` : "") +
          (st.skippedEmpty > 0 ? `; пустых: ${st.skippedEmpty}` : "")
      };
    }
    const fallbackTotal = Math.max(0, Number((rv?.created ?? 0) + (rv?.updated ?? 0)));
    return {
      stage: "done",
      percent: 100,
      processedRows: fallbackTotal,
      totalRows: fallbackTotal > 0 ? fallbackTotal : 0
    };
  }
  if (state === "failed") {
    return { stage: "failed", percent: 100, processedRows: 0, totalRows: 0 };
  }
  return {
    stage: state === "active" ? "writing" : "queued",
    percent: state === "active" ? 15 : 0,
    processedRows: 0,
    totalRows: 0
  };
}

export async function getBackgroundJobForTenant(
  jobId: string,
  tenantId: number
): Promise<JobStatusPayload | null> {
  const q = getBackgroundQueue();
  const job = await q.getJob(jobId);
  if (!job) {
    return null;
  }
  const data = job.data as { tenant_id?: number } | undefined;
  if (data?.tenant_id !== tenantId) {
    return null;
  }
  const state = await job.getState();
  return {
    queue: BACKGROUND_QUEUE_NAME,
    id: String(job.id),
    name: job.name,
    state,
    progress:
      job.name === "import_clients_xlsx"
        ? normalizeClientImportProgress(state, job.progress, job.returnvalue)
        : {
            stage: state,
            percent: state === "completed" || state === "failed" ? 100 : 0,
            processedRows: 0,
            totalRows: 0
          },
    returnvalue: job.returnvalue,
    failedReason: job.failedReason,
    data: sanitizeJobDataForResponse(job.name, job.data)
  };
}
