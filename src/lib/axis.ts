import { AppError, money, type AxisStatus, type Quote } from "./quotes";

// Based on the AXIS Partner Getting Started guide and Hello_Axis v1 sample.
// Confirm the instance's Axis/Swagger contract before enabling live order entry.
type Json = Record<string, unknown>;
type Fetcher = typeof fetch;

export class AxisError extends AppError {
  constructor(
    message: string,
    public uncertain = false,
  ) {
    super(502, message);
  }
}

export function axisStatus(): AxisStatus {
  try {
    const url = new URL(process.env.AXIS_BASE_URL || "");
    return {
      configured:
        url.protocol === "https:" &&
        !!process.env.AXIS_USERNAME &&
        !!process.env.AXIS_PASSWORD,
      host: url.host,
    };
  } catch {
    return { configured: false, host: null };
  }
}

function record(value: unknown): Json {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Json)
    : {};
}

function field(data: Json, name: string): unknown {
  const key = Object.keys(data).find(
    (key) => key.toLowerCase() === name.toLowerCase(),
  );
  return key ? data[key] : undefined;
}

function trackingId(value: unknown): string | null {
  if (typeof value === "string" && /^\d+(?:\.\d+)?$/.test(value)) return value;
  // AXIS tracking IDs can be decimal numbers. A non-integer parsed Number may
  // have lost significant digits; require a string instead of storing a guess.
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0)
    return String(value);
  return null;
}

export function readOrderTrackingId(body: unknown): string | null {
  const created = field(record(body), "OrdersCreated");
  const list = Array.isArray(body)
    ? body
    : Array.isArray(created)
      ? created
      : null;
  if (!list || list.length !== 1) return null;
  return (
    trackingId(list[0]) || trackingId(field(record(list[0]), "OrderTrackingID"))
  );
}

export class AxisClient {
  private base: URL;
  constructor(
    private username: string,
    private password: string,
    base: string,
    private fetcher: Fetcher = fetch,
  ) {
    this.base = new URL(base.endsWith("/") ? base : `${base}/`);
    if (
      this.base.protocol !== "https:" ||
      this.base.username ||
      this.base.password ||
      this.base.search ||
      this.base.hash
    ) {
      throw new AppError(
        503,
        "Axis requires an HTTPS Xcelerator base URL without credentials or query parameters.",
      );
    }
  }

