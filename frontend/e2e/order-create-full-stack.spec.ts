import { expect, test } from "@playwright/test";

/**
 * Seed `test1`: klient «Asosiy mijoz (seed)», ombor «Asosiy ombor», qoldiq + retail narx.
 * Faqat backend + Next (proxy) bilan; CI `next start` da `/api` bo‘lmasa login ham o‘tmaydi.
 */
test.describe("Order create full stack (ixtiyoriy)", () => {
  test("login → yangi zakaz → Yaratish → /orders", async ({ page }) => {
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

    await page.goto("/orders/new");
    await expect(page.getByRole("heading", { name: "Yangi zakaz" })).toBeVisible({
      timeout: 20_000
    });

    const clientSel = page.getByTestId("order-create-client");
    await expect(clientSel.locator("option").nth(1)).toBeAttached({ timeout: 30_000 });
    const clientOpt = clientSel.locator("option", { hasText: "Asosiy mijoz (seed)" }).first();
    await expect(clientOpt).toBeAttached();
    const clientValue = await clientOpt.getAttribute("value");
    expect(clientValue).toBeTruthy();
    await clientSel.selectOption(clientValue!);

    const whSel = page.getByTestId("order-create-warehouse");
    await expect(whSel).toBeEnabled({ timeout: 15_000 });
    await whSel.selectOption({ label: "Asosiy ombor" });

    const qtyFirst = page.getByTestId("oc-line-qty").first();
    await expect(qtyFirst).toBeVisible({ timeout: 30_000 });
    await expect(qtyFirst).toBeEnabled();
    await qtyFirst.fill("1");

    await page.getByTestId("order-create-submit").click();

    await expect(page).toHaveURL(/\/orders(\?|$)/, { timeout: 30_000 });
  });
});
