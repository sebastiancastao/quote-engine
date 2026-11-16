import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ATL_SHEET,
  atlCalendarCharges,
  blankAtlPricing,
  calculateAtlRate,
  type AtlPricingInput,
  type AtlVehicleClass,
} from "../src/lib/atl-rates";
import { QuoteStore } from "../src/lib/quote-store";
import { fixture } from "./fixtures";

const shipment = {
  weight: 0,
  start: "2026-11-10T15:00:00Z",
  end: "2026-11-10T17:00:00Z",
};
function input(overrides: Partial<AtlPricingInput> = {}): AtlPricingInput {
  return {
    ...blankAtlPricing(),
    miles: 20,
    vehicleCapacityLb: 1000,
    fuelPercent: 0,
    ...overrides,
  };
}
function rate(overrides: Partial<AtlPricingInput> = {}, weight = 0) {
  return calculateAtlRate(input(overrides), { ...shipment, weight });
}

test("confirmed mileage formulas: small-package minimum vs all miles; van/truck bases include 20 miles", () => {
  const cases: [AtlVehicleClass, number, number][] = [
    ["small-package", 0, 3800],
    ["small-package", 23.75, 3800],
    ["small-package", 23.76, 3802],
    ["small-package", 50, 8000],
    ["cargo-van", 0, 5900],
    ["cargo-van", 20, 5900],
    ["cargo-van", 20.01, 5902],
    ["cargo-van", 30, 7690],
    ["cube-sprinter", 20, 9950],
    ["cube-sprinter", 30, 12000],
    ["box-truck", 20, 25000],
    ["box-truck", 30, 28250],
  ];
  for (const [vehicleClass, miles, expected] of cases)
    assert.equal(
      rate({ vehicleClass, miles }).snapshot.totalCents,
      expected,
      `${vehicleClass}, ${miles} miles`,
    );
});

test("waiting is charged separately at each end, with vehicle-specific free allowances and rates", () => {
  assert.equal(
    rate({
      vehicleClass: "cargo-van",
      pickupWaitMinutes: 15,
      deliveryWaitMinutes: 15,
    }).snapshot.totalCents,
    5900,
  );
  const van = rate({
    vehicleClass: "cargo-van",
    pickupWaitMinutes: 20,
    deliveryWaitMinutes: 20,
  });
  assert.equal(van.snapshot.totalCents, 6390);
  assert.equal(van.snapshot.billablePickupWait, 5);
  assert.equal(van.snapshot.billableDeliveryWait, 5);
  assert.equal(
    rate({
      vehicleClass: "cargo-van",
      pickupWaitMinutes: 30,
      deliveryWaitMinutes: 0,
    }).snapshot.totalCents,
    6635,
  );
  assert.equal(
    rate({
      vehicleClass: "cube-sprinter",
      pickupWaitMinutes: 16,
      deliveryWaitMinutes: 16,
    }).snapshot.totalCents,
    10050,
  );
  assert.equal(
    rate({
      vehicleClass: "box-truck",
      pickupWaitMinutes: 60,
      deliveryWaitMinutes: 60,
    }).snapshot.totalCents,
    25000,
  );
  assert.equal(
    rate({
      vehicleClass: "box-truck",
      pickupWaitMinutes: 61,
      deliveryWaitMinutes: 61,
    }).snapshot.totalCents,
    25180,
  );
});

test("weight allowances and hard vehicle capacity limits are enforced", () => {
  assert.equal(rate({}, 100).snapshot.totalCents, 3800);
  assert.equal(rate({}, 101).snapshot.totalCents, 3806);
  assert.equal(
    rate({ vehicleClass: "cargo-van" }, 150).snapshot.totalCents,
    6200,
  );
  assert.equal(
    rate({ vehicleClass: "box-truck" }, 2000).snapshot.totalCents,
    25000,
  );
  assert.equal(
    rate({ vehicleClass: "box-truck" }, 2100).snapshot.totalCents,
    25400,
  );
  assert.equal(
    rate({ vehicleClass: "box-truck" }, 9000).snapshot.totalCents,
    53000,
  );
  assert.throws(
    () => rate({ vehicleClass: "box-truck", vehicleCapacityLb: 10000 }, 9001),
    /9,000/,
  );
  assert.throws(() => rate({ vehicleCapacityLb: 150 }, 151), /cargo capacity/);
  assert.throws(() => rate({ vehicleCapacityLb: null }), /capacity/);
});

