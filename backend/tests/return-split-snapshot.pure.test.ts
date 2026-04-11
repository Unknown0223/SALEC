import { describe, expect, it } from "vitest";
import {
  computeReturnSplitFromOrderSnapshot,
  type OrderItemSummary
} from "../src/modules/returns/returns-enhanced.service";

function row(
  pid: number,
  qty: number,
  opts: { is_bonus?: boolean; price?: number; order_id?: number } = {}
): OrderItemSummary {
  const is_bonus = opts.is_bonus ?? false;
  const price = opts.price ?? 0;
  return {
    product_id: pid,
    sku: `sku-${pid}`,
    name: `p${pid}`,
    unit: "dona",
    qty: String(qty),
    price: String(price),
    total: String(qty * price),
    is_bonus,
    order_id: opts.order_id ?? 1,
    order_number: "T-1"
  };
}

describe("computeReturnSplitFromOrderSnapshot", () => {
  it("avval bonus pool, keyin pullik; refund faqat pullik dona", () => {
    const items: OrderItemSummary[] = [
      row(10, 2, { is_bonus: true, price: 100 }),
      row(10, 5, { is_bonus: false, price: 100 })
    ];
    const { lines, recalc } = computeReturnSplitFromOrderSnapshot(items, [{ product_id: 10, qty: 4 }]);
    expect(lines).toEqual([
      { product_id: 10, qty: 4, paid_qty: 2, bonus_qty: 2, price: 100 }
    ]);
    expect(recalc.bonus_return_qty).toBe(2);
    expect(recalc.paid_return_qty).toBe(2);
    expect(recalc.refund_amount.toString()).toBe("200");
    expect(recalc.original_bonus_qty).toBe(2);
    expect(recalc.remaining_bonus_qty).toBe(0);
  });

  it("ikkinchi qaytarish: qoldiq snapshot (bonus tugagan, faqat pullik)", () => {
    const itemsAfterFirst: OrderItemSummary[] = [row(10, 3, { is_bonus: false, price: 100 })];
    const { lines, recalc } = computeReturnSplitFromOrderSnapshot(itemsAfterFirst, [
      { product_id: 10, qty: 2 }
    ]);
    expect(lines[0]).toMatchObject({ bonus_qty: 0, paid_qty: 2, price: 100 });
    expect(recalc.refund_amount.toString()).toBe("200");
    expect(recalc.bonus_return_qty).toBe(0);
  });

  it("bir mahsulot, ikkita qaytarish qatori — jami bonus to‘g‘ri taqsimlanadi", () => {
    const items: OrderItemSummary[] = [
      row(10, 3, { is_bonus: true, price: 50 }),
      row(10, 5, { is_bonus: false, price: 50 })
    ];
    const { lines, recalc } = computeReturnSplitFromOrderSnapshot(items, [
      { product_id: 10, qty: 4 },
      { product_id: 10, qty: 2 }
    ]);
    expect(lines[0]).toMatchObject({ bonus_qty: 3, paid_qty: 1 });
    expect(lines[1]).toMatchObject({ bonus_qty: 0, paid_qty: 2 });
    expect(recalc.bonus_return_qty).toBe(3);
    expect(recalc.paid_return_qty).toBe(3);
    expect(recalc.refund_amount.toString()).toBe("150");
  });

  it("pullik qatorlar bo‘yicha o‘rtacha narx (bir xil mahsulot)", () => {
    const items: OrderItemSummary[] = [
      row(7, 1, { is_bonus: false, price: 10 }),
      row(7, 2, { is_bonus: false, price: 20 })
    ];
    const { recalc } = computeReturnSplitFromOrderSnapshot(items, [{ product_id: 7, qty: 3 }]);
    expect(Number(recalc.refund_amount)).toBeCloseTo(50, 1);
  });

  it("faqat bonus qoldiq — refund 0", () => {
    const items: OrderItemSummary[] = [row(1, 5, { is_bonus: true, price: 99 })];
    const { lines, recalc } = computeReturnSplitFromOrderSnapshot(items, [{ product_id: 1, qty: 3 }]);
    expect(lines[0]).toMatchObject({ bonus_qty: 3, paid_qty: 0 });
    expect(recalc.refund_amount.toString()).toBe("0");
  });
});
