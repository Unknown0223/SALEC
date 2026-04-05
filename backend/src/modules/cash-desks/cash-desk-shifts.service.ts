import { Prisma } from "@prisma/client";
import { prisma } from "../../config/database";

export async function listShiftsForDesk(tenantId: number, cashDeskId: number, limit: number) {
  const desk = await prisma.cashDesk.findFirst({
    where: { id: cashDeskId, tenant_id: tenantId },
    select: { id: true }
  });
  if (!desk) return null;
  const rows = await prisma.cashDeskShift.findMany({
    where: { tenant_id: tenantId, cash_desk_id: cashDeskId },
    orderBy: { opened_at: "desc" },
    take: Math.min(Math.max(limit, 1), 100),
    include: {
      opened_by: { select: { id: true, name: true, login: true } },
      closed_by: { select: { id: true, name: true, login: true } }
    }
  });
  return rows.map(serializeShift);
}

function serializeShift(s: {
  id: number;
  opened_at: Date;
  closed_at: Date | null;
  opening_float: Prisma.Decimal | null;
  closing_float: Prisma.Decimal | null;
  notes: string | null;
  opened_by: { id: number; name: string; login: string } | null;
  closed_by?: { id: number; name: string; login: string } | null;
}) {
  return {
    id: s.id,
    opened_at: s.opened_at.toISOString(),
    closed_at: s.closed_at?.toISOString() ?? null,
    opening_float: s.opening_float != null ? String(s.opening_float) : null,
    closing_float: s.closing_float != null ? String(s.closing_float) : null,
    notes: s.notes,
    opened_by: s.opened_by,
    closed_by: s.closed_by ?? null
  };
}

export async function getOpenShift(tenantId: number, cashDeskId: number) {
  const row = await prisma.cashDeskShift.findFirst({
    where: { tenant_id: tenantId, cash_desk_id: cashDeskId, closed_at: null },
    orderBy: { opened_at: "desc" },
    include: {
      opened_by: { select: { id: true, name: true, login: true } }
    }
  });
  return row ? serializeShift(row) : null;
}

export async function openShift(
  tenantId: number,
  cashDeskId: number,
  userId: number,
  body: { opening_float?: number | null; notes?: string | null }
) {
  const desk = await prisma.cashDesk.findFirst({
    where: { id: cashDeskId, tenant_id: tenantId },
    select: { id: true }
  });
  if (!desk) throw new Error("CashDeskNotFound");
  const existing = await prisma.cashDeskShift.findFirst({
    where: { tenant_id: tenantId, cash_desk_id: cashDeskId, closed_at: null }
  });
  if (existing) throw new Error("ShiftAlreadyOpen");
  const user = await prisma.user.findFirst({
    where: { id: userId, tenant_id: tenantId },
    select: { id: true }
  });
  if (!user) throw new Error("UserNotFound");
  const shift = await prisma.cashDeskShift.create({
    data: {
      tenant_id: tenantId,
      cash_desk_id: cashDeskId,
      opened_by_user_id: userId,
      opening_float:
        body.opening_float != null && Number.isFinite(body.opening_float)
          ? new Prisma.Decimal(body.opening_float)
          : null,
      notes: body.notes?.trim() || null
    },
    include: {
      opened_by: { select: { id: true, name: true, login: true } },
      closed_by: { select: { id: true, name: true, login: true } }
    }
  });
  await prisma.cashDesk.update({
    where: { id: cashDeskId },
    data: { is_closed: false }
  });
  return serializeShift(shift);
}

export async function closeShift(
  tenantId: number,
  cashDeskId: number,
  shiftId: number,
  userId: number,
  body: { closing_float?: number | null; notes?: string | null }
) {
  const shift = await prisma.cashDeskShift.findFirst({
    where: { id: shiftId, tenant_id: tenantId, cash_desk_id: cashDeskId }
  });
  if (!shift) throw new Error("ShiftNotFound");
  if (shift.closed_at) throw new Error("ShiftAlreadyClosed");
  const user = await prisma.user.findFirst({
    where: { id: userId, tenant_id: tenantId },
    select: { id: true }
  });
  if (!user) throw new Error("UserNotFound");
  const updated = await prisma.cashDeskShift.update({
    where: { id: shiftId },
    data: {
      closed_at: new Date(),
      closed_by_user_id: userId,
      closing_float:
        body.closing_float != null && Number.isFinite(body.closing_float)
          ? new Prisma.Decimal(body.closing_float)
          : null,
      notes: body.notes !== undefined ? body.notes?.trim() || null : shift.notes
    },
    include: {
      opened_by: { select: { id: true, name: true, login: true } },
      closed_by: { select: { id: true, name: true, login: true } }
    }
  });
  await prisma.cashDesk.update({
    where: { id: cashDeskId },
    data: { is_closed: true }
  });
  return serializeShift(updated);
}
