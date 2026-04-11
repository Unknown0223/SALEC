import { expect, test } from "@playwright/test";
import { installFakeAdminSession } from "./fake-session";

/**
 * FAZA 10 — «holat / taqsimlash» yengil regressiya (fake sessiya; API bo‘lmasa to‘lov testi skip).
 */
test.describe("Payment allocate + order status filter (FAZA 10)", () => {
  test.beforeEach(async ({ context }) => {
    await installFakeAdminSession(context);
  });

  test("Zakazlar: status filtri URLda status= qo‘shadi", async ({ page }) => {
    await page.goto("/orders");
    await expect(page).not.toHaveURL(/\/login$/);
    await page.getByRole("heading", { name: "Заявки" }).waitFor({ state: "visible", timeout: 30_000 });
    const sel = page.getByTestId("orders-filter-status");
    await sel.waitFor({ state: "visible", timeout: 20_000 });
    await sel.selectOption({ index: 1 });
    await expect(page).toHaveURL(/status=.+/);
  });

  test("To‘lovlar: «Zakazlarga» dialog ochiladi va yopiladi", async ({ page }) => {
    await page.goto("/payments");
    await expect(page).not.toHaveURL(/\/login$/);
    await page.locator("h1").first().waitFor({ state: "visible", timeout: 30_000 });
    const loading = page.getByText("Загрузка…").first();
    await loading.waitFor({ state: "hidden", timeout: 45_000 }).catch(() => {});

    const openBtn = page.getByTestId("payment-open-allocate").first();
    if ((await openBtn.count()) === 0) {
      test.skip(true, "To‘lov qatorlari yo‘q (bo‘sh ro‘yxat yoki API)");
      return;
    }

    await openBtn.click();
    const dialog = page.getByTestId("payment-allocate-dialog");
    await expect(dialog).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("heading", { name: /Распределение платежа|To‘lovni zakazlarga/i })).toBeVisible();
    await dialog.getByRole("button", { name: /Закрыть|Yopish/ }).click();
    await expect(dialog).toBeHidden({ timeout: 10_000 });
  });
});
