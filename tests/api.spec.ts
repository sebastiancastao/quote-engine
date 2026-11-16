import { test, expect } from "@playwright/test";
import { fixture } from "./fixtures";

test("a separate browser app calculates and saves through CORS, then the workspace opens the saved quote", async ({
  page, request,
}, info) => {
  const token = "test-only-api-key-with-at-least-32-characters";
  const ref = `API-${info.project.name.toUpperCase()}-${Date.now()}`;
  const base = "http://127.0.0.1:3100/api/v1";
  expect((await request.get(`${base}/quotes`)).status()).toBe(401);
  await page.goto("http://127.0.0.1:5173/");

  const result = await page.evaluate(async ({ base, token, input }) => {
    const headers = {
      Authorization: `Bearer ${token}`, "Content-Type": "application/json",
    };
    const catalogResponse = await fetch(`${base}/rates`, { headers });
    const catalog = await catalogResponse.json();
    const pricing = {
      ...catalog.pricingDefaults,
      vehicleClass: "cargo-van", miles: 30, vehicleCapacityLb: 1500,
      fuelPercent: 10, fuelBasis: "transport",
    };
    const rated = await fetch(`${base}/rates/calculate`, {
      method: "POST", headers,
      body: JSON.stringify({
        pricing,
        shipment: { weight: input.weight, start: input.pickupFrom, end: input.deliveryTo },
      }),
    });
    const rate = await rated.json();
    const created = await fetch(`${base}/quotes`, {
      method: "POST", headers, body: JSON.stringify({ ...input, pricing }),
    });
    return {
      catalogStatus: catalogResponse.status, rateStatus: rated.status,
      rate, status: created.status, location: created.headers.get("location"),
      body: await created.json(),
    };
  }, { base, token, input: { ...fixture(ref), pickupFrom: "2026-12-01T15:00:00Z", pickupTo: "2026-12-01T15:30:00Z", deliveryFrom: "2026-12-01T16:00:00Z", deliveryTo: "2026-12-01T17:00:00Z" } });

  expect(result.catalogStatus).toBe(200);
  expect(result.rateStatus).toBe(200);
  expect(result.rate.totalCents).toBe(8459);
  expect(result.status).toBe(201);
  expect(result.location).toBe(`/api/v1/quotes/${ref}`);
  expect(result.body.quote.totalCents).toBe(result.rate.totalCents);
  const updated = await request.patch(`${base}/quotes/${ref}`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { version: result.body.quote.version, notes: "Created by partner API" },
  });
  expect(updated.status()).toBe(200);
  const version = (await updated.json()).quote.version;
  const accepted = await request.post(`${base}/quotes/${ref}/actions`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { version, action: "accept", acceptedBy: "Partner customer" },
  });
  expect(accepted.status()).toBe(200);

  await page.goto("/");
  await expect(page.getByText("Loading your workspace…")).toBeHidden();
  await page.getByRole("textbox", { name: "Search quotes", exact: true }).fill(ref);
  await page.getByRole("button", { name: ref, exact: true }).click();
  const details = page.getByRole("dialog", { name: `Quote ${ref}`, exact: true });
  await expect(details.getByText("$84.59", { exact: true })).toBeVisible();
  await expect(details.getByText("Accepted", { exact: true })).toBeVisible();
  await expect(details.getByText("Created by partner API", { exact: true })).toBeVisible();
});
