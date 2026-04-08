import { expect, test } from "@playwright/test";

test.describe("Login smoke (FAZA 10)", () => {
  test("kirish sahifasi formasi ko‘rinadi", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Вход" })).toBeVisible();
    await expect(page.locator("#slug")).toBeVisible();
    await expect(page.locator("#login")).toBeVisible();
    await expect(page.locator("#password")).toBeVisible();
    await expect(page.getByRole("button", { name: /войти/i })).toBeVisible();
  });
});
