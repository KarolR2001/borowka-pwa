import { expect, test } from "@playwright/test";

test.describe("Borowka PWA shell", () => {
  test("opens the app and renders diagnostics in browser", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { name: "Borowka PWA" })).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: "Nawigacja glowna" })
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /logowanie/i })).toBeVisible();

    await page.getByRole("button", { name: /diagnostyka/i }).click();

    await expect(page.getByRole("heading", { name: "Diagnostyka" })).toBeVisible();
    await expect(page.getByText("Wersja aplikacji")).toBeVisible();
    await expect(page.getByText("Identyfikator urzadzenia")).toBeVisible();
    await expect(page.getByText("Service worker")).toBeVisible();
    await expect(page.getByText("Tryb Firebase")).toBeVisible();
  });
});
