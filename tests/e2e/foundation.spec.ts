import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";

test("shows the accessible Czech login and registration shell", async ({ page }, testInfo) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Rezervace pod kontrolou." })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Vítejte zpět" })).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Přeskočit na obsah" })).toBeFocused();
  await page.getByRole("button", { name: "Založit firmu" }).click();
  await expect(page.getByRole("heading", { name: "Nová firma" })).toBeVisible();
  await expect(page.getByLabel("E-mail")).toBeVisible();
  await expect(page.locator("body")).not.toHaveCSS("overflow-x", "scroll");
  await page.screenshot({ path: testInfo.outputPath("registration-shell.png"), fullPage: true });
});

test("shows safe login and invitation error states", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("E-mail").fill(`missing-${randomUUID().slice(0, 8)}@example.test`);
  await page.getByLabel("Heslo").fill("definitely wrong");
  await page.getByRole("button", { name: "Přihlásit se" }).click();
  await expect(page.getByRole("status")).toContainText("E-mail nebo heslo není správné");

  await page.goto(`/pozvanka/${"invalid-token-".padEnd(40, "x")}`);
  await page.getByLabel("Jméno").fill("Invalid Invite");
  await page.getByLabel("E-mail").fill("invalid-invite@example.test");
  await page.getByLabel("Nové heslo").fill("correct horse battery staple");
  await page.getByRole("button", { name: "Dokončit přístup" }).click();
  await expect(page.getByRole("status")).toContainText("Pozvánka není platná");
});

test("completes owner onboarding, invitation acceptance and role-aware workspace", async ({ page }) => {
  const suffix = randomUUID().slice(0, 8);
  const ownerEmail = `browser-owner-${suffix}@example.test`;
  const staffEmail = `browser-staff-${suffix}@example.test`;
  const password = "correct horse battery staple";

  await page.goto("/");
  await page.getByRole("button", { name: "Založit firmu" }).click();
  await page.getByLabel("Vaše jméno").fill("Browser Owner");
  await page.getByLabel("Název firmy").fill("Browser Studio");
  await page.getByLabel("Adresa firmy").fill(`browser-${suffix}`);
  await page.getByLabel("E-mail").fill(ownerEmail);
  await page.getByLabel("Heslo (min. 12 znaků)").fill(password);
  await page.getByRole("button", { name: "Vytvořit účet majitele" }).click();
  await expect(page.getByRole("status")).toContainText("Účet je vytvořený");

  await page.getByLabel("E-mail").fill(ownerEmail);
  await page.getByLabel("Heslo").fill(password);
  await page.getByRole("button", { name: "Přihlásit se" }).click();
  await expect(page.getByRole("heading", { name: "Browser Studio" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Bezpečnostní audit" })).toBeVisible();

  await page.getByLabel("E-mail").fill(staffEmail);
  await page.getByRole("button", { name: "Vytvořit odkaz" }).click();
  const status = page.getByRole("status");
  await expect(status).toContainText("Pozvánka je vytvořená");
  const invitationUrl = (await status.textContent())?.match(/https?:\/\/\S+/)?.[0];
  expect(invitationUrl).toBeTruthy();

  await page.getByRole("button", { name: "Odhlásit" }).click();
  await page.goto(invitationUrl!);
  await page.getByLabel("Jméno").fill("Browser Staff");
  await page.getByLabel("E-mail").fill(staffEmail);
  await page.getByLabel("Nové heslo").fill(password);
  await page.getByRole("button", { name: "Dokončit přístup" }).click();
  await expect(page.getByRole("status")).toContainText("Pozvánka byla přijata");

  await page.goto("/");
  await page.getByLabel("E-mail").fill(staffEmail);
  await page.getByLabel("Heslo").fill(password);
  await page.getByRole("button", { name: "Přihlásit se" }).click();
  await expect(page.getByRole("heading", { name: "Browser Studio" })).toBeVisible();
  await expect(page.getByText("Browser Staff")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Bezpečnostní audit" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Vytvořit odkaz" })).toHaveCount(0);
  await page.getByRole("button", { name: "Odhlásit" }).click();
  await expect(page.getByRole("heading", { name: "Vítejte zpět" })).toBeVisible();
});

test("configures a service, accepts a public booking and lets the customer cancel it", async ({ page }) => {
  const suffix = randomUUID().slice(0, 8);
  const email = `booking-owner-${suffix}@example.test`;
  const password = "correct horse battery staple";
  const slug = `booking-flow-${suffix}`;
  await page.goto("/");
  await page.getByRole("button", { name: "Založit firmu" }).click();
  await page.getByLabel("Vaše jméno").fill("Booking Owner");
  await page.getByLabel("Název firmy").fill("Booking Flow Studio");
  await page.getByLabel("Adresa firmy").fill(slug);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Heslo (min. 12 znaků)").fill(password);
  await page.getByRole("button", { name: "Vytvořit účet majitele" }).click();
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Heslo").fill(password);
  await page.getByRole("button", { name: "Přihlásit se" }).click();

  const serviceForm = page.locator("form.service-form");
  await serviceForm.getByLabel("Název").fill("Strategická konzultace");
  await serviceForm.getByLabel("Popis").fill("Hodinová konzultace nad produktem.");
  await serviceForm.getByLabel("Cena (Kč)").fill("1490");
  await serviceForm.getByRole("button", { name: "Přidat službu" }).click();
  await expect(page.getByRole("status")).toContainText("Služba byla zveřejněna");

  await page.getByRole("button", { name: "Uložit pracovní dobu" }).click();
  await expect(page.getByRole("status")).toContainText("Pracovní doba byla uložena");

  const candidate = new Date(Date.now() + 86_400_000);
  while (candidate.getDay() === 0 || candidate.getDay() === 6) candidate.setDate(candidate.getDate() + 1);
  const date = `${candidate.getFullYear()}-${String(candidate.getMonth() + 1).padStart(2, "0")}-${String(candidate.getDate()).padStart(2, "0")}`;
  await page.goto(`/rezervace/${slug}`);
  await expect(page.getByRole("heading", { name: "Booking Flow Studio" })).toBeVisible();
  await page.getByLabel("Datum").fill(date);
  const slot = page.locator(".slot-picker button").first();
  await expect(slot).toBeVisible();
  await slot.click();
  await page.getByLabel("Jméno").fill("Eva Zákaznice");
  await page.getByLabel("E-mail").fill(`customer-${suffix}@example.test`);
  await page.getByRole("button", { name: "Závazně rezervovat" }).click();
  await expect(page.getByRole("heading", { name: "Termín je váš." })).toBeVisible();
  await expect(page.getByText("Potvrzovací kód")).toBeVisible();
  await page.getByRole("link", { name: "Odkaz pro zrušení rezervace" }).click();
  await page.getByRole("button", { name: "Zrušit rezervaci" }).click();
  await expect(page.getByRole("heading", { name: "Rezervace je zrušena." })).toBeVisible();
});
