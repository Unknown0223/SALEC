import { expect, test } from "@playwright/test";
import { installFakeAdminSession } from "./fake-session";

test.describe("Dashboard shell (FAZA 10)", () => {
  test("middleware: sd_auth + sessiya — /dashboard qobig‘i", async ({ page, context }) => {
    await installFakeAdminSession(context);

    await page.goto("/dashboard");

    await expect(page.getByRole("heading", { name: "Панель управления" })).toBeVisible({
      timeout: 20_000
    });
    await expect(
      page.getByRole("link", { name: "Новый заказ", exact: true })
    ).toBeVisible();

    const statsError = page.getByText("Не удалось загрузить статистику.");
    const statsOk = page.getByText("Заказов сегодня");
    await Promise.race([
      statsError.waitFor({ state: "visible", timeout: 30_000 }),
      statsOk.waitFor({ state: "visible", timeout: 30_000 })
    ]);
  });
});
