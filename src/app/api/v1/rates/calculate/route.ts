import { calculateAtlRate } from "@/lib/atl-rates";
import { externalApi } from "@/lib/external-api";
import { json, readJsonBody } from "@/lib/http";
import { AppError } from "@/lib/quotes";

const methods = ["POST"];

export async function POST(request: Request) {
  return externalApi(request, methods, async () => {
    const body = await readJsonBody(request);
    const shipment = body.shipment as Record<string, unknown> | undefined;
    if (
      !shipment || typeof shipment !== "object" || Array.isArray(shipment) ||
      typeof shipment.weight !== "number" ||
      typeof shipment.start !== "string" || typeof shipment.end !== "string"
    )
      throw new AppError(400, "Provide shipment weight, start, and end.");
    const result = calculateAtlRate(body.pricing, {
      weight: shipment.weight,
      start: shipment.start,
      end: shipment.end,
    });
    return json({
      ...result,
      currency: "USD",
      totalCents: result.snapshot.totalCents,
    });
  });
}

export async function OPTIONS(request: Request) {
  return externalApi(request, methods, () => new Response(null));
}
