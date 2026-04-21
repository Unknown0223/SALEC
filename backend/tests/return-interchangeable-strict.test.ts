import { beforeEach, describe, expect, it, vi } from "vitest";

const { findMany } = vi.hoisted(() => ({
  findMany: vi.fn()
}));

vi.mock("../src/config/database", () => ({
  prisma: {
    interchangeableGroupProduct: {
      findMany
    }
  }
}));

import { assertReturnProductsInterchangeableStrict } from "../src/modules/products/product-catalog.service";

describe("assertReturnProductsInterchangeableStrict", () => {
  beforeEach(() => {
    findMany.mockReset();
  });

  it("resolves when product is in a group with no price_type constraints", async () => {
    findMany.mockResolvedValue([{ product_id: 10, group: { price_type_links: [] } }]);
    await expect(assertReturnProductsInterchangeableStrict(1, [10], "retail")).resolves.toBeUndefined();
  });

  it("resolves when price_type is listed on the group", async () => {
    findMany.mockResolvedValue([
      { product_id: 10, group: { price_type_links: [{ price_type: "wholesale" }] } }
    ]);
    await expect(assertReturnProductsInterchangeableStrict(1, [10], "wholesale")).resolves.toBeUndefined();
  });

  it("rejects when group has price_types but none match", async () => {
    findMany.mockResolvedValue([
      { product_id: 10, group: { price_type_links: [{ price_type: "wholesale" }] } }
    ]);
    await expect(assertReturnProductsInterchangeableStrict(1, [10], "retail")).rejects.toThrow(
      "RETURN_NOT_INTERCHANGEABLE"
    );
  });

  it("rejects when product has no active group rows", async () => {
    findMany.mockResolvedValue([]);
    await expect(assertReturnProductsInterchangeableStrict(1, [99], "retail")).rejects.toThrow(
      "RETURN_NOT_INTERCHANGEABLE"
    );
  });

  it("succeeds if any linked group allows the price_type (empty links)", async () => {
    findMany.mockResolvedValue([
      { product_id: 10, group: { price_type_links: [{ price_type: "wholesale" }] } },
      { product_id: 10, group: { price_type_links: [] } }
    ]);
    await expect(assertReturnProductsInterchangeableStrict(1, [10], "retail")).resolves.toBeUndefined();
  });

  it("defaults empty price_type to retail", async () => {
    findMany.mockResolvedValue([
      { product_id: 10, group: { price_type_links: [{ price_type: "retail" }] } }
    ]);
    await expect(assertReturnProductsInterchangeableStrict(1, [10], "   ")).resolves.toBeUndefined();
  });
});
