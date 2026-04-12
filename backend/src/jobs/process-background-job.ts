import type { Job } from "bullmq";
import { readFile, unlink } from "fs/promises";
import type { OrderStatusNotifyJobData } from "../modules/jobs/jobs.service";
import { importClientsFromXlsx } from "../modules/clients/clients.service";
import { notifyOrderParticipantsStatusChange } from "../modules/notifications/notifications.service";
import { importProductPricesFromXlsx } from "../modules/products/product-prices.service";
import {
  importProductsCatalogUpdateOnlyXlsx,
  importProductsFromCatalogTemplateXlsx,
  importProductsFromXlsx
} from "../modules/products/products.service";
import { importStockReceiptFromXlsx } from "../modules/stock/stock.service";
import { isSafeImportTempPath } from "./import-temp-file";

export type ImportClientsXlsxJobData = {
  tenant_id: number;
  requested_by_user_id: number;
  file_path: string;
  sheetName?: string;
  headerRowIndex?: number;
  columnMap?: Record<string, number>;
};

export type ImportStockXlsxJobData = {
  tenant_id: number;
  actor_user_id: number | null;
  file_path: string;
  defaultWarehouseId?: number;
};

export type ImportProductsXlsxJobData = {
  tenant_id: number;
  actor_user_id: number | null;
  file_path: string;
};

export type ImportProductPricesXlsxJobData = ImportProductsXlsxJobData;

export async function processBackgroundJob(job: Job): Promise<unknown> {
  if (job.name === "ping") {
    return { ok: true, at: new Date().toISOString() };
  }

  if (job.name === "order_status_notify") {
    const d = job.data as OrderStatusNotifyJobData;
    await notifyOrderParticipantsStatusChange(d);
    return { ok: true };
  }

  if (job.name === "import_clients_xlsx") {
    const d = job.data as ImportClientsXlsxJobData;
    const fp = d.file_path;
    if (typeof fp !== "string" || !fp || !isSafeImportTempPath(fp)) {
      throw new Error("Noto‘g‘ri import fayl yo‘li");
    }
    try {
      const buf = await readFile(fp);
      return await importClientsFromXlsx(d.tenant_id, buf, {
        sheetName: d.sheetName,
        headerRowIndex: d.headerRowIndex,
        columnMap: d.columnMap
      });
    } finally {
      await unlink(fp).catch(() => {});
    }
  }

  if (job.name === "import_stock_xlsx") {
    const d = job.data as ImportStockXlsxJobData;
    const fp = d.file_path;
    if (typeof fp !== "string" || !fp || !isSafeImportTempPath(fp)) {
      throw new Error("Noto‘g‘ri import fayl yo‘li");
    }
    try {
      const buf = await readFile(fp);
      return await importStockReceiptFromXlsx(
        d.tenant_id,
        buf,
        d.actor_user_id ?? null,
        d.defaultWarehouseId != null ? { defaultWarehouseId: d.defaultWarehouseId } : undefined
      );
    } finally {
      await unlink(fp).catch(() => {});
    }
  }

  if (
    job.name === "import_products_xlsx" ||
    job.name === "import_products_catalog_xlsx" ||
    job.name === "import_products_catalog_update_xlsx"
  ) {
    const d = job.data as ImportProductsXlsxJobData;
    const fp = d.file_path;
    if (typeof fp !== "string" || !fp || !isSafeImportTempPath(fp)) {
      throw new Error("Noto‘g‘ri import fayl yo‘li");
    }
    const actor = d.actor_user_id ?? null;
    try {
      const buf = await readFile(fp);
      if (job.name === "import_products_xlsx") {
        return await importProductsFromXlsx(d.tenant_id, buf, actor);
      }
      if (job.name === "import_products_catalog_xlsx") {
        return await importProductsFromCatalogTemplateXlsx(d.tenant_id, buf, actor);
      }
      return await importProductsCatalogUpdateOnlyXlsx(d.tenant_id, buf, actor);
    } finally {
      await unlink(fp).catch(() => {});
    }
  }

  if (job.name === "import_product_prices_xlsx") {
    const d = job.data as ImportProductPricesXlsxJobData;
    const fp = d.file_path;
    if (typeof fp !== "string" || !fp || !isSafeImportTempPath(fp)) {
      throw new Error("Noto‘g‘ri import fayl yo‘li");
    }
    try {
      const buf = await readFile(fp);
      return await importProductPricesFromXlsx(d.tenant_id, buf, d.actor_user_id ?? null);
    } finally {
      await unlink(fp).catch(() => {});
    }
  }

  throw new Error(`Noma’lum job: ${job.name}`);
}
