import {
  calculateAtlRate,
  RateError,
  type AtlPricingInput,
  type AtlRateSnapshot,
} from "./atl-rates";

export type QuoteStatus =
  "draft" | "sent" | "accepted" | "submitting" | "submitted" | "review";

export interface Address {
  name: string;
  street: string;
  city: string;
  state: string;
  zip: string;
}

export interface Charge {
  description: string;
  quantity: number;
  rateCents: number;
}

export interface QuoteInput {
  ref?: string;
  customer: string;
  email: string;
  accountNo: string;
  service: string;
  vehicle: string;
  pickup: Address;
  delivery: Address;
  pickupFrom: string;
  pickupTo: string;
  deliveryFrom: string;
  deliveryTo: string;
  packageType: string;
  pieces: number;
  weight: number;
  charges: Charge[];
  notes: string;
  pricing?: AtlPricingInput;
}

export interface Quote extends QuoteInput {
  ref: string;
  status: QuoteStatus;
  totalCents: number;
  version: number;
  createdAt: string;
  updatedAt: string;
  acceptedBy?: string;
  acceptedAt?: string;
  orderTrackingId?: string;
  submittedAt?: string;
  lastError?: string;
  rateSnapshot?: AtlRateSnapshot;
  events: { label: string; at: string }[];
}

export interface AxisStatus {
  configured: boolean;
  host: string | null;
}

export const statusLabels: Record<QuoteStatus, string> = {
  draft: "Draft",
  sent: "Awaiting response",
  accepted: "Accepted",
  submitting: "Submitting",
  submitted: "Order submitted",
  review: "Needs review",
};

export const money = (cents: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);

export function totalCharges(charges: Charge[]): number {
  return charges.reduce(
    (total, charge) => total + charge.quantity * charge.rateCents,
    0,
  );
}

export function blankQuote(): QuoteInput {
  const address = () => ({
    name: "",
    street: "",
    city: "",
    state: "",
    zip: "",
  });
  return {
    customer: "",
    email: "",
    accountNo: "",
    service: "",
    vehicle: "",
    pickup: address(),
    delivery: address(),
    pickupFrom: "",
    pickupTo: "",
    deliveryFrom: "",
    deliveryTo: "",
    packageType: "Box",
    pieces: 1,
    weight: 0,
    charges: [{ description: "Delivery charge", quantity: 1, rateCents: 0 }],
    notes: "",
  };
}

export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new AppError(400, "Invalid quote data.");
  return value as Record<string, unknown>;
}

function textField(
  value: unknown,
  label: string,
  max = 200,
  required = false,
): string {
  if (
    typeof value !== "string" ||
    value.length > max ||
    (required && !value.trim())
  ) {
    throw new AppError(
      400,
      `Enter a valid ${label}${required ? "." : ` (up to ${max} characters).`}`,
    );
  }
  return value.trim();
}

export function normalizeRef(value: string): string {
  const ref = value.trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9._-]{2,39}$/.test(ref))
    throw new AppError(
      400,
      "REF must be 3–40 letters, numbers, dots, dashes, or underscores.",
    );
  return ref;
}

export function parseQuote(value: unknown): QuoteInput {
  const data = object(value);
  const result = blankQuote();
  result.customer = textField(data.customer, "customer name", 200, true);
  for (const key of [
    "email",
    "accountNo",
    "service",
    "vehicle",
    "packageType",
  ] as const) {
    result[key] = textField(data[key], key);
  }
  if (result.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.email))
    throw new AppError(400, "Enter a valid customer email.");
  result.notes = textField(data.notes, "notes", 4000);
  if (data.ref) result.ref = normalizeRef(textField(data.ref, "REF", 40));
  for (const key of ["pickup", "delivery"] as const) {
    const address = object(data[key]);
    for (const field of ["name", "street", "city", "state", "zip"] as const) {
      result[key][field] = textField(address[field], `${key} ${field}`);
    }
  }
  for (const key of [
    "pickupFrom",
    "pickupTo",
    "deliveryFrom",
    "deliveryTo",
  ] as const) {
    const date = textField(data[key], "shipment date", 50);
    if (
      date &&
      (!/(Z|[+-]\d{2}:\d{2})$/.test(date) || !Number.isFinite(Date.parse(date)))
    ) {
      throw new AppError(400, "Shipment dates must include a valid time zone.");
    }
    result[key] = date ? new Date(date).toISOString() : "";
  }
  for (const key of ["pieces", "weight"] as const) {
    const number = data[key];
    if (
      typeof number !== "number" ||
      !Number.isFinite(number) ||
      number < (key === "pieces" ? 1 : 0) ||
      number > 10000 ||
      (key === "pieces" && !Number.isInteger(number))
    ) {
      throw new AppError(
        400,
        `Enter a valid ${key === "pieces" ? "package count (1–10,000)" : "shipment weight (0–10,000 lb)"}.`,
      );
    }
    result[key] = number;
  }
  if (data.pricing !== undefined && data.pricing !== null) {
    try {
      const rated = calculateAtlRate(data.pricing, {
        weight: result.weight,
        start: result.pickupFrom,
        end: result.deliveryTo,
      });
      result.pricing = rated.input;
      result.charges = rated.charges;
    } catch (error) {
      if (error instanceof RateError) throw new AppError(422, error.message);
      throw error;
    }
  } else {
    if (
      !Array.isArray(data.charges) ||
      !data.charges.length ||
      data.charges.length > 50
    )
      throw new AppError(400, "Add between 1 and 50 quote charges.");
    result.charges = data.charges.map((value) => {
      const charge = object(value);
      if (
        !Number.isSafeInteger(charge.quantity) ||
        Number(charge.quantity) < 1 ||
        Number(charge.quantity) > 10000 ||
        !Number.isSafeInteger(charge.rateCents) ||
        Number(charge.rateCents) < 0
      ) {
        throw new AppError(
          400,
          "Charges require a positive whole quantity and a nonnegative amount in cents.",
        );
      }
      return {
        description: textField(
          charge.description,
          "charge description",
          200,
          true,
        ),
        quantity: Number(charge.quantity),
        rateCents: Number(charge.rateCents),
      };
    });
  }
  const total = totalCharges(result.charges);
  if (!Number.isSafeInteger(total) || total > 100_000_000)
    throw new AppError(
      400,
      "Quote total must be less than or equal to $1,000,000.",
    );
  return result;
}

export function assertReady(quote: QuoteInput) {
  for (const key of [
    "accountNo",
    "service",
    "vehicle",
    "packageType",
  ] as const) {
    if (!quote[key])
      throw new AppError(
        422,
        `Complete the ${key === "accountNo" ? "Xcelerator account number" : key} before recording acceptance.`,
      );
  }
  for (const key of ["pickup", "delivery"] as const) {
    for (const field of ["name", "street", "city", "state", "zip"] as const) {
      if (!quote[key][field])
        throw new AppError(
          422,
          `Complete the ${key} ${field} before recording acceptance.`,
        );
    }
  }
  const times = [
    quote.pickupFrom,
    quote.pickupTo,
    quote.deliveryFrom,
    quote.deliveryTo,
  ].map(Date.parse);
  if (
    times.some((value) => !Number.isFinite(value)) ||
    times[0] >= times[1] ||
    times[2] >= times[3] ||
    times[1] > times[2]
  ) {
    throw new AppError(
      422,
      "Set valid pickup and delivery windows. Pickup must finish before delivery starts.",
    );
  }
}
