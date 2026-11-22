import { expect, test } from "@playwright/test";

test("Landing page, demo login, DataTables, drawers, reports, and system health", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByText("API ONLINE · DB OK")).toBeVisible({ timeout: 15_000 });

  // Launch Demo Workspace directly from landing page
  await page.getByRole("button", { name: "Launch Demo Workspace" }).click();
  await page.waitForURL("**/dashboard");
  await expect(page.getByRole("heading", { name: "Kilimani Estates" })).toBeVisible();

  // Properties DataTable & summary drawer
  await page.getByRole("link", { name: "Properties" }).click();
  await page.waitForURL("**/properties");
  await expect(page.getByText("Showing")).toBeVisible();
  await expect(page.getByRole("link", { name: "Kilimani Heights" }).first()).toBeVisible();

  // Tenants DataTable + Running Ledger drawer
  await page.getByRole("link", { name: "Tenants" }).click();
  await page.waitForURL("**/tenants");
  const createTenantBtn = page.getByRole("button", { name: "+ Add Tenant" });
  await createTenantBtn.click();
  const uniquePhone = `+2547${Math.floor(10000000 + Math.random() * 89999999)}`;
  await page.getByPlaceholder("Grace Muthoni").fill("E2E Test Tenant");
  await page.getByPlaceholder("+254712345678").fill(uniquePhone);
  await page.getByRole("button", { name: "Save Tenant" }).click();
  await expect(page.getByText("E2E Test Tenant").first()).toBeVisible();
  await page.getByText("E2E Test Tenant").first().click();
  await expect(page.getByText("Net Balance")).toBeVisible();
  await page.getByRole("button", { name: "Close" }).first().click();

  // Utility Meters page
  await page.getByRole("link", { name: "Utility Meters" }).click();
  await page.waitForURL("**/meters");
  await expect(
    page.getByRole("heading", { name: "Water & Utility Meter Readings" })
  ).toBeVisible();

  // Owner & KRA Reports page
  await page.getByRole("link", { name: "Owner & KRA Reports" }).click();
  await page.waitForURL("**/reports");
  await expect(page.getByText("KRA Tax Readiness")).toBeVisible();

  // System & Readiness page
  await page.getByRole("link", { name: "System & Readiness" }).click();
  await page.waitForURL("**/system");
  await expect(page.getByText("DB OK")).toBeVisible();
});
