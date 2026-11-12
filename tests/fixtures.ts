import { blankQuote, type QuoteInput } from "../src/lib/quotes";

export function fixture(ref?: string): QuoteInput {
  return {
    ...blankQuote(),
    ref,
    customer: "Northstar Medical",
    email: "dispatch@example.com",
    accountNo: "AC-100",
    service: "Same Day",
    vehicle: "Cargo Van",
    packageType: "Box",
    pieces: 2,
    weight: 20,
    pickup: {
      name: "Main warehouse",
      street: "10 Industrial Way",
      city: "Newark",
      state: "NJ",
      zip: "07102",
    },
    delivery: {
      name: "Central hospital",
      street: "20 First Street",
      city: "Jersey City",
      state: "NJ",
      zip: "07302",
    },
    pickupFrom: "2026-12-01T13:00:00Z",
    pickupTo: "2026-12-01T14:00:00Z",
    deliveryFrom: "2026-12-01T15:00:00Z",
    deliveryTo: "2026-12-01T16:00:00Z",
    charges: [
      { description: "Delivery", quantity: 1, rateCents: 12995 },
      { description: "Additional handling", quantity: 2, rateCents: 500 },
    ],
  };
}
