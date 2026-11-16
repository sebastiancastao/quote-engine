import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { calculateAtlRate } from "./atl-rates";
import {
  AppError,
  assertReady,
  normalizeRef,
  parseQuote,
  totalCharges,
  type Quote,
} from "./quotes";

export class QuoteStore {
  private db: DatabaseSync;

  constructor(path: string) {
    if (path !== ":memory:")
      mkdirSync(dirname(resolve(path)), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`
      PRAGMA journal_mode=WAL;
      PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS quotes (ref TEXT PRIMARY KEY COLLATE NOCASE, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS counters (name TEXT PRIMARY KEY, value INTEGER NOT NULL);
      INSERT OR IGNORE INTO counters VALUES ('quote', 0);
    `);
  }

  close() {
    this.db.close();
  }

  list(): Quote[] {
    return this.db
      .prepare("SELECT data FROM quotes")
      .all()
      .map((row) => JSON.parse(String(row.data)) as Quote)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  get(ref: string): Quote {
    const row = this.db
      .prepare("SELECT data FROM quotes WHERE ref = ?")
      .get(normalizeRef(ref));
    if (!row) throw new AppError(404, "Quote not found.");
    return JSON.parse(String(row.data));
  }

  private transaction<T>(operation: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = operation();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  create(value: unknown): Quote {
    const input = parseQuote(value);
    return this.transaction(() => {
      let ref = input.ref;
      if (!ref) {
        do {
          const row = this.db
            .prepare(
              "UPDATE counters SET value = value + 1 WHERE name = 'quote' RETURNING value",
            )
            .get();
          ref = `REF-${String(row!.value).padStart(5, "0")}`;
        } while (
          this.db.prepare("SELECT 1 FROM quotes WHERE ref = ?").get(ref)
        );
      }
      if (this.db.prepare("SELECT 1 FROM quotes WHERE ref = ?").get(ref))
        throw new AppError(
          409,
          "This REF already exists. Open the saved quote or choose another REF.",
        );
      const now = new Date().toISOString();
      const quote: Quote = {
        ...input,
        ref,
        status: "draft",
        totalCents: totalCharges(input.charges),
        ...(input.pricing
          ? {
              rateSnapshot: calculateAtlRate(input.pricing, {
                weight: input.weight,
                start: input.pickupFrom,
                end: input.deliveryTo,
              }).snapshot,
            }
          : {}),
        version: 1,
        createdAt: now,
        updatedAt: now,
        events: [{ label: "Quote saved", at: now }],
      };
      this.db
        .prepare("INSERT INTO quotes VALUES (?, ?)")
        .run(ref, JSON.stringify(quote));
      return quote;
    });
  }

  private change(
    ref: string,
    version: number | undefined,
    operation: (quote: Quote) => Quote,
  ): Quote {
    return this.transaction(() => {
      const quote = this.get(ref);
      if (version !== undefined && quote.version !== version)
        throw new AppError(
          409,
          "This quote changed in another session. Refresh before continuing.",
        );
      const updated = operation(quote);
      updated.version = quote.version + 1;
      updated.updatedAt = new Date().toISOString();
      this.db
        .prepare("UPDATE quotes SET data = ? WHERE ref = ?")
        .run(JSON.stringify(updated), quote.ref);
      return updated;
    });
  }

  update(ref: string, version: number, value: unknown): Quote {
    const input = parseQuote(value);
    return this.change(ref, version, (quote) => {
      if (!["draft", "sent"].includes(quote.status))
        throw new AppError(
          409,
          "Accepted quotes are locked to preserve the agreed details.",
        );
      if (input.ref && input.ref !== quote.ref)
        throw new AppError(400, "A saved REF cannot be changed.");
      return {
        ...quote,
        ...input,
        ref: quote.ref,
        pricing: input.pricing,
        rateSnapshot: input.pricing
          ? calculateAtlRate(input.pricing, {
              weight: input.weight,
              start: input.pickupFrom,
              end: input.deliveryTo,
            }).snapshot
          : undefined,
        totalCents: totalCharges(input.charges),
        events: [
          ...quote.events,
          { label: "Quote updated", at: new Date().toISOString() },
        ],
      };
    });
  }

  markSent(ref: string, version: number): Quote {
    return this.change(ref, version, (quote) => {
      if (quote.status !== "draft")
        throw new AppError(409, "Only a draft can be marked as sent.");
      return {
        ...quote,
        status: "sent",
        events: [
          ...quote.events,
          { label: "Marked as sent to customer", at: new Date().toISOString() },
        ],
      };
    });
  }

  accept(ref: string, version: number, acceptedBy: string): Quote {
    if (
      typeof acceptedBy !== "string" ||
      !acceptedBy.trim() ||
      acceptedBy.length > 200
    )
      throw new AppError(400, "Enter the name of the customer who accepted.");
    return this.change(ref, version, (quote) => {
      if (!["draft", "sent"].includes(quote.status))
        throw new AppError(409, "This quote has already been accepted.");
      assertReady(quote);
      const at = new Date().toISOString();
      return {
        ...quote,
        status: "accepted",
        acceptedBy: acceptedBy.trim(),
        acceptedAt: at,
        events: [
          ...quote.events,
          { label: `Accepted by ${acceptedBy.trim()}`, at },
        ],
      };
    });
  }

  beginSubmission(ref: string, version: number): Quote {
    return this.change(ref, version, (quote) => {
      if (quote.status !== "accepted")
        throw new AppError(
          409,
          "Only an accepted quote can be submitted. An existing or uncertain submission cannot be sent again.",
        );
      assertReady(quote);
      return {
        ...quote,
        status: "submitting",
        lastError: undefined,
        events: [
          ...quote.events,
          { label: "Order submission started", at: new Date().toISOString() },
        ],
      };
    });
  }

  revise(ref: string, version: number): Quote {
    return this.change(ref, version, (quote) => {
      if (quote.status !== "accepted")
        throw new AppError(
          409,
          "Only an accepted, unsubmitted quote can be reopened.",
        );
      return {
        ...quote,
        status: "draft",
        acceptedBy: undefined,
        acceptedAt: undefined,
        lastError: undefined,
        events: [
          ...quote.events,
          {
            label: "Reopened as draft; customer acceptance must be reconfirmed",
            at: new Date().toISOString(),
          },
        ],
      };
    });
  }

  finishSubmission(ref: string, orderTrackingId: string): Quote {
    return this.change(ref, undefined, (quote) => {
      if (!["submitting", "review"].includes(quote.status))
        throw new AppError(
          409,
          "This order is not awaiting a submission result.",
        );
      const at = new Date().toISOString();
      return {
        ...quote,
        status: "submitted",
        orderTrackingId,
        submittedAt: at,
        lastError: undefined,
        events: [
          ...quote.events,
          { label: `Xcelerator order ${orderTrackingId} created`, at },
        ],
      };
    });
  }

  failSubmission(ref: string, message: string, uncertain: boolean): Quote {
    return this.change(ref, undefined, (quote) => {
      if (quote.status === "submitted") return quote;
      if (!["submitting", "review"].includes(quote.status))
        throw new AppError(409, "This quote is not awaiting an order result.");
      return {
        ...quote,
        status: uncertain ? "review" : "accepted",
        lastError: message,
        events: [
          ...quote.events,
          {
            label: uncertain
              ? "Submission needs reconciliation"
              : "Order not submitted",
            at: new Date().toISOString(),
          },
        ],
      };
    });
  }
}

let store: QuoteStore | undefined;
export function getQuoteStore() {
  if (!store)
    store = new QuoteStore(
      process.env.QUOTE_DB_PATH ||
        resolve(process.cwd(), ".data", "quotes.sqlite"),
    );
  return store;
}
