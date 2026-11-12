import { AppError } from "./quotes";

export function json(value: unknown, status = 200): Response {
  return Response.json(value, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export function errorResponse(error: unknown): Response {
  if (error instanceof AppError)
    return json({ error: error.message }, error.status);
  console.error(
    "Quote workspace request failed:",
    error instanceof Error ? error.name : "Unknown error",
  );
  return json(
    {
      error:
        "The request could not be completed. Your existing quotes are preserved. Please try again.",
    },
    500,
  );
}

export async function readBody(
  request: Request,
): Promise<Record<string, unknown>> {
  const origin = request.headers.get("origin");
  if (origin) {
    let source: URL;
    try {
      source = new URL(origin);
    } catch {
      throw new AppError(403, "Invalid request origin.");
    }
    // Next can normalize request.url to localhost in development. The Host
    // header retains the browser-facing authority (e.g. 127.0.0.1:3100).
    const host = request.headers.get("host") || new URL(request.url).host;
    if (!["http:", "https:"].includes(source.protocol) || source.host !== host)
      throw new AppError(403, "Cross-origin changes are not allowed.");
  }
  if (!request.headers.get("content-type")?.includes("application/json"))
    throw new AppError(415, "Use JSON for this request.");
  const raw = await request.text();
  if (raw.length > 100_000) throw new AppError(413, "Quote data is too large.");
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    throw new AppError(400, "Invalid JSON.");
  }
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw new AppError(400, "Invalid request data.");
  return body as Record<string, unknown>;
}

export function versionFrom(body: Record<string, unknown>): number {
  if (!Number.isSafeInteger(body.version) || Number(body.version) < 1)
    throw new AppError(
      400,
      "A valid quote version is required. Refresh this quote.",
    );
  return Number(body.version);
}
