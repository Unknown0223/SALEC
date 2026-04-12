import { Prisma } from "@prisma/client";
import { prisma } from "../../config/database";

export type DebtorCreditorMonthCell = {
  debit: string;
  credit: string;
  saldo: string;
};

export type DebtorCreditorMonthRow = {
  month_key: string;
  month_label: string;
  this_month: DebtorCreditorMonthCell;
  cumulative: DebtorCreditorMonthCell;
};

function monthLabelRu(year: number, month1: number): string {
  const dt = new Date(Date.UTC(year, month1 - 1, 1));
  const s = dt.toLocaleDateString("ru-RU", { month: "long", year: "numeric" });
  return s.replace(" г.", "").trim();
}

/**
 * Отчёт по месяцам: дебет (сумма заказов + расходы клиента), кредит (оплаты).
 * За месяц — обороты внутри месяца. За весь период — нарастающий итог с начала истории до конца этого месяца.
 */
export async function getClientDebtorCreditorMonthly(
  tenantId: number,
  clientId: number
): Promise<DebtorCreditorMonthRow[]> {
  const client = await prisma.client.findFirst({
    where: { id: clientId, tenant_id: tenantId, merged_into_client_id: null },
    select: { id: true }
  });
  if (!client) {
    throw new Error("NOT_FOUND");
  }

  const excluded = ["cancelled", "returned"] as const;

  const orderRows = await prisma.$queryRaw<Array<{ month_key: string; debit: Prisma.Decimal }>>`
    SELECT to_char(date_trunc('month', o.created_at AT TIME ZONE 'UTC'), 'YYYY-MM') AS month_key,
      SUM(o.total_sum)::decimal(15,2) AS debit
    FROM orders o
    WHERE o.tenant_id = ${tenantId}
      AND o.client_id = ${clientId}
      AND o.status NOT IN (${Prisma.join(excluded)})
      AND o.order_type = 'order'
    GROUP BY 1
  `;

  const payRows = await prisma.$queryRaw<
    Array<{ month_key: string; credit: Prisma.Decimal; expense: Prisma.Decimal }>
  >`
    SELECT to_char(
      date_trunc('month', COALESCE(p.paid_at, p.created_at) AT TIME ZONE 'UTC'),
      'YYYY-MM'
    ) AS month_key,
      SUM(CASE WHEN p.entry_kind = 'payment' THEN p.amount ELSE 0 END)::decimal(15,2) AS credit,
      SUM(CASE WHEN p.entry_kind = 'client_expense' THEN p.amount ELSE 0 END)::decimal(15,2) AS expense
    FROM client_payments p
    WHERE p.tenant_id = ${tenantId}
      AND p.client_id = ${clientId}
      AND p.deleted_at IS NULL
    GROUP BY 1
  `;

  const debitOrders = new Map<string, Prisma.Decimal>();
  for (const r of orderRows) {
    const k = r.month_key;
    const cur = debitOrders.get(k) ?? new Prisma.Decimal(0);
    debitOrders.set(k, cur.add(r.debit ?? new Prisma.Decimal(0)));
  }

  const creditByMonth = new Map<string, Prisma.Decimal>();
  const expenseByMonth = new Map<string, Prisma.Decimal>();
  for (const r of payRows) {
    const k = r.month_key;
    const c = creditByMonth.get(k) ?? new Prisma.Decimal(0);
    creditByMonth.set(k, c.add(r.credit ?? new Prisma.Decimal(0)));
    const e = expenseByMonth.get(k) ?? new Prisma.Decimal(0);
    expenseByMonth.set(k, e.add(r.expense ?? new Prisma.Decimal(0)));
  }

  const allKeys = new Set<string>([...debitOrders.keys(), ...creditByMonth.keys(), ...expenseByMonth.keys()]);
  if (allKeys.size === 0) {
    return [];
  }

  const sortedAsc = [...allKeys].sort((a, b) => a.localeCompare(b));

  let cumDebit = new Prisma.Decimal(0);
  let cumCredit = new Prisma.Decimal(0);

  const outAsc: DebtorCreditorMonthRow[] = [];

  for (const k of sortedAsc) {
    const [ys, ms] = k.split("-");
    const year = Number(ys);
    const month = Number(ms);
    const ord = debitOrders.get(k) ?? new Prisma.Decimal(0);
    const exp = expenseByMonth.get(k) ?? new Prisma.Decimal(0);
    const debitM = ord.add(exp);
    const creditM = creditByMonth.get(k) ?? new Prisma.Decimal(0);
    const saldoM = debitM.sub(creditM);

    cumDebit = cumDebit.add(debitM);
    cumCredit = cumCredit.add(creditM);
    const saldoCum = cumDebit.sub(cumCredit);

    outAsc.push({
      month_key: k,
      month_label: monthLabelRu(year, month),
      this_month: {
        debit: debitM.toString(),
        credit: creditM.toString(),
        saldo: saldoM.toString()
      },
      cumulative: {
        debit: cumDebit.toString(),
        credit: cumCredit.toString(),
        saldo: saldoCum.toString()
      }
    });
  }

  return outAsc.slice().reverse();
}
