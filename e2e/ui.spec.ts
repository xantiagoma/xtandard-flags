import { expect, test } from "@playwright/test";

// Runs against a fresh in-memory standalone server (see playwright.config.ts).
// Serial: the journey builds on its own state (memory storage persists per server).
test.describe.configure({ mode: "serial" });

test("loads the dashboard shell", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Xtandard", { exact: false }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "New flag" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Publish" })).toBeVisible();
});

test("creates a boolean flag through the editor", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New flag" }).click();

  // Create modal.
  await expect(page.getByText("Choose a unique key and type")).toBeVisible();
  await page.getByPlaceholder("my.feature-flag_v2").fill("e2e-checkout");
  await page.getByRole("button", { name: "Continue to editor" }).click();

  // Flag editor drawer → create.
  await page.getByRole("button", { name: "Create flag" }).click();

  // Appears in the list.
  await expect(page.getByText("e2e-checkout")).toBeVisible();
});

test("publishes a snapshot and shows it in history", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("e2e-checkout")).toBeVisible();

  await page.getByRole("button", { name: "Publish" }).first().click();
  await expect(page.getByText("Publish flags")).toBeVisible();
  await page.getByPlaceholder("Describe what changed…").fill("e2e first publish");
  // The dialog's confirm is the last "Publish" button in the DOM.
  await page.getByRole("button", { name: "Publish", exact: true }).last().click();

  // Confirm publish succeeded before navigating.
  await expect(page.getByText("Published successfully")).toBeVisible();

  // Navigate to snapshots and see the active v1.
  await page.getByText("Snapshots", { exact: true }).first().click();
  await expect(page.getByText("e2e first publish")).toBeVisible();
  await expect(page.getByRole("cell", { name: /v1\s+active/ })).toBeVisible();
});
