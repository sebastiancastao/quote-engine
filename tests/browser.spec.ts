import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";

test("save, reopen by REF, accept, revise and search a quote without pretending Axis is connected", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Quotes.", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Loading your workspace…")).toBeHidden();
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
  expect(await page.evaluate(() => document.documentElement.clientWidth)).toBe(
    page.viewportSize()!.width,
  );
  mkdirSync(".artifacts", { recursive: true });
  await page.screenshot({
    path: `.artifacts/dashboard-${info.project.name}.png`,
    fullPage: true,
    scale: "css",
  });
  await page.getByRole("button", { name: "New quote", exact: true }).click();
  const editor = page.getByRole("dialog", {
    name: "Create a new quote",
    exact: true,
  });
  const ref = `TEST-${info.project.name.toUpperCase()}-${Date.now()}`;
  await editor.getByLabel("Customer name").fill("Northstar Medical");
  await editor.getByLabel("Customer email").fill("dispatch@example.com");
  await editor.getByLabel("REF number").fill(ref);
  await editor.getByLabel("Xcelerator account number").fill("AC-100");
  const pickup = editor.getByRole("group", { name: "Pickup", exact: true });
  const delivery = editor.getByRole("group", { name: "Delivery", exact: true });
  for (const [group, city, zip] of [
    [pickup, "Newark", "07102"],
    [delivery, "Jersey City", "07302"],
  ] as const) {
    await group.getByLabel("Company / location").fill(`${city} location`);
    await group.getByLabel("Street address").fill("10 Test Street");
    await group.getByLabel("City", { exact: true }).fill(city);
    await group.getByLabel("State", { exact: true }).fill("NJ");
    await group.getByLabel("ZIP", { exact: true }).fill(zip);
  }
  await editor.getByLabel("Pickup window · from").fill("2026-12-01T08:00");
  await editor.getByLabel("Pickup window · to").fill("2026-12-01T09:00");
  await editor.getByLabel("Delivery window · from").fill("2026-12-01T10:00");
  await editor.getByLabel("Delivery window · to").fill("2026-12-01T11:00");
  await editor.getByLabel("Service", { exact: true }).fill("Same Day");
  await editor.getByLabel("Vehicle", { exact: true }).fill("Cargo Van");
  await editor.getByLabel("Charge 1 rate", { exact: true }).fill("129.95");
  await editor.getByRole("button", { name: "Save quote", exact: true }).click();
  let details = page.getByRole("dialog", { name: `Quote ${ref}`, exact: true });
  await expect(details).toBeVisible();
  await expect(
    details.getByText("$129.95", { exact: true }).first(),
  ).toBeVisible();
  await page.reload();
  details = page.getByRole("dialog", { name: `Quote ${ref}`, exact: true });
  await expect(details).toBeVisible();
  await details
    .getByRole("button", { name: "Mark as sent", exact: true })
    .click();
  await expect(
    details.getByText("Awaiting response", { exact: true }),
  ).toBeVisible();
  await details
    .getByRole("button", { name: "Record acceptance", exact: true })
    .click();
  await details.getByLabel("Accepted by").fill("Alex Smith");
  await details
    .getByRole("button", { name: "Confirm acceptance", exact: true })
    .click();
  await expect(details.getByText("Accepted", { exact: true })).toBeVisible();
  await expect(
    details.getByRole("button", { name: "Set up Axis to submit", exact: true }),
  ).toBeVisible();
  const accepted = (await (await page.request.get(`/api/quotes/${ref}`)).json())
    .quote;
  const blocked = await page.request.post(`/api/quotes/${ref}`, {
    data: { action: "submit", version: accepted.version, confirm: true },
  });
  expect(blocked.status()).toBe(503);
  const preserved = (
    await (await page.request.get(`/api/quotes/${ref}`)).json()
  ).quote;
  expect(preserved.status).toBe("accepted");
  expect(preserved.orderTrackingId).toBeUndefined();
  await details
    .getByRole("button", { name: "Revise quote", exact: true })
    .click();
  await details
    .getByRole("button", { name: "Reopen & edit", exact: true })
    .click();
  const edit = page.getByRole("dialog", { name: `Edit ${ref}`, exact: true });
  await expect(edit).toBeVisible();
  await edit.getByLabel("Charge 1 rate", { exact: true }).fill("149.95");
  await edit.getByRole("button", { name: "Save changes", exact: true }).click();
  details = page.getByRole("dialog", { name: `Quote ${ref}`, exact: true });
  await expect(details.getByText("Draft", { exact: true })).toBeVisible();
  await expect(
    details.getByText("$149.95", { exact: true }).first(),
  ).toBeVisible();
  await details
    .getByRole("button", { name: "Close quote details", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Search quotes", exact: true })
    .fill(ref);
  await expect(
    page.getByRole("button", { name: ref, exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Integrations", exact: true }).click();
  await expect(
    page.getByText("Your Axis connection is not set up yet", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Test connection", exact: true }),
  ).toBeDisabled();
  expect(errors).toEqual([]);
});
