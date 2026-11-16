import { getAxisClient } from "./axis";
import { versionFrom } from "./http";
import { reconcileQuote, submitQuote } from "./order-service";
import { getQuoteStore } from "./quote-store";
import { AppError, type Quote } from "./quotes";

export async function performQuoteAction(
  ref: string,
  body: Record<string, unknown>,
): Promise<Quote> {
  const version = versionFrom(body);
  const store = getQuoteStore();
  switch (body.action) {
    case "sent":
      return store.markSent(ref, version);
    case "accept":
      return store.accept(ref, version, body.acceptedBy as string);
    case "revise":
      return store.revise(ref, version);
    case "submit":
      if (body.confirm !== true)
        throw new AppError(400, "Confirm the order details before submitting.");
      return submitQuote(store, getAxisClient(), ref, version);
    case "reconcile":
      return reconcileQuote(store, getAxisClient(), ref);
    default:
      throw new AppError(400, "Unknown quote action.");
  }
}
