import { expect, test } from "@playwright/test";

/**
 * To‘liq login faqat backend (`4000`) va `next dev` (rewrite) bilan ishlaydi.
 * CI dagi `next start` da `/auth` proxy yo‘q — shuning uchun bu test sukutda o‘tkaziladi.
 */
test.describe("Login full stack (ixtiyoriy)", () => {
  test("slug + login + parol → dashboard", async ({ page }) => {
    const slug = process.env.E2E_TENANT_SLUG?.trim();
    const login = process.env.E2E_LOGIN?.trim();
    const password = process.env.E2E_PASSWORD?.trim();
    test.skip(
      !slug || !login || !password,
      "E2E_TENANT_SLUG, E2E_LOGIN, E2E_PASSWORD o‘rnatilmagan (faqat lokal to‘liq stack)"
    );

    await page.goto("/login");
    await page.locator("#slug").fill(slug!);
    await page.locator("#login").fill(login!);
    await page.locator("#password").fill(password!);
    await page.getByRole("button", { name: /войти/i }).click();

    await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
    await expect(page.getByRole("heading", { name: "Панель управления" })).toBeVisible({
      timeout: 20_000
    });
  });
});