  private async request(
    path: string,
    options: RequestInit = {},
    uncertain = false,
  ): Promise<unknown> {
    try {
      const response = await this.fetcher(new URL(path, this.base), {
        ...options,
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(25_000),
      });
      if (!response.ok) {
        // Once SubmitOrders has been called, only a definite validation/auth
        // rejection is safe to retry. A server failure may occur after creation.
        const ambiguous =
          uncertain &&
          ![400, 401, 403, 404, 405, 422].includes(response.status);
        throw new AxisError(
          `Axis ${uncertain ? "order submission" : "connection"} returned HTTP ${response.status}. ${ambiguous ? "Check Xcelerator before trying again." : "Check caller permissions and the instance API configuration."}`,
          ambiguous,
        );
      }
      // Preserve decimal OrderTrackingID values verbatim before JSON parsing.
      // They identify orders; converting them to floating point can change them.
      const raw = await response.text();
      const preserved = raw.replace(
        /("OrderTrackingID"\s*:\s*)(\d+(?:\.\d+)?)(?=\s*[,}])/gi,
        '$1"$2"',
      );
      return JSON.parse(preserved);
    } catch (error) {
      if (error instanceof AxisError) throw error;
      throw new AxisError(
        uncertain
          ? "Axis did not return a confirmed order number. Reconcile with Xcelerator before another submission."
          : "Could not connect to Axis. Check the instance URL and caller credentials.",
        uncertain,
      );
    }
  }

  private async authenticate(): Promise<string> {
    const data = record(
      await this.request("Axis/Login", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: new URLSearchParams({
          grant_type: "password",
          username: this.username,
          password: this.password,
        }),
      }),
    );
    const token = data.access_token;
    if (typeof token !== "string" || !token)
      throw new AxisError(
        "Axis did not issue an access token. Check the caller's Axis permissions.",
      );
    return token;
  }

  async test(): Promise<void> {
    const token = await this.authenticate();
    await this.request("Axis/HelloWorld", {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
  }

  async submit(quote: Quote): Promise<string> {
    const token = await this.authenticate();
    const headers = {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    };
    const [services, vehicles, packages] = await Promise.all([
      this.request("Axis/v1/ServiceType/GetServiceTypes", { headers }),
      this.request("Axis/v1/VehicleType/GetVehicleTypes", { headers }),
      this.request("Axis/v1/PackageType/GetPackageTypes", { headers }),
    ]);
    const find = (values: unknown, nameKey: string, expected: string): Json => {
      if (!Array.isArray(values))
        throw new AxisError(
          "Axis returned an unrecognized catalog. Confirm the instance Swagger specification.",
        );
      const match = values.map(record).find(
        (item) =>
          String(field(item, nameKey) || "")
            .trim()
            .toLowerCase() === expected.toLowerCase(),
      );
      if (!match)
        throw new AxisError(
          `The ${nameKey === "PACKAGE" ? "package type" : nameKey === "ServiceName" ? "service" : "vehicle"} “${expected}” is not available to this Axis caller. Match the instance's catalog before accepting a new quote.`,
        );
      return match;
    };
    const service = find(services, "ServiceName", quote.service);
    const vehicle = find(vehicles, "VehicleName", quote.vehicle);
    const packageType = find(packages, "PACKAGE", quote.packageType);
    const serviceId = Number(field(service, "ServiceId"));
    const vehicleId = Number(field(vehicle, "VehicleId"));
    if (
      !Number.isSafeInteger(serviceId) ||
      serviceId <= 0 ||
      !Number.isSafeInteger(vehicleId) ||
      vehicleId <= 0
    ) {
      throw new AxisError(
        "Axis did not return service and vehicle IDs required by the current order schema. Confirm your instance's Swagger specification.",
      );
    }
    const payload: Json = {
      OrderType: "PD",
      AccountNo: quote.accountNo,
      ServiceId: serviceId,
      VehicleId: vehicleId,
      Caller: quote.acceptedBy,
      Email: quote.email,
      ClientRefNo: quote.ref,
      RoundTrip: false,
      SpecInstr:
        `Accepted quote ${quote.ref}: ${money(quote.totalCents)} USD. ${quote.notes}`.trim(),
      PCoName: quote.pickup.name,
      PStreet: quote.pickup.street,
      PCity: quote.pickup.city,
      PState: quote.pickup.state,
      PZip: quote.pickup.zip,
      DCoName: quote.delivery.name,
      DStreet: quote.delivery.street,
      DCity: quote.delivery.city,
      DState: quote.delivery.state,
      DZip: quote.delivery.zip,
      PickupTargetFrom: quote.pickupFrom,
      PickupTargetTo: quote.pickupTo,
      DeliveryTargetFrom: quote.deliveryFrom,
      DeliveryTargetTo: quote.deliveryTo,
    };
    if (process.env.AXIS_PACKAGE_MODE === "items") {
      const packageId = Number(field(packageType, "ID"));
      if (!Number.isSafeInteger(packageId) || packageId <= 0)
        throw new AxisError("Axis did not return a valid package ID.");
      payload.OrderPackageItems = Array.from(
        { length: quote.pieces },
        (_, index) => ({
          Leg_PD: true,
          Leg_RT: false,
          PackageName: quote.packageType,
          PackageId: packageId,
          RefNo: `${quote.ref}-${index + 1}`,
          Weight: quote.weight / quote.pieces,
        }),
      );
    } else {
      payload.OrderPackages = [
        { PackageName: quote.packageType, PackageCount: quote.pieces },
      ];
      payload.ShipmentWeight = quote.weight;
    }
    const response = await this.request(
      "Axis/v1/Order/SubmitOrders",
      {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify([payload]),
      },
      true,
    );
    const id = readOrderTrackingId(response);
    if (!id)
      throw new AxisError(
        "Axis did not confirm exactly one order tracking number. Reconcile with Xcelerator before another submission.",
        true,
      );
    return id;
  }

  async reconcile(quote: Quote): Promise<string> {
    const token = await this.authenticate();
    const headers = {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    };
    const batches = await Promise.all([
      this.request("Axis/v1/Order/GetOpenOrders", { headers }),
      this.request("Axis/v1/Order/GetCompletedOrders", { headers }),
    ]);
    if (batches.some((batch) => !Array.isArray(batch)))
      throw new AxisError(
        "Axis order lookup returned an unrecognized response. Reconcile this REF manually in Xcelerator.",
      );
    const matches = batches
      .flatMap((batch) => (batch as unknown[]).map(record))
      .filter((order) => field(order, "ClientRefNo") === quote.ref);
    const ids = [
      ...new Set(
        matches
          .map((order) => trackingId(field(order, "OrderTrackingID")))
          .filter((id): id is string => !!id),
      ),
    ];
    if (ids.length !== 1)
      throw new AppError(
        409,
        ids.length > 1
          ? "Multiple Xcelerator orders have this REF. Review them manually before continuing."
          : "No matching order was confirmed. Check this REF in Xcelerator; resubmission remains blocked to prevent duplicates.",
      );
    return ids[0];
  }
}

export function getAxisClient(): AxisClient {
  if (!axisStatus().configured)
    throw new AppError(
      503,
      "Axis is not configured. Your quote is saved. Add the instance URL and Axis caller credentials to enable order submission.",
    );
  return new AxisClient(
    process.env.AXIS_USERNAME!,
    process.env.AXIS_PASSWORD!,
    process.env.AXIS_BASE_URL!,
  );
}
