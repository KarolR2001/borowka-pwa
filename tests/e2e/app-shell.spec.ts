import { expect, test } from "@playwright/test";

test.describe("Borowka PWA shell", () => {
  test("shows only the login screen to a signed-out user", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { name: "Borówka" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Zaloguj się" })).toBeVisible();
    await expect(page.getByRole("navigation")).toHaveCount(0);
    await expect(page.getByText(/Firebase/i)).toHaveCount(0);
    await expect(page.getByText("Administrator", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Operator", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Zbieracz", { exact: true })).toHaveCount(0);
  });
});
