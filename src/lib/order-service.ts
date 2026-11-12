import { AxisError } from "./axis";
import { AppError, type Quote } from "./quotes";
import { QuoteStore } from "./quote-store";

export interface OrderGateway {
  submit(quote: Quote): Promise<string>;
  reconcile(quote: Quote): Promise<string>;
}

export async function submitQuote(
  store: QuoteStore,
  gateway: OrderGateway,
  ref: string,
  version: number,
): Promise<Quote> {
  const existing = store.get(ref);
  if (existing.status === "submitted") return existing;
  const quote = store.beginSubmission(ref, version);
  try {
    const id = await gateway.submit(quote);
    return store.finishSubmission(ref, id);
  } catch (error) {
    const message =
      error instanceof AppError
        ? error.message
        : "The order result could not be saved. Reconcile with Xcelerator before another submission.";
    store.failSubmission(
      ref,
      message,
      !(error instanceof AxisError) || error.uncertain,
    );
    throw error instanceof AppError ? error : new AppError(502, message);
  }
}

export async function reconcileQuote(
  store: QuoteStore,
  gateway: OrderGateway,
  ref: string,
): Promise<Quote> {
  const quote = store.get(ref);
  if (quote.status === "submitted") return quote;
  if (!["submitting", "review"].includes(quote.status))
    throw new AppError(
      409,
      "Only an uncertain submission needs reconciliation.",
    );
  if (
    quote.status === "submitting" &&
    Date.now() - Date.parse(quote.updatedAt) < 60_000
  )
    throw new AppError(
      409,
      "The submission is still in progress. Wait at least a minute before reconciling.",
    );
  return store.finishSubmission(ref, await gateway.reconcile(quote));
}
