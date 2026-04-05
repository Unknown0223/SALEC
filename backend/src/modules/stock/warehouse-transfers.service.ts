import { Prisma } from "@prisma/client";
import { prisma } from "../../config/database";
import { appendTenantAuditEvent, AuditEntityType } from "../../lib/tenant-audit";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CreateTransferLineInput = {
  product_id: number;
  qty: number;
  batch_no?: string | null;
  comment?: string | null;
};

export type CreateTransferInput = {
  source_warehouse_id: number;
  destination_warehouse_id: number;
  comment?: string | null;
  planned_date?: string | null;
  lines: CreateTransferLineInput[];
};

export type UpdateTransferInput = {
  source_warehouse_id?: number;
  destination_warehouse_id?: number;
  comment?: string | null;
  planned_date?: string | null;
  lines?: CreateTransferLineInput[];
};

export type GetTransfersOptions = {
  status?: string;
  source_warehouse_id?: number;
  destination_warehouse_id?: number;
  page?: number;
  limit?: number;
};

export type TransferListRow = {
  id: number;
  number: string;
  status: string;
  source_warehouse_id: number;
  source_warehouse_name: string;
  destination_warehouse_id: number;
  destination_warehouse_name: string;
  comment: string | null;
  planned_date: string | null;
  started_at: string | null;
  received_at: string | null;
  created_at: string;
  created_by_user_id: number | null;
  line_count: number;
};

export type TransferLineRow = {
  id: number;
  product_id: number;
  product_sku: string;
  product_name: string;
  qty: string;
  received_qty: string | null;
  batch_no: string | null;
  comment: string | null;
  sort_order: number;
};

