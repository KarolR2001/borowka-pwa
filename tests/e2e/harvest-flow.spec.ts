import { expect, type Page, test } from "@playwright/test";

const OPERATOR_EMAIL = "operator.e2e@example.test";
const ADMIN_EMAIL = "admin.e2e@example.test";
const E2E_PASSWORD = "test12345";

test.describe("Seeded harvest flow", () => {
  test("keeps the operator dashboard usable on a narrow viewport", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");

    await loginAs(page, OPERATOR_EMAIL, "Operator E2E");
    await page.getByRole("button", { name: "Otwórz menu" }).click();
    const mainMenu = page.getByRole("navigation", { name: "Menu główne" });
    await expect(mainMenu).toBeVisible();
    await expect(mainMenu.getByRole("button", { name: "Zbiory" })).toBeVisible();
    await expect(mainMenu.getByRole("button", { name: "Konto" })).toBeVisible();
    await page.getByRole("button", { name: "Zamknij menu" }).click();
    await page.getByRole("tab", { name: "Pulpit" }).click();

    const operatorDashboard = page.locator(".operator-dashboard");
    await expect(operatorDashboard).toBeVisible();
    await expect(
      operatorDashboard.getByRole("button", { name: "Nowy zbiór" })
    ).toBeVisible();
    await expect(operatorDashboard.getByText("Dostępne kilogramy")).toBeVisible();
    await expect(operatorDashboard.getByText("Otwarte sesje")).toHaveCount(0);
    await expect(operatorDashboard.getByText("Lokalnie oczekujące")).toHaveCount(0);
    await expect(operatorDashboard.getByText(/moje konflikty/i)).toHaveCount(0);
    await operatorDashboard.getByText("Zakres dat", { exact: true }).click();
    await expect(
      operatorDashboard.getByRole("button", { name: "Cały sezon" })
    ).toHaveAttribute("aria-pressed", "true");
    await operatorDashboard.getByRole("button", { name: "Własny zakres" }).click();
    await operatorDashboard.locator("#operator-dashboard-period-from").fill("2026-07-17");
    await operatorDashboard.locator("#operator-dashboard-period-to").fill("2026-07-17");
    await expect(operatorDashboard.getByText("Własny zakres: 17.07.2026")).toBeVisible();
    await operatorDashboard.getByRole("button", { name: "Nowy zbiór" }).click();
    const openSessionDialog = page.getByRole("dialog", {
      name: "Otwieranie sesji zbioru"
    });
    await expect(openSessionDialog).toBeVisible();
    expect(
      await openSessionDialog.evaluate(
        (element) => element.scrollWidth - element.clientWidth
      )
    ).toBeLessThanOrEqual(0);
    await page.getByRole("button", { name: "Zamknij formularz sesji" }).click();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    ).toBeLessThanOrEqual(0);
  });

  test("runs operator session flow and admin correction actions", async ({ page }) => {
    page.on("dialog", async (dialog) => {
      await dialog.accept();
    });

    await page.goto("/");

    await loginAs(page, OPERATOR_EMAIL, "Operator E2E");

    await page.getByRole("button", { name: "Otwórz nową sesję" }).click();
    await expect(
      page.getByRole("dialog", { name: "Otwieranie sesji zbioru" })
    ).toHaveClass(/record-dialog--fullscreen/);
    const openSessionForm = page.getByRole("form", {
      name: "Otwieranie sesji zbioru"
    });
    await expect(openSessionForm).toBeVisible();
    await expect(page.getByLabel("Zbieracz")).toBeEnabled();
    await page.getByLabel("Data").fill("2026-07-17");
    await page.getByRole("button", { name: "Otwórz sesję" }).click();

    await expect(page.getByText("Otworzono sesje dla Anna Test.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Anna Test" })).toBeVisible();

    await page.getByRole("button", { name: "Dodaj wpis" }).click();
    await expect(
      page.getByRole("form", { name: "Formularz wpisu za kilogram" })
    ).toBeVisible();

    for (let entryNumber = 1; entryNumber <= 10; entryNumber += 1) {
      if (entryNumber > 1) {
        await page.getByRole("button", { name: "Dodaj wpis" }).click();
      }
      await page.getByLabel("Waga kg").fill("1,000");
      await page.getByRole("button", { name: "Zapisz wpis" }).click();
      await expect(
        page.getByRole("dialog", { name: "Dodawanie wpisu zbioru" })
      ).toHaveCount(0);
      await expect(
        page.getByText(`#${String(entryNumber)}`, { exact: true }).first()
      ).toBeVisible();
    }

    await expect(page.getByText("10,000 kg")).toBeVisible();

    await page.getByRole("button", { name: "Zamknij sesję" }).click();

    await expect(page.getByText("Zamknieto sesje dla Anna Test.")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Brak aktywnej sesji" })
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Dodaj wpis" })).toHaveCount(0);

    await signOut(page);
    await loginAs(page, ADMIN_EMAIL, "Admin E2E");
    await page.getByRole("tab", { name: "Sesje zbiorów" }).click();

    await page.locator("summary").filter({ hasText: "Otwórz ponownie sesję" }).click();
    await expect(
      page.getByRole("form", { name: "Ponowne otwarcie sesji zbioru" })
    ).toBeVisible();
    await page.getByLabel("Powód ponownego otwarcia").fill("Korekta E2E");
    await page.getByRole("button", { name: "Otwórz ponownie" }).click();

    await expect(page.getByText("Ponownie otwarto sesje dla Anna Test.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Anna Test" })).toBeVisible();

    await page
      .getByRole("button", { name: /^Anuluj$/ })
      .first()
      .click();
    await expect(
      page.getByRole("form", { name: "Anulowanie wpisu zbioru" })
    ).toBeVisible();
    await page.getByLabel("Powód anulowania wpisu").fill("Korekta E2E wpisu");
    await page.getByRole("button", { name: "Anuluj wpis" }).click();

    await expect(page.getByText("Anulowano wpis #10.")).toBeVisible();
    await expect(page.getByText("Anulowany")).toBeVisible();

    await page.getByRole("button", { name: "Dodaj wpis" }).click();
    await expect(
      page.getByRole("form", { name: "Formularz wpisu za kilogram" })
    ).toBeVisible();
    await page.getByLabel("Waga kg").fill("1,000");
    await page.getByRole("button", { name: "Zapisz wpis" }).click();
    await expect(
      page.getByRole("dialog", { name: "Dodawanie wpisu zbioru" })
    ).toHaveCount(0);
    await expect(page.getByText("#11", { exact: true }).first()).toBeVisible();

    await page.getByRole("button", { name: "Zamknij sesję" }).click();

    await expect(page.getByText("Zamknieto sesje dla Anna Test.")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Brak aktywnej sesji" })
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Dodaj wpis" })).toHaveCount(0);

    await page.locator("summary").filter({ hasText: "Anuluj sesję" }).click();
    await page.getByLabel("Powód anulowania").fill("Test E2E anulowania");
    await page.getByRole("button", { name: "Anuluj sesję" }).click();

    await expect(page.getByText("Anulowano sesje dla Anna Test.")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Brak aktywnej sesji" })
    ).toBeVisible();
    await expect(page.getByText("Brak otwartych sesji zbioru.")).toBeVisible();
  });
});

async function loginAs(page: Page, email: string, expectedDisplayName: string) {
  await expect(page.getByRole("heading", { name: "Zaloguj się" })).toBeVisible();
  await page.getByLabel("E-mail").fill(email);
  await page.locator('input[autocomplete="current-password"]').fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Zaloguj" }).click();
  await page.waitForLoadState("networkidle");
  await expect(
    page.locator(".topbar").getByText(expectedDisplayName, { exact: true })
  ).toBeVisible({ timeout: 20000 });
}

async function signOut(page: Page) {
  await page.getByRole("button", { name: "Otwórz menu" }).click();
  await page.getByRole("button", { name: "Konto" }).click();
  await page.getByRole("button", { name: "Wyloguj", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Zaloguj się" })).toBeVisible();
}
