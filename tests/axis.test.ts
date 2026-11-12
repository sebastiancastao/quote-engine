import { test } from "node:test";
import assert from "node:assert/strict";
import { AxisClient, AxisError, readOrderTrackingId } from "../src/lib/axis";
import { QuoteStore } from "../src/lib/quote-store";
import { fixture } from "./fixtures";

function quote() {
  const store = new QuoteStore(":memory:");
  const q = store.create(fixture());
  const result = store.accept(q.ref, q.version, "Alex");
  store.close();
  return result;
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

test("documented Axis authentication, catalogs and order mapping preserve the original REF", async () => {
  let submissions = 0;
  const q = quote();
  const fakeFetch: typeof fetch = async (url, options) => {
    const path = new URL(String(url)).pathname;
    if (path.endsWith("/Axis/Login")) {
      assert.equal(options?.method, "POST");
      const form = options?.body as URLSearchParams;
      assert.equal(form.get("grant_type"), "password");
      assert.equal(form.get("username"), "test-caller");
      return json({ access_token: "test-token" });
    }
    assert.equal(
      (options?.headers as Record<string, string>).Authorization,
      "Bearer test-token",
    );
    if (path.endsWith("/GetServiceTypes"))
      return json([{ ServiceId: 1, ServiceName: "Same Day" }]);
    if (path.endsWith("/GetVehicleTypes"))
      return json([{ VehicleId: 4, VehicleName: "Cargo Van" }]);
    if (path.endsWith("/GetPackageTypes"))
      return json([{ ID: 7, PACKAGE: "Box" }]);
    if (path.endsWith("/SubmitOrders")) {
      submissions++;
      const [order] = JSON.parse(String(options?.body));
      assert.equal(order.ClientRefNo, q.ref);
      assert.equal(order.AccountNo, "AC-100");
      assert.equal(order.ServiceId, 1);
      assert.equal(order.VehicleId, 4);
      assert.equal(order.PCity, "Newark");
      assert.equal(order.DCity, "Jersey City");
      assert.equal(order.PickupTargetFrom, q.pickupFrom);
      assert.match(order.SpecInstr, /139\.95/);
      assert.deepEqual(order.OrderPackages, [
        { PackageName: "Box", PackageCount: 2 },
      ]);
      return new Response(
        '{"OrdersCreated":[{"OrderTrackingID":123456789.120126}]}',
      );
    }
    throw new Error(`Unexpected request: ${path}`);
  };
  const client = new AxisClient(
    "test-caller",
    "test-password",
    "https://axis.example/Xcelerator/",
    fakeFetch,
  );
  assert.equal(await client.submit(q), "123456789.120126");
  assert.equal(submissions, 1);
});

test("unknown response or transport failures after POST are uncertain; invalid catalogs never submit", async () => {
  const q = quote();
  for (const failCatalog of [false, true]) {
    let called = false;
    const client = new AxisClient(
      "test",
      "test",
      "https://axis.example/",
      async (url) => {
        const path = String(url);
        if (path.endsWith("Login")) return json({ access_token: "test" });
        if (path.endsWith("GetServiceTypes"))
          return json([
            { ServiceId: 1, ServiceName: failCatalog ? "Unknown" : q.service },
          ]);
        if (path.endsWith("GetVehicleTypes"))
          return json([{ VehicleId: 4, VehicleName: q.vehicle }]);
        if (path.endsWith("GetPackageTypes"))
          return json([{ ID: 7, PACKAGE: q.packageType }]);
        called = true;
        throw new Error("Connection reset");
      },
    );
    await assert.rejects(
      client.submit(q),
      (error: unknown) =>
        error instanceof AxisError && error.uncertain === !failCatalog,
    );
    assert.equal(called, !failCatalog);
  }
});

test("order confirmation requires exactly one valid tracking ID", () => {
  assert.equal(
    readOrderTrackingId({ OrdersCreated: ["123.120126"] }),
    "123.120126",
  );
  assert.equal(
    readOrderTrackingId([{ OrderTrackingID: "1.120126" }]),
    "1.120126",
  );
  assert.equal(readOrderTrackingId({ OrdersCreated: ["1", "2"] }), null);
  assert.equal(readOrderTrackingId({ OrdersCreated: [] }), null);
  assert.equal(readOrderTrackingId({ Success: true }), null);
  assert.equal(readOrderTrackingId({ OrdersCreated: [1.2345] }), null);
});

test("Axis credentials cannot be sent over HTTP or in a URL", () => {
  assert.throws(
    () => new AxisClient("user", "pass", "http://axis.example/"),
    /HTTPS/,
  );
  assert.throws(
    () => new AxisClient("user", "pass", "https://user:pass@axis.example/"),
    /HTTPS/,
  );
});
