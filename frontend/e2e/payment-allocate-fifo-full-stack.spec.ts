import { expect, test } from "@playwright/test";

/**
 * Seed `test1`: «Asosiy mijoz (seed)» + ochiq zakaz ORD-SEED-001.
 * `E2E_TENANT_SLUG`, `E2E_LOGIN`, `E2E_PASSWORD` — lokal / staging to‘liq stack.
 * CI smoke ga kiritilmagan (`order-create-full-stack` kabi).
 */
test.describe("Payment FIFO allocate full stack (ixtiyoriy)", () => {
  test("login → yangi to‘lov → Zakazlarga → FIFO", async ({ page }) => {
    const slug = process.env.E2E_TENANT_SLUG?.trim();
    const login = process.env.E2E_LOGIN?.trim();
    const password = process.env.E2E_PASSWORD?.trim();
    test.skip(
      !slug || !login || !password,
      "E2E_TENANT_SLUG, E2E_LOGIN, E2E_PASSWORD o‘rnatilmagan"
    );

    await page.goto("/login");
    await page.locator("#slug").fill(slug!);
    await page.locator("#login").fill(login!);
    await page.locator("#password").fill(password!);
    await page.getByRole("button", { name: /войти/i }).click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });

    await page.goto("/payments/new");
    await expect(page.getByRole("heading", { name: /Yangi to‘lov/i })).toBeVisible({
      timeout: 20_000
    });

    const clientSel = page.getByTestId("new-payment-client");
    await expect(clientSel).toBeVisible({ timeout: 30_000 });
    const clientOpt = clientSel.locator("option", { hasText: "Asosiy mijoz (seed)" }).first();
    await expect(clientOpt).toBeAttached({ timeout: 30_000 });
    const clientValue = await clientOpt.getAttribute("value");
    expect(clientValue).toBeTruthy();
    await clientSel.selectOption(clientValue!);

    await page.getByTestId("new-payment-amount").fill("100000");
    await page.getByTestId("new-payment-submit").click();

    await expect(page).toHaveURL(/\/payments/, { timeout: 30_000 });

    await page.getByText("Загрузка…").first().waitFor({ state: "hidden", timeout: 45_000 }).catch(() => {});

    const openBtn = page.getByTestId("payment-open-allocate").first();
    await expect(openBtn).toBeVisible({ timeout: 20_000 });
    await openBtn.click();

    const dialog = page.getByTestId("payment-allocate-dialog");
    await expect(dialog).toBeVisible({ timeout: 15_000 });

    const fifoBtn = dialog.getByTestId("payment-allocate-fifo");
    await expect(fifoBtn).toBeEnabled({ timeout: 25_000 });
    await fifoBtn.click();

    await expect(dialog.getByText("Taqsimlash bajarildi.")).toBeVisible({ timeout: 30_000 });
  });
});