test("Atlanta after-hours boundaries are inclusive at 19:01 and 05:59, including summer DST", () => {
  const cases: [string, boolean][] = [
    ["2026-11-11T00:00:00Z", false],
    ["2026-11-11T00:01:00Z", true],
    ["2026-11-10T10:59:59Z", true],
    ["2026-11-10T11:00:00Z", false],
    ["2026-07-08T23:01:00Z", true],
    ["2026-07-08T23:00:00Z", false],
  ];
  for (const [instant, expected] of cases)
    assert.equal(
      atlCalendarCharges(instant, instant).afterHours,
      expected,
      instant,
    );
});

test("all six named holidays use actual Atlanta dates, without invented observed holidays", () => {
  for (const date of [
    "2026-01-01",
    "2026-05-25",
    "2026-07-04",
    "2026-09-07",
    "2026-11-26",
    "2026-12-25",
  ]) {
    assert.equal(
      atlCalendarCharges(`${date}T15:00:00Z`, `${date}T16:00:00Z`).holidays
        .length,
      1,
      date,
    );
  }
  assert.deepEqual(
    atlCalendarCharges("2026-07-03T15:00:00Z", "2026-07-03T16:00:00Z").holidays,
    [],
  );
});

test("after-hours, weekend, and holiday surcharges stack once, not once per endpoint", () => {
  const fourth = {
    ...shipment,
    start: "2026-07-04T23:01:00Z",
    end: "2026-07-05T01:00:00Z",
  };
  const small = calculateAtlRate(input(), fourth);
  assert.equal(small.snapshot.totalCents, 12800);
  assert.equal(small.snapshot.weekend, true);
  assert.deepEqual(small.snapshot.holidays, ["Independence Day"]);
  assert.equal(
    calculateAtlRate(input({ vehicleClass: "box-truck" }), fourth).snapshot
      .totalCents,
    47500,
  );
  const spanning = atlCalendarCharges(
    "2026-11-13T23:00:00Z",
    "2026-11-16T15:00:00Z",
  );
  assert.equal(spanning.weekend, true);
});

test("trip multipliers affect only base transport and roundtrips require freight both ways", () => {
  assert.equal(
    rate({ vehicleClass: "cargo-van", trip: "roundtrip", loadedBothWays: true })
      .snapshot.totalCents,
    8850,
  );
  assert.equal(
    rate({ vehicleClass: "cargo-van", trip: "return" }).snapshot.totalCents,
    2950,
  );
  assert.equal(
    rate(
      {
        vehicleClass: "cargo-van",
        miles: 30,
        trip: "roundtrip",
        loadedBothWays: true,
        pickupWaitMinutes: 20,
        deliveryWaitMinutes: 20,
      },
      150,
    ).snapshot.totalCents,
    12325,
  );
  assert.throws(
    () => rate({ trip: "roundtrip", loadedBothWays: false }),
    /both directions/,
  );
});

test("all accessorial fees, full delivery attempts, ice cost, equipment, and quoted helper hours are itemized", () => {
  const result = rate({
    vehicleClass: "box-truck",
    secondAirlineCounter: true,
    airportRecoveryAttempts: 2,
    additionalDeliveryAttempts: 1,
    paperworkFaxed: true,
    dryIcePickup: true,
    dryIcePounds: 3,
    hazmat: true,
    holdOver: true,
    dryIceReplenish: true,
    liftGate: true,
    palletJack: true,
    helperHours: 2,
    helperHourlyRateCents: 5000,
  });
  assert.equal(result.snapshot.totalCents, 83175);
  assert.equal(result.snapshot.transportCents, 50000);
  assert.equal(
    result.charges.find((charge) => charge.description.startsWith("Dry ice ·"))
      ?.rateCents,
    975,
  );
  assert.equal(
    result.charges.find((charge) =>
      charge.description.startsWith("Second person"),
    )?.rateCents,
    10000,
  );
});

