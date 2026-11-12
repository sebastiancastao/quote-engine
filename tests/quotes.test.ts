import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { QuoteStore } from "../src/lib/quote-store";
import { AxisError, getAxisClient } from "../src/lib/axis";
import { AppError, parseQuote } from "../src/lib/quotes";
import {
  submitQuote,
  reconcileQuote,
  type OrderGateway,
} from "../src/lib/order-service";
import { fixture } from "./fixtures";
import { readBody } from "../src/lib/http";

function accepted(store: QuoteStore) {
  const q = store.create(fixture());
  return store.accept(q.ref, q.version, "Alex Smith");
}
const noReconcile = async () => {
  throw new Error("Unexpected reconciliation");
};

test("same-origin mutations work behind Next host normalization while cross-origin writes are blocked", async () => {
  const request = (origin: string) =>
    new Request("http://localhost:3100/api/quotes", {
      method: "POST",
      headers: {
        host: "127.0.0.1:3100",
        origin,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ customer: "Test" }),
    });
  assert.deepEqual(await readBody(request("http://127.0.0.1:3100")), {
    customer: "Test",
  });
  await assert.rejects(
    readBody(request("https://other.example")),
    (error: unknown) => error instanceof AppError && error.status === 403,
  );
});

test("REF and quote survive closing and reopening the database; server computes totals", () => {
  const directory = mkdtempSync(join(tmpdir(), "quote-engine-test-"));
  try {
    const path = join(directory, "quotes.sqlite");
    const first = new QuoteStore(path);
    const q = first.create({
      ...fixture("ref-abc"),
      totalCents: 1,
      status: "submitted",
    });
    assert.equal(q.ref, "REF-ABC");
    assert.equal(q.totalCents, 13995);
    assert.equal(q.status, "draft");
    first.close();
    const second = new QuoteStore(path);
    assert.deepEqual(second.get("ref-abc"), q);
    assert.equal(second.list().length, 1);
    second.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("REF collision is rejected without overwriting; auto numbering skips custom references", () => {
  const store = new QuoteStore(":memory:");
  store.create(fixture("REF-00001"));
  assert.throws(() => store.create(fixture("ref-00001")), /already exists/);
  assert.equal(store.create(fixture()).ref, "REF-00002");
  assert.equal(store.list().length, 2);
  store.close();
});

test("optimistic versions prevent stale edits and acceptance locks the agreed quote", () => {
  const store = new QuoteStore(":memory:");
  const q = store.create(fixture());
  const sent = store.markSent(q.ref, q.version);
  assert.throws(
    () => store.update(q.ref, q.version, fixture()),
    /another session/,
  );
  const confirmed = store.accept(q.ref, sent.version, "Alex Smith");
  assert.throws(
    () => store.update(q.ref, confirmed.version, fixture()),
    /locked/,
  );
  assert.equal(confirmed.acceptedBy, "Alex Smith");
  const reopened = store.revise(q.ref, confirmed.version);
  assert.equal(reopened.status, "draft");
  assert.equal(reopened.acceptedAt, undefined);
  assert.ok(
    reopened.events.some((event) => event.label.includes("Accepted by Alex")),
  );
  store.close();
});

test("invalid money, package counts and dates are rejected; incomplete drafts cannot be accepted", () => {
  for (const input of [
    { ...fixture(), pieces: -1 },
    {
      ...fixture(),
      charges: [{ description: "Fee", quantity: 1, rateCents: 1.25 }],
    },
    { ...fixture(), pickupFrom: "2026-12-01T10:00:00" },
  ]) {
    assert.throws(() => parseQuote(input));
  }
  const store = new QuoteStore(":memory:");
  const q = store.create({ ...fixture(), deliveryFrom: "" });
  assert.throws(() => store.accept(q.ref, q.version, "Alex"), /windows/);
  store.close();
});

test("unaccepted quotes cannot reach the gateway", async () => {
  const store = new QuoteStore(":memory:"),
    q = store.create(fixture());
  let calls = 0;
  await assert.rejects(
    submitQuote(
      store,
      {
        submit: async () => {
          calls++;
          return "1.120126";
        },
        reconcile: noReconcile,
      },
      q.ref,
      q.version,
    ),
    /accepted/,
  );
  assert.equal(calls, 0);
  store.close();
});

test("concurrent submissions make exactly one external call; retries return the confirmed order", async () => {
  const store = new QuoteStore(":memory:"),
    q = accepted(store);
  let calls = 0;
  let release!: (value: string) => void;
  const gateway: OrderGateway = {
    submit: () => {
      calls++;
      return new Promise((resolve) => {
        release = resolve;
      });
    },
    reconcile: noReconcile,
  };
  const first = submitQuote(store, gateway, q.ref, q.version);
  await assert.rejects(
    submitQuote(store, gateway, q.ref, q.version),
    (error: unknown) => error instanceof AppError && error.status === 409,
  );
  release("123.120126");
  const result = await first;
  assert.equal(result.status, "submitted");
  assert.equal(result.orderTrackingId, "123.120126");
  assert.equal(
    (await submitQuote(store, gateway, q.ref, q.version)).orderTrackingId,
    result.orderTrackingId,
  );
  assert.equal(calls, 1);
  assert.throws(() => store.revise(q.ref, result.version));
  store.close();
});

test("pre-submission rejection keeps acceptance; ambiguous outcomes block retries and reconcile by REF", async () => {
  const store = new QuoteStore(":memory:");
  let q = accepted(store);
  await assert.rejects(
    submitQuote(
      store,
      {
        submit: async () => {
          throw new AxisError("Invalid service");
        },
        reconcile: noReconcile,
      },
      q.ref,
      q.version,
    ),
  );
  q = store.get(q.ref);
  assert.equal(q.status, "accepted");
  const gateway: OrderGateway = {
    submit: async () => {
      throw new AxisError("Connection lost after POST", true);
    },
    reconcile: async (quote) => {
      assert.equal(quote.ref, q.ref);
      return "987.120126";
    },
  };
  await assert.rejects(submitQuote(store, gateway, q.ref, q.version));
  q = store.get(q.ref);
  assert.equal(q.status, "review");
  assert.equal(q.totalCents, 13995);
  await assert.rejects(submitQuote(store, gateway, q.ref, q.version));
  const reconciled = await reconcileQuote(store, gateway, q.ref);
  assert.equal(reconciled.status, "submitted");
  assert.equal(reconciled.orderTrackingId, "987.120126");
  store.close();
});

test("missing Axis configuration fails explicitly without changing a quote", () => {
  const old = process.env.AXIS_BASE_URL;
  delete process.env.AXIS_BASE_URL;
  try {
    assert.throws(() => getAxisClient(), /not configured/);
  } finally {
    if (old !== undefined) process.env.AXIS_BASE_URL = old;
  }
});
