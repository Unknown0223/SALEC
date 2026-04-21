import { test, expect } from "@playwright/test";

test.describe("exchange order create page", () => {
  test("shows linked exchange heading", async ({ page }) => {
    await page.goto("/orders/new?type=exchange");
    await expect(page.getByRole("heading", { name: /Обмен/i })).toBeVisible({ timeout: 15_000 });
  });
});