test("FSC is never guessed; its explicitly selected basis determines the charge", () => {
  assert.throws(() => rate({ fuelPercent: null }), /fuel surcharge/);
  assert.throws(
    () => rate({ fuelPercent: 10, fuelBasis: null }),
    /which charges/,
  );
  const transport = rate({
    vehicleClass: "cargo-van",
    pickupWaitMinutes: 20,
    fuelPercent: 10,
    fuelBasis: "transport",
  });
  const subtotal = rate({
    vehicleClass: "cargo-van",
    pickupWaitMinutes: 20,
    fuelPercent: 10,
    fuelBasis: "subtotal",
  });
  assert.equal(transport.snapshot.fuelBasisCents, 5900);
  assert.equal(transport.snapshot.fuelCents, 590);
  assert.equal(transport.snapshot.totalCents, 6735);
  assert.equal(subtotal.snapshot.fuelBasisCents, 6145);
  assert.equal(subtotal.snapshot.fuelCents, 615);
  assert.equal(subtotal.snapshot.totalCents, 6760);
});

test("quote-only helper prices and historical ice pricing cannot be silently invented", () => {
  assert.throws(
    () =>
      rate({
        vehicleClass: "box-truck",
        helperHours: 2,
        helperHourlyRateCents: null,
      }),
    /quote-only/,
  );
  assert.throws(() => rate({ liftGate: true }), /box-truck/);
  assert.throws(
    () => rate({ dryIcePickup: true, dryIcePounds: 0 }),
    /ice weight/,
  );
  assert.throws(
    () =>
      calculateAtlRate(input({ dryIcePounds: 1 }), {
        ...shipment,
        start: "2026-09-24T15:00:00Z",
        end: "2026-09-24T17:00:00Z",
      }),
    /September 25/,
  );
});

test("dry ice replenishment alone uses the stated flat fee, without inventing an ice purchase", () => {
  const result = rate({ dryIceReplenish: true });
  assert.equal(result.snapshot.totalCents, 6800);
  assert.equal(
    result.charges.some((charge) => charge.description.startsWith("Dry ice ·")),
    false,
  );
});

test("invalid distances, percentages, dates, counts, and unknown rate versions are rejected", () => {
  for (const overrides of [
    { miles: -1 },
    { miles: 1.234 },
    { fuelPercent: -1 },
    { pickupWaitMinutes: 1.5 },
    { airportRecoveryAttempts: 0.5 },
    { sheetId: "unknown" },
    { mileageBasis: "minimum-all-miles" },
  ]) {
    assert.throws(() =>
      calculateAtlRate({ ...input(), ...overrides }, shipment),
    );
  }
  assert.throws(
    () => calculateAtlRate(input(), { ...shipment, start: "" }),
    /pickup start/,
  );
  assert.throws(
    () =>
      calculateAtlRate(input(), { ...shipment, end: "2026-10-01T17:00:00Z" }),
    /window/,
  );
});

test("saved rated quotes ignore client totals and preserve the rate snapshot through acceptance; manual revisions clear it", () => {
  const store = new QuoteStore(":memory:");
  try {
    const q = store.create({
      ...fixture(),
      weight: 0,
      pricing: input({ miles: 50 }),
      charges: [{ description: "Tampered", quantity: 1, rateCents: 1 }],
      totalCents: 1,
      rateSnapshot: { totalCents: 1 },
    });
    assert.equal(q.totalCents, 8000);
    assert.equal(q.rateSnapshot?.sourceSha256, ATL_SHEET.sha256);
    assert.equal(q.rateSnapshot?.totalCents, 8000);
    const accepted = store.accept(q.ref, q.version, "Alex Smith");
    assert.deepEqual(store.get(q.ref).rateSnapshot, accepted.rateSnapshot);
    assert.throws(
      () =>
        store.update(q.ref, accepted.version, {
          ...fixture(),
          pricing: input({ miles: 100 }),
        }),
      /locked/,
    );
    const reopened = store.revise(q.ref, accepted.version);
    const manual = store.update(q.ref, reopened.version, {
      ...fixture(),
      pricing: null,
    });
    assert.equal(manual.totalCents, 13995);
    assert.equal(store.get(q.ref).pricing, undefined);
    assert.equal(store.get(q.ref).rateSnapshot, undefined);
  } finally {
    store.close();
  }
});
