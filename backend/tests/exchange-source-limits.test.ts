import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getClientReturnsData: vi.fn(),
  orderFindMany: vi.fn()
}));

vi.mock("../src/modules/returns/returns-enhanced.service", () => ({
  getClientReturnsData: (...args: unknown[]) => mocks.getClientReturnsData(...args)
}));

vi.mock("../src/config/database", () => ({
  prisma: {
    order: {
      findMany: (...args: unknown[]) => mocks.orderFindMany(...args)
    }
  }
}));

import {
  computeExchangeMinusRemainingByKey,
  validateExchangeMinusAgainstSourceOrders
} from "../src/modules/orders/exchange-source-limits.service";

describe("exchange source limits (getClientReturnsData contract)", () => {
  beforeEach(() => {
    mocks.getClientReturnsData.mockReset();
    mocks.orderFindMany.mockReset();
  });

  it("validateExchangeMinusAgainstSourceOrders passes orderIds as 6th argument to getClientReturnsData", async () => {
    mocks.orderFindMany.mockResolvedValue([]);
    mocks.getClientReturnsData.mockResolvedValue({
      items: [
        {
          product_id: 1,
          sku: "x",
          name: "x",
          unit: "шт",
          qty: "10",
          price: "1",
          total: "10",
          is_bonus: false,
          order_id: 100,
          order_number: "N"
        }
      ],
      polki_scope: "order",
      orders: [],
      total_orders: 1,
      total_returned_qty: "0",
      total_paid_value: "0",
      already_returned_value: "0",
      max_returnable_value: "0",
      client_balance: "0",
      client_debt: "0"
    });

    await validateExchangeMinusAgainstSourceOrders(1, 1, [100, 200], [
      { order_id: 100, product_id: 1, qty: 3 }
    ]);

    expect(mocks.getClientReturnsData).toHaveBeenCalledTimes(1);
    expect(mocks.getClientReturnsData).toHaveBeenCalledWith(
      1,
      1,
      undefined,
      undefined,
      undefined,
      [100, 200],
      { shrinkLineQtyAfterReturns: true }
    );
  });

  it("computeExchangeMinusRemainingByKey subtracts prior exchange from shrunk qty", async () => {
    mocks.getClientReturnsData.mockResolvedValue({
      items: [
        {
          product_id: 2,
          sku: "y",
          name: "y",
          unit: "шт",
          qty: "10",
          price: "1",
          total: "10",
          is_bonus: false,
          order_id: 50,
          order_number: "A"
        }
      ],
      polki_scope: "order",
      orders: [],
      total_orders: 1,
      total_returned_qty: "0",
      total_paid_value: "0",
      already_returned_value: "0",
      max_returnable_value: "0",
      client_balance: "0",
      client_debt: "0"
    });

    const prior = new Map<string, number>([["50:2", 4]]);
    const rem = await computeExchangeMinusRemainingByKey(1, 1, [50], prior);
    expect(rem.get("50:2")).toBe(6);
  });
});
