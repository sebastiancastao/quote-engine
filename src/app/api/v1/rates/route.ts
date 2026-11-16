import { ATL_SHEET, ATL_VEHICLES, blankAtlPricing } from "@/lib/atl-rates";
import { externalApi } from "@/lib/external-api";
import { json } from "@/lib/http";

const methods = ["GET"];

export async function GET(request: Request) {
  return externalApi(request, methods, () =>
    json({
      sheet: ATL_SHEET,
      currency: "USD",
      vehicles: ATL_VEHICLES,
      pricingDefaults: blankAtlPricing(),
    }),
  );
}

export async function OPTIONS(request: Request) {
  return externalApi(request, methods, () => new Response(null));
}
