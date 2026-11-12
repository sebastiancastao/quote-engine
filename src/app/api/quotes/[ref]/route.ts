import { getQuoteStore } from "@/lib/quote-store";
import { getAxisClient } from "@/lib/axis";
import { AppError } from "@/lib/quotes";
import { reconcileQuote, submitQuote } from "@/lib/order-service";
import { errorResponse, json, readBody, versionFrom } from "@/lib/http";

type Context = { params: Promise<{ ref: string }> };

export async function GET(_request: Request, context: Context) {
  try {
    return json({ quote: getQuoteStore().get((await context.params).ref) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, context: Context) {
  try {
    const { ref } = await context.params;
    const body = await readBody(request);
    const version = versionFrom(body);
    const store = getQuoteStore();
    return json({ quote: store.update(ref, version, body) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, context: Context) {
  try {
    const { ref } = await context.params;
    const body = await readBody(request);
    const version = versionFrom(body);
    const store = getQuoteStore();
    let quote;
    switch (body.action) {
      case "sent":
        quote = store.markSent(ref, version);
        break;
      case "accept":
        quote = store.accept(ref, version, body.acceptedBy as string);
        break;
      case "revise":
        quote = store.revise(ref, version);
        break;
      case "submit":
        if (body.confirm !== true)
          throw new AppError(
            400,
            "Confirm the order details before submitting.",
          );
        quote = await submitQuote(store, getAxisClient(), ref, version);
        break;
      case "reconcile":
        quote = await reconcileQuote(store, getAxisClient(), ref);
        break;
      default:
        throw new AppError(400, "Unknown quote action.");
    }
    return json({ quote });
  } catch (error) {
    return errorResponse(error);
  }
}
