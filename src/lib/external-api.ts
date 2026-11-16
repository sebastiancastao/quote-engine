import { createHash, timingSafeEqual } from "node:crypto";
import { AppError } from "./quotes";
import { RateError } from "./atl-rates";
import { errorResponse } from "./http";

function authenticate(request: Request) {
  const key = process.env.QUOTE_API_KEY?.trim();
  if (!key || key.length < 32)
    throw new AppError(
      503,
      "External API is not configured. Set QUOTE_API_KEY to at least 32 characters.",
    );
  const bearer = /^Bearer ([^\s]+)$/i.exec(
    request.headers.get("authorization") || "",
  );
  const digest = (value: string) => createHash("sha256").update(value).digest();
  if (!bearer || !timingSafeEqual(digest(bearer[1]), digest(key)))
    throw new AppError(401, "A valid API bearer token is required.");
}

/** All external handlers pass through auth, CORS, and the same error boundary. */
export async function externalApi(
  request: Request,
  methods: readonly string[],
  handler: () => Response | Promise<Response>,
): Promise<Response> {
  const headers = new Headers({ "Cache-Control": "no-store", Vary: "Origin" });
  let response: Response;
  try {
    const origin = request.headers.get("origin");
    if (origin) {
      const allowed = (process.env.QUOTE_API_ALLOWED_ORIGINS || "")
        .split(",")
        .map((value) => value.trim())
        .filter((value) => /^https?:\/\//.test(value));
      if (!allowed.includes(origin))
        throw new AppError(403, "This origin is not allowed to call the API.");
      headers.set("Access-Control-Allow-Origin", origin);
      headers.set("Access-Control-Expose-Headers", "Location");
    }
    if (request.method === "OPTIONS") {
      const method = request.headers.get("access-control-request-method");
      if (method && !methods.includes(method))
        throw new AppError(405, "This method is not supported.");
      const requestedHeaders = (
        request.headers.get("access-control-request-headers") || ""
      )
        .split(",")
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean);
      if (
        requestedHeaders.some(
          (value) => !["authorization", "content-type"].includes(value),
        )
      )
        throw new AppError(403, "This request header is not allowed.");
      headers.set(
        "Access-Control-Allow-Methods",
        [...methods, "OPTIONS"].join(", "),
      );
      headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
      response = new Response(null, { status: 204 });
    } else {
      authenticate(request);
      response = await handler();
    }
  } catch (error) {
    response = errorResponse(
      error instanceof RateError ? new AppError(422, error.message) : error,
    );
    if (response.status === 401)
      headers.set("WWW-Authenticate", 'Bearer realm="Quote Engine"');
  }
  headers.forEach((value, name) => response.headers.set(name, value));
  return response;
}