export type TransferDetail = {
  id: number;
  number: string;
  status: string;
  source_warehouse_id: number;
  source_warehouse_name: string;
  destination_warehouse_id: number;
  destination_warehouse_name: string;
  comment: string | null;
  planned_date: string | null;
  started_at: string | null;
  received_at: string | null;
  created_at: string;
  created_by_user_id: number | null;
  received_by_user_id: number | null;
  lines: TransferLineRow[];
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type AssertTransferRow = {
  id: number;
  status: string;
  source_warehouse_id: number;
  destination_warehouse_id: number;
};

async function assertTransferExists(
  tenantId: number,
  id: number
): Promise<AssertTransferRow> {
  const rows = await prisma.$queryRaw<AssertTransferRow[]>`
    SELECT id, status, source_warehouse_id, destination_warehouse_id
    FROM warehouse_transfers
    WHERE id = ${id} AND tenant_id = ${tenantId}
  `;
  const hit = rows[0];
  if (!hit) throw new Error("NOT_FOUND");
  return hit;
}

async function assertWarehouseForTenant(tenantId: number, warehouseId: number): Promise<{ id: number; name: string }> {
  const wh = await prisma.$queryRaw<
    { id: number; name: string }[]
  >`SELECT id, name FROM warehouses WHERE id = ${warehouseId} AND tenant_id = ${tenantId}`;
  if (!wh[0]) throw new Error("BAD_WAREHOUSE");
  return wh[0];
}

function validateWarehouseDisjoint(input: { source_warehouse_id: number; destination_warehouse_id: number }) {
  if (input.source_warehouse_id === input.destination_warehouse_id) {
    throw new Error("SAME_WAREHOUSE");
  }
}

function generateTransferNumber(id: number): string {
  return `WT-${String(id).padStart(6, "0")}`;
}

// ---------------------------------------------------------------------------
// 1. createTransfer
// ---------------------------------------------------------------------------

export async function createTransfer(
  tenantId: number,
  input: CreateTransferInput,
  actorUserId: number | null = null
): Promise<{ id: number; number: string }> {
  if (!input.lines.length) throw new Error("EMPTY_LINES");
  if (input.lines.some((l) => l.qty == null || l.qty <= 0)) throw new Error("BAD_QTY");

  const src = await assertWarehouseForTenant(tenantId, input.source_warehouse_id);
  const dst = await assertWarehouseForTenant(tenantId, input.destination_warehouse_id);
  validateWarehouseDisjoint({
    source_warehouse_id: input.source_warehouse_id,
    destination_warehouse_id: input.destination_warehouse_id,
  });

  const tmp = `TMP-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  const result = await prisma.$queryRaw<
    { id: number }[]
  >`
    INSERT INTO warehouse_transfers (
      tenant_id, number, source_warehouse_id, destination_warehouse_id,
      status, comment, planned_date, created_by_user_id
    ) VALUES (
      ${tenantId}, ${tmp},
      ${input.source_warehouse_id}, ${input.destination_warehouse_id},
      'draft',
      ${input.comment?.trim() ?? null},
      ${input.planned_date ? new Date(input.planned_date) : null},
      ${actorUserId ?? null}
    )
    RETURNING id
  `;

  const rec = result[0];
  if (!rec) throw new Error("CREATE_FAILED");
  const number = generateTransferNumber(rec.id);

  await prisma.$executeRaw`
    UPDATE warehouse_transfers
    SET number = ${number}
    WHERE id = ${rec.id}
  `;

  const lineInserts: Prisma.Sql[] = input.lines.map((l, i) =>
    Prisma.sql`(
      ${rec.id}, ${l.product_id}, ${new Prisma.Decimal(l.qty)},
      ${l.batch_no?.trim() ?? null}, ${l.comment?.trim() ?? null}, ${i}
    )`
  );

  await prisma.$executeRaw`
    INSERT INTO warehouse_transfer_lines (
      transfer_id, product_id, qty, batch_no, comment, sort_order
    ) VALUES ${Prisma.join(lineInserts)}
  `;

  await appendTenantAuditEvent({
    tenantId,
    actorUserId,
    entityType: AuditEntityType.stock,
    entityId: rec.id,
    action: "transfer_create",
    payload: { number, line_count: input.lines.length },
  });

  return { id: rec.id, number };
}

// ---------------------------------------------------------------------------
// 2. getTransfers
// ---------------------------------------------------------------------------

export async function getTransfers(
  tenantId: number,
  options: GetTransfersOptions
): Promise<{ data: TransferListRow[]; total: number }> {
  const page = options.page ?? 1;
  const limit = options.limit ?? 20;

  const status = options.status?.trim() ?? null;
  const srcWh = options.source_warehouse_id ?? null;
  const dstWh = options.destination_warehouse_id ?? null;

  // Build where clause safely
  const baseWhere = Prisma.sql`t.tenant_id = ${tenantId}`;
  const extraParts: Prisma.Sql[] = [];
  if (status) extraParts.push(Prisma.sql`t.status = ${status}`);
  if (srcWh != null) extraParts.push(Prisma.sql`t.source_warehouse_id = ${srcWh}`);
  if (dstWh != null) extraParts.push(Prisma.sql`t.destination_warehouse_id = ${dstWh}`);

  const whereClause = extraParts.length > 0
    ? Prisma.sql`${baseWhere} AND ${Prisma.join(extraParts, Prisma.sql` AND `)}`
    : baseWhere;

  const totalCount = await prisma.$queryRaw<{ total: bigint }[]>(
    Prisma.sql`SELECT COUNT(*) AS total FROM warehouse_transfers t WHERE ${whereClause}`
  );
  const total = Number(totalCount[0].total);

  const rows = await prisma.$queryRaw<
    {
      id: number;
      number: string;
      status: string;
      source_warehouse_id: number;
      source_warehouse_name: string;
      destination_warehouse_id: number;
      destination_warehouse_name: string;
      comment: string | null;
      planned_date: Date | null;
      started_at: Date | null;
      received_at: Date | null;
      created_at: Date;
      created_by_user_id: number | null;
      line_count: bigint;
    }[]
  >(
    Prisma.sql`
      SELECT t.*, sw.name as source_warehouse_name, dw.name as destination_warehouse_name,
             COALESCE(lc.cnt, 0) as line_count
      FROM warehouse_transfers t
      JOIN warehouses sw ON t.source_warehouse_id = sw.id
      JOIN warehouses dw ON t.destination_warehouse_id = dw.id
      LEFT JOIN (
        SELECT transfer_id, COUNT(*) as cnt
        FROM warehouse_transfer_lines
        GROUP BY transfer_id
      ) lc ON lc.transfer_id = t.id
      WHERE ${whereClause}
      ORDER BY t.created_at DESC
      LIMIT ${limit}
      OFFSET ${(page - 1) * limit}
    `
  );

  const data: TransferListRow[] = rows.map((r) => ({
    id: r.id,
    number: r.number,
    status: r.status,
    source_warehouse_id: r.source_warehouse_id,
    source_warehouse_name: r.source_warehouse_name,
    destination_warehouse_id: r.destination_warehouse_id,
    destination_warehouse_name: r.destination_warehouse_name,
    comment: r.comment,
    planned_date: r.planned_date?.toISOString() ?? null,
    started_at: r.started_at?.toISOString() ?? null,
    received_at: r.received_at?.toISOString() ?? null,
    created_at: r.created_at.toISOString(),
    created_by_user_id: r.created_by_user_id,
    line_count: Number(r.line_count),
  }));

  return { data, total };
}

// ---------------------------------------------------------------------------
// 3. getTransferById
// ---------------------------------------------------------------------------

export async function getTransferById(
  tenantId: number,
  id: number
): Promise<TransferDetail | null> {
  const transfers = await prisma.$queryRaw<
    {
      id: number;
      number: string;
      status: string;
      source_warehouse_id: number;
      source_warehouse_name: string;
      destination_warehouse_id: number;
      destination_warehouse_name: string;
      comment: string | null;
      planned_date: Date | null;
      started_at: Date | null;
      received_at: Date | null;
      created_at: Date;
      created_by_user_id: number | null;
      received_by_user_id: number | null;
    }[]
  >(
    Prisma.sql`
      SELECT t.*,
             sw.name as source_warehouse_name,
             dw.name as destination_warehouse_name
      FROM warehouse_transfers t
      JOIN warehouses sw ON t.source_warehouse_id = sw.id
      JOIN warehouses dw ON t.destination_warehouse_id = dw.id
      WHERE t.id = ${id} AND t.tenant_id = ${tenantId}
    `
  );

  if (!transfers[0]) return null;
  const t = transfers[0];

  const linesRaw = await prisma.$queryRaw<
    {
      id: number;
      product_id: number;
      product_sku: string;
      product_name: string;
      qty: Prisma.Decimal;
      received_qty: Prisma.Decimal | null;
      batch_no: string | null;
      comment: string | null;
      sort_order: number;
    }[]
  >(
    Prisma.sql`
      SELECT l.id, l.product_id, l.qty, l.received_qty,
             l.batch_no, l.comment, l.sort_order,
             p.sku as product_sku, p.name as product_name
      FROM warehouse_transfer_lines l
      JOIN products p ON l.product_id = p.id
      WHERE l.transfer_id = ${t.id}
      ORDER BY l.sort_order ASC
    `
  );

  const lines: TransferLineRow[] = linesRaw.map((l) => ({
    id: l.id,
    product_id: l.product_id,
    product_sku: l.product_sku,
    product_name: l.product_name,
    qty: l.qty.toString(),
    received_qty: l.received_qty?.toString() ?? null,
    batch_no: l.batch_no,
    comment: l.comment,
    sort_order: l.sort_order,
  }));

  return {
    id: t.id,
    number: t.number,
    status: t.status,
    source_warehouse_id: t.source_warehouse_id,
    source_warehouse_name: t.source_warehouse_name,
    destination_warehouse_id: t.destination_warehouse_id,
    destination_warehouse_name: t.destination_warehouse_name,
    comment: t.comment,
    planned_date: t.planned_date?.toISOString() ?? null,
    started_at: t.started_at?.toISOString() ?? null,
    received_at: t.received_at?.toISOString() ?? null,
    created_at: t.created_at.toISOString(),
    created_by_user_id: t.created_by_user_id,
    received_by_user_id: t.received_by_user_id,
    lines,
  };
}

// ---------------------------------------------------------------------------
// 4. updateTransfer
// ---------------------------------------------------------------------------

export async function updateTransfer(
  tenantId: number,
  id: number,
  input: UpdateTransferInput,
  actorUserId: number | null = null
): Promise<{ id: number; number: string }> {
  const existing = await assertTransferExists(tenantId, id);
  if (existing.status !== "draft") throw new Error("NOT_DRAFT");

  // Validate warehouses if changing
  const srcWh = input.source_warehouse_id ?? Number(existing.source_warehouse_id);
  const dstWh = input.destination_warehouse_id ?? Number(existing.destination_warehouse_id);
  if (input.source_warehouse_id != null) {
    await assertWarehouseForTenant(tenantId, input.source_warehouse_id);
  }
  if (input.destination_warehouse_id != null) {
    await assertWarehouseForTenant(tenantId, input.destination_warehouse_id);
  }
  validateWarehouseDisjoint({
    source_warehouse_id: srcWh,
    destination_warehouse_id: dstWh,
  });

  await prisma.$transaction(async () => {
    // Update header fields (each one is safe because Prisma.Sql handles parameterization)
    if (input.source_warehouse_id != null) {
      await prisma.$executeRaw`
        UPDATE warehouse_transfers
        SET source_warehouse_id = ${input.source_warehouse_id}
        WHERE id = ${id} AND tenant_id = ${tenantId}
      `;
    }
    if (input.destination_warehouse_id != null) {
      await prisma.$executeRaw`
        UPDATE warehouse_transfers
        SET destination_warehouse_id = ${input.destination_warehouse_id}
        WHERE id = ${id} AND tenant_id = ${tenantId}
      `;
    }
    if (input.comment !== undefined) {
      await prisma.$executeRaw`
        UPDATE warehouse_transfers
        SET comment = ${input.comment?.trim() ?? null}
        WHERE id = ${id} AND tenant_id = ${tenantId}
      `;
    }
    if (input.planned_date !== undefined) {
      await prisma.$executeRaw`
        UPDATE warehouse_transfers
        SET planned_date = ${input.planned_date ? new Date(input.planned_date) : null}
        WHERE id = ${id} AND tenant_id = ${tenantId}
      `;
    }

    // Replace lines if provided
    if (input.lines != null) {
      if (input.lines.some((l) => l.qty == null || l.qty <= 0)) throw new Error("BAD_QTY");

      await prisma.$executeRaw`
        DELETE FROM warehouse_transfer_lines WHERE transfer_id = ${id}
      `;

      if (input.lines.length > 0) {
        const lineValues: Prisma.Sql[] = input.lines.map((l, i) =>
          Prisma.sql`(
            ${id}, ${l.product_id}, ${new Prisma.Decimal(l.qty)},
            ${l.batch_no?.trim() ?? null}, ${l.comment?.trim() ?? null}, ${i}
          )`
        );

        await prisma.$executeRaw`
          INSERT INTO warehouse_transfer_lines (
            transfer_id, product_id, qty, batch_no, comment, sort_order
          ) VALUES ${Prisma.join(lineValues)}
        `;
      }
    }
  });

  // Re-fetch to return the number
  const updated = await prisma.$queryRaw<{ id: number; number: string }[]>(
    Prisma.sql`SELECT id, number FROM warehouse_transfers WHERE id = ${id} AND tenant_id = ${tenantId}`
  );
  const rec = updated[0]!;

  await appendTenantAuditEvent({
    tenantId,
    actorUserId,
    entityType: AuditEntityType.stock,
    entityId: id,
    action: "transfer_update",
    payload: { number: rec.number },
  });

  return { id: rec.id, number: rec.number };
}

// ---------------------------------------------------------------------------
// 5. startTransfer  (draft -> in_transit, deducts source stock)
// ---------------------------------------------------------------------------

export async function startTransfer(
  tenantId: number,
  id: number,
  actorUserId: number | null = null
): Promise<void> {
  const existing = await assertTransferExists(tenantId, id);
  if (existing.status !== "draft") throw new Error("NOT_DRAFT");

  const sourceWarehouseId = Number(existing.source_warehouse_id);

  const lines = await prisma.$queryRaw<
    { id: number; product_id: number; qty: Prisma.Decimal; batch_no: string | null }[]
  >`
    SELECT id, product_id, qty, batch_no
    FROM warehouse_transfer_lines
    WHERE transfer_id = ${id}
    ORDER BY sort_order
  `;

  if (!lines.length) throw new Error("EMPTY_LINES");

  // Pre-validate: verify all products exist and source stock has enough qty
  const productIds = [...new Set(lines.map((l) => l.product_id))];
  const products = await prisma.$queryRaw<
    { id: number; sku: string }[]
  >`SELECT id, sku FROM products WHERE id IN ${Prisma.join(productIds)} AND tenant_id = ${tenantId}`;
  if (products.length !== productIds.length) throw new Error("BAD_PRODUCT");

  // Verify source stock availability
  for (const line of lines) {
    const delta = new Prisma.Decimal(line.qty);
    if (delta.lte(0)) throw new Error("BAD_QTY");

    const stock = await prisma.$queryRaw<
      { qty: Prisma.Decimal; reserved_qty: Prisma.Decimal }[]
    >`
      SELECT qty, reserved_qty FROM stock
      WHERE tenant_id = ${tenantId}
        AND warehouse_id = ${sourceWarehouseId}
        AND product_id = ${line.product_id}
    `;

    const available = stock[0]
      ? stock[0].qty.minus(stock[0].reserved_qty)
      : new Prisma.Decimal(0);

    if (available.lt(delta)) {
      const productInfo = products.find((p) => p.id === line.product_id);
      throw new Error(
        `INSUFFICIENT_STOCK:product=${productInfo?.sku ?? line.product_id}:need=${delta}:have=${available}`
      );
    }
  }

  // Execute status change + stock deductions in a single transaction
  await prisma.$transaction(async () => {
    // Update transfer status
    await prisma.$executeRaw`
      UPDATE warehouse_transfers
      SET status = 'in_transit', started_at = ${new Date()}
      WHERE id = ${id} AND tenant_id = ${tenantId} AND status = 'draft'
    `;

    // Deduct stock from source warehouse
    for (const line of lines) {
      const delta = new Prisma.Decimal(line.qty);

      // Double-check stock still exists and has enough (re-verify inside transaction)
      const stock = await prisma.$queryRaw<
        { id: number; qty: Prisma.Decimal; reserved_qty: Prisma.Decimal }[]
      >`
        SELECT id, qty, reserved_qty FROM stock
        WHERE tenant_id = ${tenantId}
          AND warehouse_id = ${sourceWarehouseId}
          AND product_id = ${line.product_id}
      `;

      const entry = stock[0];
      if (!entry) throw new Error("STOCK_NOT_FOUND");

      const afterQty = entry.qty.minus(delta);
      if (afterQty.lt(0)) {
        const productInfo = products.find((p) => p.id === line.product_id);
        throw new Error(`INSUFFICIENT_STOCK:${productInfo?.sku ?? line.product_id}`);
      }

      await prisma.$executeRaw`
        UPDATE stock
        SET qty = ${afterQty}, updated_at = now()
        WHERE id = ${entry.id}
          AND tenant_id = ${tenantId}
      `;
    }
  });

  await appendTenantAuditEvent({
    tenantId,
    actorUserId,
    entityType: AuditEntityType.stock,
    entityId: id,
    action: "transfer_start",
    payload: { line_count: lines.length },
  });
}

// ---------------------------------------------------------------------------
// 6. receiveTransfer  (in_transit -> received, adds destination stock)
// ---------------------------------------------------------------------------

export type ReceiveAdjustment = {
  product_id: number;
  received_qty?: number | null;
};

export async function receiveTransfer(
  tenantId: number,
  id: number,
  receivedByUserId: number | null,
  adjustments?: ReceiveAdjustment[] | null
): Promise<void> {
  const existing = await assertTransferExists(tenantId, id);
  if (existing.status !== "in_transit") throw new Error("NOT_IN_TRANSIT");

  const destWarehouseId = Number(existing.destination_warehouse_id);

  const lines = await prisma.$queryRaw<
    { product_id: number; qty: Prisma.Decimal; batch_no: string | null }[]
  >`
    SELECT product_id, qty, batch_no
    FROM warehouse_transfer_lines
    WHERE transfer_id = ${id}
    ORDER BY sort_order
  `;

  if (!lines.length) throw new Error("EMPTY_LINES");

  // Build effective received quantities
  const adjMap = new Map<number, number>();
  if (adjustments?.length) {
    for (const a of adjustments) {
      adjMap.set(a.product_id, a.received_qty ?? 0);
    }
  }

  await prisma.$transaction(async () => {
    // Add stock to destination warehouse
    for (const line of lines) {
      const receivedQty = adjMap.has(line.product_id)
        ? new Prisma.Decimal(adjMap.get(line.product_id) ?? 0)
        : new Prisma.Decimal(line.qty);

      if (receivedQty.lte(0)) continue;

      const stock = await prisma.$queryRaw<
        { id: number; qty: Prisma.Decimal }[]
      >`
        SELECT id, qty FROM stock
        WHERE tenant_id = ${tenantId}
          AND warehouse_id = ${destWarehouseId}
          AND product_id = ${line.product_id}
      `;

      if (stock.length > 0) {
        const newQty = stock[0].qty.plus(receivedQty);
        await prisma.$executeRaw`
          UPDATE stock
          SET qty = ${newQty}, updated_at = now()
          WHERE id = ${stock[0].id}
        `;
      } else {
        // Create new stock entry
        await prisma.$executeRaw`
          INSERT INTO stock (tenant_id, warehouse_id, product_id, qty, created_at, updated_at)
          VALUES (${tenantId}, ${destWarehouseId}, ${line.product_id}, ${receivedQty}, now(), now())
        `;
      }

      // Update received_qty on the line
      await prisma.$executeRaw`
        UPDATE warehouse_transfer_lines
        SET received_qty = ${receivedQty}
        WHERE transfer_id = ${id} AND product_id = ${line.product_id}
      `;
    }

    // Update transfer status
    await prisma.$executeRaw`
      UPDATE warehouse_transfers
      SET status = 'received',
          received_at = ${new Date()},
          received_by_user_id = ${receivedByUserId ?? null}
      WHERE id = ${id} AND tenant_id = ${tenantId} AND status = 'in_transit'
    `;
  });

  await appendTenantAuditEvent({
    tenantId,
    actorUserId: receivedByUserId,
    entityType: AuditEntityType.stock,
    entityId: id,
    action: "transfer_receive",
    payload: { adjustments_count: adjustments?.length ?? 0 },
  });
}

// ---------------------------------------------------------------------------
// 7. cancelTransfer  (draft or in_transit -> cancelled)
// ---------------------------------------------------------------------------

export async function cancelTransfer(
  tenantId: number,
  id: number,
  actorUserId: number | null = null
): Promise<void> {
  const existing = await assertTransferExists(tenantId, id);
  const currentStatus = existing.status as string;

  if (currentStatus !== "draft" && currentStatus !== "in_transit") {
    throw new Error("NOT_CANCELLABLE");
  }

  // If in_transit, restore stock to source warehouse
  if (currentStatus === "in_transit") {
    const sourceWarehouseId = Number(existing.source_warehouse_id);

    const lines = await prisma.$queryRaw<
      { product_id: number; qty: Prisma.Decimal }[]
    >`
      SELECT product_id, COALESCE(received_qty, qty) as qty
      FROM warehouse_transfer_lines
      WHERE transfer_id = ${id}
    `;

    if (lines.length > 0) {
      await prisma.$transaction(async () => {
        for (const line of lines) {
          // Restore stock if entry exists, otherwise create it
          const stock = await prisma.$queryRaw<
            { id: number; qty: Prisma.Decimal }[]
          >`
            SELECT id, qty FROM stock
            WHERE tenant_id = ${tenantId}
              AND warehouse_id = ${sourceWarehouseId}
              AND product_id = ${line.product_id}
          `;

          if (stock.length > 0) {
            const newQty = stock[0].qty.plus(line.qty);
            await prisma.$executeRaw`
              UPDATE stock
              SET qty = ${newQty}, updated_at = now()
              WHERE id = ${stock[0].id}
            `;
          } else {
            await prisma.$executeRaw`
              INSERT INTO stock (tenant_id, warehouse_id, product_id, qty, created_at, updated_at)
              VALUES (${tenantId}, ${sourceWarehouseId}, ${line.product_id}, ${line.qty}, now(), now())
            `;
          }
        }

        await prisma.$executeRaw`
          UPDATE warehouse_transfers
          SET status = 'cancelled'
          WHERE id = ${id} AND tenant_id = ${tenantId} AND status = 'in_transit'
        `;
      });
    }
  } else {
    // Draft: just update status
    await prisma.$executeRaw`
      UPDATE warehouse_transfers
      SET status = 'cancelled'
      WHERE id = ${id} AND tenant_id = ${tenantId} AND status = 'draft'
    `;
  }

  await appendTenantAuditEvent({
    tenantId,
    actorUserId,
    entityType: AuditEntityType.stock,
    entityId: id,
    action: "transfer_cancel",
    payload: { previous_status: currentStatus },
  });
}
