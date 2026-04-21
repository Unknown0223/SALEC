import { describe, expect, it } from "vitest";
import {
  buildExchangeCreateBody,
  buildExchangePairRows
} from "../components/orders/exchange-order-create-panel";

describe("exchange order create helpers", () => {
  it("buildExchangePairRows merges duplicate order lines", () => {
    const rows = buildExchangePairRows([
      {
        product_id: 1,
        sku: "A",
        name: "A",
        unit: "шт",
        qty: "2",
        price: "10",
        is_bonus: false,
        order_id: 5
      },
      {
        product_id: 1,
        sku: "A",
        name: "A",
        unit: "шт",
        qty: "1",
        price: "10",
        is_bonus: false,
        order_id: 5
      }
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.max).toBe(3);
  });

  it("buildExchangeCreateBody validates minus over max", () => {
    const r = buildExchangeCreateBody({
      sourceOrderIds: [1],
      minusKey: "1-10",
      minusQty: "99",
      plusProductId: "20",
      plusQty: "1",
      pairRows: [{ key: "1-10", order_id: 1, product_id: 10, max: 2, sku: "", name: "" }]
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("minus_over");
  });

  it("buildExchangeCreateBody builds payload", () => {
    const r = buildExchangeCreateBody({
      sourceOrderIds: [3, 1],
      minusKey: "1-10",
      minusQty: "2",
      plusProductId: "20",
      plusQty: "2",
      pairRows: [{ key: "1-10", order_id: 1, product_id: 10, max: 5, sku: "", name: "" }]
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.body.source_order_ids).toEqual([1, 3]);
      expect(r.body.minus_lines).toEqual([{ order_id: 1, product_id: 10, qty: 2 }]);
      expect(r.body.plus_lines).toEqual([{ product_id: 20, qty: 2 }]);
    }
  });
});
