import { expect, test } from "@playwright/test";
import { installFakeAdminSession } from "./fake-session";

/**
 * FAZA 10 — «status / to‘lov» zanjiri uchun engil qobiq:
 * zakazlar va to‘lovlar sahifasi ochiladi, login emas (API bo‘lmasa yuklash/xato holati qabul).
 */
test.describe("Orders & payments shell (FAZA 10)", () => {
  test.beforeEach(async ({ context }) => {
    await installFakeAdminSession(context);
  });

  test("/orders — Заявки qobig‘i", async ({ page }) => {
    await page.goto("/orders");
    await expect(page).not.toHaveURL(/\/login/);

    const heading = page.getByRole("heading", { name: "Заявки" });
    const loading = page.getByText("Загрузка…");
    const listErr = page.getByText(/yuklab/i);
    await Promise.race([
      heading.waitFor({ state: "visible", timeout: 30_000 }),
      loading.waitFor({ state: "visible", timeout: 30_000 }),
      listErr.waitFor({ state: "visible", timeout: 30_000 })
    ]);
  });

  test("/payments — To‘lovlar qobig‘i", async ({ page }) => {
    await page.goto("/payments");
    await expect(page).not.toHaveURL(/\/login/);
    const h1 = page.locator("h1").first();
    await h1.waitFor({ state: "visible", timeout: 30_000 });
    await expect(h1).toContainText(/Оплаты|ловлар/i);
  });
});
