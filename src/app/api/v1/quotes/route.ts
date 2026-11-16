import { externalApi } from "@/lib/external-api";
import { json, readJsonBody } from "@/lib/http";
import { getQuoteStore } from "@/lib/quote-store";
import { AppError, statusLabels } from "@/lib/quotes";

const methods = ["GET", "POST"];

export async function GET(request: Request) {
  return externalApi(request, methods, () => {
    const params = new URL(request.url).searchParams;
    const integer = (name: string, fallback: number, min: number, max: number) => {
      const raw = params.get(name);
      const value = raw === null ? fallback : Number(raw);
      if (
        (raw !== null && !/^\d+$/.test(raw)) ||
        !Number.isSafeInteger(value) ||
        value < min || value > max
      )
        throw new AppError(400, `Use a whole ${name} between ${min} and ${max}.`);
      return value;
    };
    const limit = integer("limit", 50, 1, 100);
    const offset = integer("offset", 0, 0, Number.MAX_SAFE_INTEGER);
    const status = params.get("status");
    if (status !== null && !Object.hasOwn(statusLabels, status))
      throw new AppError(400, "Unknown quote status.");
    const search = (params.get("search") || "").trim().toLowerCase();
    const quotes = getQuoteStore().list().filter(
      (quote) =>
        (!status || quote.status === status) &&
        (!search ||
          [quote.ref, quote.customer, quote.accountNo].some((value) =>
            value.toLowerCase().includes(search),
          )),
    );
    return json({
      quotes: quotes.slice(offset, offset + limit),
      total: quotes.length,
      limit,
      offset,
    });
  });
}

export async function POST(request: Request) {
  return externalApi(request, methods, async () => {
    const body = await readJsonBody(request);
    const quote = getQuoteStore().create(body);
    const response = json({ quote }, 201);
    response.headers.set(
      "Location",
      `/api/v1/quotes/${encodeURIComponent(quote.ref)}`,
    );
    return response;
  });
}

export async function OPTIONS(request: Request) {
  return externalApi(request, methods, () => new Response(null));
}
