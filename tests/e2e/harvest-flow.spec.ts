import { expect, type Page, test } from "@playwright/test";

const OPERATOR_EMAIL = "operator.e2e@example.test";
const ADMIN_EMAIL = "admin.e2e@example.test";
const E2E_PASSWORD = "test12345";

test.describe("Seeded harvest flow", () => {
  test("runs operator session flow and admin correction actions", async ({ page }) => {
    page.on("dialog", async (dialog) => {
      await dialog.accept();
    });

    await page.goto("/");

    await loginAs(page, OPERATOR_EMAIL, "Operator E2E");
    await page.getByRole("button", { name: "Operator" }).click();

    await expect(
      page.getByRole("form", { name: "Otwieranie sesji zbioru" })
    ).toBeVisible();
    await page.getByLabel("Data").fill("2026-07-17");
    await page.getByRole("button", { name: "Otworz sesje" }).click();

    await expect(page.getByText("Otworzono sesje dla Anna Test.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Anna Test" })).toBeVisible();

    await page.getByRole("button", { name: "Dodaj wpis" }).click();
    await expect(
      page.getByRole("form", { name: "Formularz wpisu za kilogram" })
    ).toBeVisible();

    for (let entryNumber = 1; entryNumber <= 10; entryNumber += 1) {
      await page.getByLabel("Waga kg").fill("1,000");
      await page.getByRole("button", { name: "Zapisz wpis" }).click();
      await expect(page.getByText("Wpis wagowy dodany lokalnie.")).toBeVisible();
      await expect(
        page.getByText(`#${String(entryNumber)}`, { exact: true }).first()
      ).toBeVisible();
    }

    await expect(page.getByText("10 kilogram")).toBeVisible();
    await expect(page.getByText("10,000 kg")).toBeVisible();

    await page.getByRole("button", { name: "Zamknij sesje" }).click();

    await expect(page.getByText("Zamknieto sesje dla Anna Test.")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Brak aktywnej sesji" })
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Dodaj wpis" })).toHaveCount(0);

    await signOut(page);
    await loginAs(page, ADMIN_EMAIL, "Admin E2E");
    await page.getByRole("button", { name: "Operator" }).click();

    await expect(
      page.getByRole("form", { name: "Ponowne otwarcie sesji zbioru" })
    ).toBeVisible();
    await page.getByLabel("Powod ponownego otwarcia").fill("Korekta E2E");
    await page.getByRole("button", { name: "Otworz ponownie" }).click();

    await expect(page.getByText("Ponownie otwarto sesje dla Anna Test.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Anna Test" })).toBeVisible();

    await page
      .getByRole("button", { name: /^Anuluj$/ })
      .first()
      .click();
    await expect(
      page.getByRole("form", { name: "Anulowanie wpisu zbioru" })
    ).toBeVisible();
    await page.getByLabel("Powod anulowania wpisu").fill("Korekta E2E wpisu");
    await page.getByRole("button", { name: "Anuluj wpis" }).click();

    await expect(page.getByText("Anulowano wpis #10.")).toBeVisible();
    await expect(page.getByText("9 kilogram")).toBeVisible();
    await expect(page.getByText("Anulowany")).toBeVisible();

    await page.getByRole("button", { name: "Dodaj wpis" }).click();
    await expect(
      page.getByRole("form", { name: "Formularz wpisu za kilogram" })
    ).toBeVisible();
    await page.getByLabel("Waga kg").fill("1,000");
    await page.getByRole("button", { name: "Zapisz wpis" }).click();
    await expect(page.getByText("Wpis wagowy dodany lokalnie.")).toBeVisible();
    await expect(page.getByText("#11", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("10 kilogram")).toBeVisible();

    await page.getByRole("button", { name: "Zamknij sesje" }).click();

    await expect(page.getByText("Zamknieto sesje dla Anna Test.")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Brak aktywnej sesji" })
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Dodaj wpis" })).toHaveCount(0);

    await page.getByLabel("Powod anulowania").fill("Test E2E anulowania");
    await page.getByRole("button", { name: "Anuluj sesje" }).click();

    await expect(page.getByText("Anulowano sesje dla Anna Test.")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Brak aktywnej sesji" })
    ).toBeVisible();
    await expect(page.getByText("Brak otwartych sesji zbioru.")).toBeVisible();
  });
});

async function loginAs(page: Page, email: string, expectedDisplayName: string) {
  await page.getByRole("button", { name: "Logowanie" }).click();
  await expect(page.getByRole("heading", { name: "Zaloguj sie" })).toBeVisible();
  await page.getByLabel("E-mail").fill(email);
  await page.locator('input[autocomplete="current-password"]').fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Zaloguj" }).click();
  await expect(page.getByRole("heading", { name: expectedDisplayName })).toBeVisible();
}

async function signOut(page: Page) {
  await page.getByRole("button", { name: "Logowanie" }).click();
  await page.getByRole("button", { name: "Wyloguj" }).click();
  await expect(page.getByRole("heading", { name: "Zaloguj sie" })).toBeVisible();
}
