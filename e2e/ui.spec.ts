import { expect, test } from "@playwright/test";

// Runs against a fresh in-memory standalone server (see playwright.config.ts).
// Serial: the journey builds on its own state (memory storage persists per server).
test.describe.configure({ mode: "serial" });

test("loads the dashboard shell", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("@xtandard/flags", { exact: false }).first()).toBeVisible();
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

test("rolls back to a previous snapshot", async ({ page }) => {
  await page.goto("/");

  // Create a second flag and publish → v2 (so v1 becomes rollback-able).
  await page.getByRole("button", { name: "New flag" }).click();
  await page.getByPlaceholder("my.feature-flag_v2").fill("e2e-second");
  await page.getByRole("button", { name: "Continue to editor" }).click();
  await page.getByRole("button", { name: "Create flag" }).click();
  await expect(page.getByText("e2e-second")).toBeVisible();

  await page.getByRole("button", { name: "Publish" }).first().click();
  await expect(page.getByText("Publish flags")).toBeVisible();
  await page.getByRole("button", { name: "Publish", exact: true }).last().click();
  await expect(page.getByText("Published successfully")).toBeVisible();

  // Snapshots → roll back v1 (the only non-active row).
  await page.getByText("Snapshots", { exact: true }).first().click();
  await expect(page.getByRole("cell", { name: /v2\s+active/ })).toBeVisible();
  await page.getByRole("button", { name: "Roll back", exact: true }).first().click();
  await page.getByRole("button", { name: "Roll back to this version" }).click();
  await page.getByRole("button", { name: "Confirm rollback" }).click();

  await expect(page.getByText("Rolled back to version v1")).toBeVisible();
  await expect(page.getByRole("cell", { name: /v1\s+active/ })).toBeVisible();
});

test("creates a reusable segment through the builder", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Segments" }).click();
  await page.getByRole("button", { name: /New segment/ }).click();

  await page.getByPlaceholder("eu-beta-users").fill("e2e-eu");
  // First condition row: attribute + value.
  await page.getByPlaceholder("attribute").first().fill("country");
  await page.getByPlaceholder("value").first().fill("FR");
  await page.getByRole("button", { name: "Save" }).click();

  // Appears in the segment list.
  await expect(page.getByText("e2e-eu")).toBeVisible();
});

test("creates a project from the creatable combobox", async ({ page }) => {
  await page.goto("/");
  // Open the Project switcher, type a new key, pick the "Create" item.
  await page.getByLabel("Project").click();
  await page.getByPlaceholder(/Search or create/).fill("mobile");
  await page.getByText('Create project "mobile"').click();
  // The trigger now reflects the newly-created, auto-selected project.
  await expect(page.getByLabel("Project")).toHaveText(/mobile/);
});

test("routes views and flags in the URL (deep-linkable)", async ({ page }) => {
  await page.goto("/");
  // Tab navigation reflects in the path.
  await page.getByRole("button", { name: "Segments" }).click();
  await expect(page).toHaveURL(/\/segments$/);
  await page.getByRole("button", { name: "Flags" }).click();
  await expect(page).toHaveURL(/\/(\?.*)?$/);

  // Deep-link straight to a flag detail (served by the SPA catch-all on refresh).
  await page.goto("/flags/e2e-checkout");
  await expect(page.getByText("Basics")).toBeVisible();
  await expect(page.getByText("e2e-checkout").first()).toBeVisible();
});

test("matches operator shows the JSON query editor + matcher field", async ({ page }) => {
  await page.goto("/flags/e2e-checkout");
  await expect(page.getByText("Basics")).toBeVisible();

  // Add a targeting rule + condition, then switch the operator to `matches`.
  await page.getByRole("button", { name: "Add rule" }).click();
  await page.getByRole("button", { name: "Add condition" }).first().click();

  const operator = page.getByRole("combobox").filter({ hasText: "equals" }).first();
  await operator.click();
  await page.getByRole("option").filter({ hasText: "matches (query)" }).first().click();

  // The CodeMirror JSON editor + matcher-name field appear.
  await expect(page.locator(".cm-content").first()).toBeVisible();
  const matcher = page.getByPlaceholder("matcher (default)");
  await expect(matcher).toBeVisible();
  await matcher.fill("sift");
  await expect(page.getByText(/JSON query for the .*sift.* matcher/)).toBeVisible();
});

test("theme switcher persists across reloads", async ({ page }) => {
  await page.goto("/");
  const htmlTheme = () => page.evaluate(() => document.documentElement.dataset.theme);

  await page.getByRole("button", { name: "Dark theme" }).click();
  await expect.poll(htmlTheme).toBe("dark");

  await page.reload();
  await expect.poll(htmlTheme).toBe("dark");

  // Restore light for a clean end state.
  await page.getByRole("button", { name: "Light theme" }).click();
  await expect.poll(htmlTheme).toBe("light");
});
