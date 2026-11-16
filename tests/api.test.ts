import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as quotes from "../src/app/api/v1/quotes/route";
import * as detail from "../src/app/api/v1/quotes/[ref]/route";
import * as actions from "../src/app/api/v1/quotes/[ref]/actions/route";
import * as rates from "../src/app/api/v1/rates/route";
import * as calculate from "../src/app/api/v1/rates/calculate/route";
import { getQuoteStore } from "../src/lib/quote-store";
import { fixture } from "./fixtures";

const token = "test-only-api-key-with-at-least-32-characters";
const origin = "https://dispatch.example.com";
const directory = mkdtempSync(join(tmpdir(), "quote-api-"));
const saved = {
  QUOTE_API_KEY: process.env.QUOTE_API_KEY,
  QUOTE_API_ALLOWED_ORIGINS: process.env.QUOTE_API_ALLOWED_ORIGINS,
  QUOTE_DB_PATH: process.env.QUOTE_DB_PATH,
};

before(() => {
  process.env.QUOTE_API_KEY = token;
  process.env.QUOTE_API_ALLOWED_ORIGINS = origin;
  process.env.QUOTE_DB_PATH = join(directory, "quotes.sqlite");
});

after(() => {
  getQuoteStore().close();
  for (const [name, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  rmSync(directory, { recursive: true, force: true });
});

function request(path: string, method = "GET", body?: unknown, extra?: HeadersInit) {
  const headers = new Headers(extra);
  if (!headers.has("authorization"))
    headers.set("authorization", `Bearer ${token}`);
  if (body !== undefined) headers.set("Content-Type", "application/json");
  return new Request(`http://localhost/api/v1/${path}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

const context = (ref: string) => ({ params: Promise.resolve({ ref }) });

test("external API fails closed when disabled, and authenticates every data handler before work", async () => {
  for (const key of ["", "too-short"]) {
    process.env.QUOTE_API_KEY = key;
    assert.equal((await quotes.GET(request("quotes"))).status, 503);
  }
  process.env.QUOTE_API_KEY = token;
  const endpoints = [
    () => quotes.GET(request("quotes", "GET", undefined, { authorization: "" })),
    () => quotes.POST(request("quotes", "POST", fixture(), { authorization: "Bearer wrong" })),
    () => detail.GET(request("quotes/REF", "GET", undefined, { authorization: "" }), context("REF")),
    () => detail.PATCH(request("quotes/REF", "PATCH", { version: 1 }, { authorization: "" }), context("REF")),
    () => actions.POST(request("quotes/REF/actions", "POST", { action: "submit", version: 1, confirm: true }, { authorization: "" }), context("REF")),
    () => rates.GET(request("rates", "GET", undefined, { authorization: "" })),
    () => calculate.POST(request("rates/calculate", "POST", {}, { authorization: "" })),
  ];
  for (const endpoint of endpoints) {
    const response = await endpoint();
    assert.equal(response.status, 401);
    assert.match(response.headers.get("www-authenticate") || "", /Bearer/);
    assert.equal(response.headers.get("cache-control"), "no-store");
  }
  assert.equal(getQuoteStore().list().length, 0);
  assert.equal((await quotes.GET(request("quotes", "GET", undefined, { authorization: `bEaReR ${token}` }))).status, 200);
});

test("browser preflight allows only configured origins, supported methods, and supported headers", async () => {
  for (const [endpoint, method] of [
    [quotes.OPTIONS, "POST"], [detail.OPTIONS, "PATCH"], [actions.OPTIONS, "POST"],
    [rates.OPTIONS, "GET"], [calculate.OPTIONS, "POST"],
  ] as const) {
    const response = await endpoint(request("quotes", "OPTIONS", undefined, {
      authorization: "", origin,
      "access-control-request-method": method,
      "access-control-request-headers": "authorization, content-type",
    }));
    assert.equal(response.status, 204);
    assert.equal(response.headers.get("access-control-allow-origin"), origin);
    assert.ok(response.headers.get("access-control-allow-methods")?.includes(method));
  }
  for (const blocked of ["https://evil.example", `${origin}.evil.example`, "null"]) {
    const response = await quotes.POST(request("quotes", "POST", fixture(), { origin: blocked }));
    assert.equal(response.status, 403);
    assert.equal(response.headers.get("access-control-allow-origin"), null);
  }
  assert.equal((await rates.OPTIONS(request("rates", "OPTIONS", undefined, {
    origin, "access-control-request-method": "DELETE",
  }))).status, 405);
  assert.equal((await quotes.OPTIONS(request("quotes", "OPTIONS", undefined, {
    origin, "access-control-request-headers": "x-unapproved",
  }))).status, 403);
  const unauthorized = await quotes.GET(request("quotes", "GET", undefined, { origin, authorization: "" }));
  assert.equal(unauthorized.status, 401);
  assert.equal(unauthorized.headers.get("access-control-allow-origin"), origin);
});

test("API creates shared saved quotes, rejects duplicate REFs, supports partial updates and stale version conflicts", async () => {
  const created = await quotes.POST(request("quotes", "POST", { ...fixture("API-001"), totalCents: 1, status: "submitted" }, { origin }));
  assert.equal(created.status, 201);
  assert.equal(created.headers.get("location"), "/api/v1/quotes/API-001");
  assert.equal(created.headers.get("access-control-allow-origin"), origin);
  const { quote } = await created.json();
  assert.equal(quote.totalCents, 13995);
  assert.equal(quote.status, "draft");
  assert.equal(getQuoteStore().get("api-001").customer, fixture().customer);
  assert.equal((await quotes.POST(request("quotes", "POST", fixture("api-001")))).status, 409);
  const updated = await detail.PATCH(request("quotes/API-001", "PATCH", { version: quote.version, customer: "Updated customer" }), context(quote.ref));
  assert.equal(updated.status, 200);
  const result = (await updated.json()).quote;
  assert.equal(result.version, 2);
  assert.equal(result.customer, "Updated customer");
  assert.equal(result.totalCents, quote.totalCents);
  assert.deepEqual(result.pickup, quote.pickup);
  assert.equal((await detail.PATCH(request("quotes/API-001", "PATCH", { version: 1, customer: "Stale" }), context(quote.ref))).status, 409);
  assert.equal((await detail.PATCH(request("quotes/API-001", "PATCH", { customer: "Missing version" }), context(quote.ref))).status, 400);
  assert.equal((await detail.PATCH(request("quotes/API-001", "PATCH", { version: 2, ref: "CHANGED" }), context(quote.ref))).status, 400);
  assert.equal((await detail.GET(request("quotes/UNKNOWN"), context("UNKNOWN"))).status, 404);
  assert.equal((await (await detail.GET(request("quotes/API-001"), context("api-001"))).json()).quote.customer, "Updated customer");
});

test("API lists quotes with validated pagination, case-insensitive search, and status filtering", async () => {
  await quotes.POST(request("quotes", "POST", fixture("API-002")));
  const result = await (await quotes.GET(request("quotes?search=api-00&status=draft&limit=1&offset=1"))).json();
  assert.equal(result.quotes.length, 1);
  assert.equal(result.total, 2);
  assert.equal(result.limit, 1);
  assert.equal(result.offset, 1);
  assert.equal((await (await quotes.GET(request("quotes?search=ac-100"))).json()).total, 2);
  for (const query of ["limit=0", "limit=101", "limit=", "offset=-1", "offset=1.1", "status=unknown", "status="])
    assert.equal((await quotes.GET(request(`quotes?${query}`))).status, 400, query);
});

test("quote actions preserve acceptance locks, versions and the explicit order confirmation requirement", async () => {
  const act = (body: unknown) => actions.POST(request("quotes/API-002/actions", "POST", body), context("API-002"));
  assert.equal((await act({ action: "accept", version: 1 })).status, 400);
  const sent = await act({ action: "sent", version: 1 });
  assert.equal((await sent.json()).quote.status, "sent");
  const accepted = await act({ action: "accept", version: 2, acceptedBy: "Alex Smith" });
  assert.equal(accepted.status, 200);
  assert.equal((await accepted.json()).quote.acceptedBy, "Alex Smith");
  assert.equal((await detail.PATCH(request("quotes/API-002", "PATCH", { version: 3, customer: "Changed" }), context("API-002"))).status, 409);
  assert.equal((await act({ action: "submit", version: 3 })).status, 400);
  assert.equal(getQuoteStore().get("API-002").status, "accepted");
  const revised = await act({ action: "revise", version: 3 });
  assert.equal((await revised.json()).quote.status, "draft");
  assert.equal((await act({ action: "unknown", version: 4 })).status, 400);
});

test("rate API exposes defaults, calculates the existing sheet without saving, and rejects invalid shipments", async () => {
  const count = getQuoteStore().list().length;
  const catalog = await (await rates.GET(request("rates"))).json();
  const pricing = { ...catalog.pricingDefaults, vehicleClass: "cargo-van", miles: 30, vehicleCapacityLb: 1500, fuelPercent: 10, fuelBasis: "transport" };
  const shipment = { weight: 20, start: "2026-12-01T15:00:00Z", end: "2026-12-01T17:00:00Z" };
  const response = await calculate.POST(request("rates/calculate", "POST", { pricing, shipment }));
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.currency, "USD");
  assert.equal(result.totalCents, 8459);
  assert.equal(result.totalCents, result.snapshot.totalCents);
  assert.equal(result.snapshot.sheetId, catalog.sheet.id);
  assert.equal(getQuoteStore().list().length, count);
  assert.equal((await calculate.POST(request("rates/calculate", "POST", { pricing }))).status, 400);
  for (const change of [{ weight: -1 }, { weight: 1600 }, { start: "invalid" }, { start: "2026-12-01T10:00:00" }])
    assert.equal((await calculate.POST(request("rates/calculate", "POST", { pricing, shipment: { ...shipment, ...change } }))).status, 422);
});

test("JSON boundary rejects malformed, oversized, non-object and non-JSON requests without changes", async () => {
  const count = getQuoteStore().list().length;
  for (const [body, status] of [["{broken", 400], ["[]", 400], ["null", 400], [JSON.stringify({ notes: "é".repeat(50_001) }), 413]] as const) {
    const response = await quotes.POST(new Request("http://localhost/api/v1/quotes", {
      method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body,
    }));
    assert.equal(response.status, status);
  }
  assert.equal((await quotes.POST(request("quotes", "POST"))).status, 415);
  assert.equal(getQuoteStore().list().length, count);
});
