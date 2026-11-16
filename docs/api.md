# External API v1

Other applications can calculate rates and manage the same quotes shown in the workspace. The production app is [Quote Engine](https://quote-engine-theta.vercel.app/). All data endpoints require authentication. Responses are JSON and use `Cache-Control: no-store`.

| Environment | API base URL |
| --- | --- |
| Production | `https://quote-engine-theta.vercel.app/api/v1` |
| Local development | `http://localhost:3000/api/v1` |

The examples below use the production API base URL.

## Enable access

Generate a key:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Set `QUOTE_API_KEY` in `.env.local` to that value, then restart Next.js. The API returns `503` when the key is empty or shorter than 32 characters. Keep the key in the calling application's server configuration and send it in the header:

```http
Authorization: Bearer YOUR_API_KEY
```

The key grants access to all quotes and quote actions in this workspace. Rotate it by changing `QUOTE_API_KEY` and restarting the app. Keys are not accepted in query strings.

For browser clients, set `QUOTE_API_ALLOWED_ORIGINS` to comma-separated exact origins, such as `https://dispatch.example.com,http://localhost:5173`, with no trailing slash. Requests with an `Origin` header must match an entry. `OPTIONS` preflight needs no token, but actual requests always do. Allowed request headers are `Authorization` and `Content-Type`; browser cookies are not used. Server-to-server requests without `Origin` need no origin configuration. Prefer calling from your app's backend to keep the shared key private.

These settings protect `/api/v1` only. The existing workspace and `/api/quotes` and `/api/integrations/axis` routes remain a trusted local application without user authentication. For a remote integration, use a persistent Node.js host and an HTTPS reverse proxy that exposes only `/api/v1`, with the workspace on a private network or behind separate workspace authentication. This API does not make the entire workspace safe to publish. SQLite requires a persistent disk and a single app instance.

## Endpoints

| Method | Path (under `/api/v1`) | Result |
| --- | --- | --- |
| GET | `/rates` | Rate sheet, vehicle profiles, currency, and complete `pricingDefaults` |
| POST | `/rates/calculate` | Calculate without saving a quote or creating an order |
| GET | `/quotes` | List/search saved quotes |
| POST | `/quotes` | Create a draft; `201`, `{ "quote": ... }`, and a `Location` header |
| GET | `/quotes/{ref}` | `{ "quote": ... }`; REF lookup is case insensitive |
| PATCH | `/quotes/{ref}` | Update fields on an editable quote; requires current `version` |
| POST | `/quotes/{ref}/actions` | Record sent/accepted/revised state, submit, or reconcile |

`GET /quotes` accepts `search` (case-insensitive substring of REF, customer, or account), `status`, `limit` (1–100, default 50), and `offset` (nonnegative integer, default 0). Status is one of `draft`, `sent`, `accepted`, `submitting`, `submitted`, `review`. Results are ordered by creation time, newest first:

```json
{ "quotes": [], "total": 0, "limit": 50, "offset": 0 }
```

`total` counts matches before pagination. Offset pagination is a live view, so concurrent creates can move records between pages. Filtering currently reads the local store into memory, suitable for this single-instance workspace.

## Calculate a rate from another app

This Node.js example gets all supported pricing fields, supplies the required route/capacity/FSC inputs, and calculates a cargo-van shipment. It does not save a quote.

```js
const base = "https://quote-engine-theta.vercel.app/api/v1";
const headers = {
  Authorization: `Bearer ${process.env.QUOTE_API_KEY}`,
  "Content-Type": "application/json",
};

async function api(path, options = {}) {
  const response = await fetch(`${base}${path}`, { ...options, headers });
  const body = await response.json();
  if (!response.ok) throw new Error(`${response.status}: ${body.error}`);
  return body;
}

const { pricingDefaults } = await api("/rates");
const pricing = {
  ...pricingDefaults,
  vehicleClass: "cargo-van",
  miles: 30,
  vehicleCapacityLb: 1500,
  fuelPercent: 10,       // Use the confirmed current FSC, including explicit 0.
  fuelBasis: "transport", // Or "subtotal", as confirmed for your account.
};

const rate = await api("/rates/calculate", {
  method: "POST",
  body: JSON.stringify({
    pricing,
    shipment: {
      weight: 20,
      start: "2026-12-01T15:00:00Z",
      end: "2026-12-01T17:00:00Z",
    },
  }),
});
console.log(rate.totalCents); // 8459 ($84.59)
```

The response includes `currency`, `totalCents`, normalized pricing `input`, `charges`, and the rate `snapshot` with surcharge details and warnings. All amounts are integer USD cents, weight/capacity use pounds, distance uses miles, and waiting uses whole minutes. Dates must include `Z` or an explicit UTC offset. Calendar surcharges use America/New_York. The sheet is labeled 2026; read `snapshot.warnings` for dates outside that year.

Vehicle classes are `small-package`, `cargo-van`, `cube-sprinter`, and `box-truck`. Get `/rates` for current profiles and the full supported pricing object, including accessorials. See [rate-sheet rules](atl-rate-sheet.md) for formulas and assumptions.

## Save a quote

Send a complete editable quote object when creating. Omit `ref` for automatic `REF-00001` style numbering, or supply a unique REF of 3–40 letters, numbers, dots, dashes, or underscores, starting with a letter or number. A caller-supplied REF is a useful retry identifier: if creation times out, get that REF to check whether it was saved. Reposting the same REF returns `409` and never overwrites it. Creates without an explicit REF are not idempotent.

```sh
curl https://quote-engine-theta.vercel.app/api/v1/quotes \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  --data @quote.json
```

Example `quote.json` with manual charges:

```json
{
  "ref": "PARTNER-1001",
  "customer": "Northstar Medical",
  "email": "dispatch@example.com",
  "accountNo": "AC-100",
  "service": "Same Day",
  "vehicle": "Cargo Van",
  "packageType": "Box",
  "pieces": 2,
  "weight": 20,
  "pickup": {
    "name": "Main warehouse", "street": "10 Industrial Way",
    "city": "Newark", "state": "NJ", "zip": "07102"
  },
  "delivery": {
    "name": "Central hospital", "street": "20 First Street",
    "city": "Jersey City", "state": "NJ", "zip": "07302"
  },
  "pickupFrom": "2026-12-01T13:00:00Z",
  "pickupTo": "2026-12-01T14:00:00Z",
  "deliveryFrom": "2026-12-01T15:00:00Z",
  "deliveryTo": "2026-12-01T16:00:00Z",
  "charges": [{ "description": "Delivery", "quantity": 1, "rateCents": 12995 }],
  "notes": "Call dispatch on arrival."
}
```

For rate-sheet quotes, include the full `pricing` object used above. The server recalculates charges from `pricing`, `weight`, `pickupFrom`, and `deliveryTo`, ignoring caller-supplied totals. Responses include `totalCents`, `status`, `version`, timestamps, history `events`, and `rateSnapshot` when applicable. Creating a quote never records customer acceptance or creates an AXIS order. Server-owned status, totals, timestamps, and versions cannot be set through create/update input.

## Update and act on quotes

Use the latest `quote.version` returned by the API. A stale version returns `409`; fetch again and review the changes before retrying. PATCH changes only top-level fields supplied in the body. Address objects and charge arrays replace their entire field, so provide the complete address or array. `pricing` also replaces the full pricing object; use `pricing: null` plus `charges` to switch to manual pricing. A saved REF cannot change.

```sh
curl -X PATCH https://quote-engine-theta.vercel.app/api/v1/quotes/PARTNER-1001 \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  --data '{"version":1,"notes":"Use the loading entrance."}'
```

Send commands to `POST /quotes/{ref}/actions`:

| Action | Example body | Behavior |
| --- | --- | --- |
| Mark sent | `{ "action": "sent", "version": 2 }` | Records that you shared the quote; does not send email |
| Record acceptance | `{ "action": "accept", "version": 3, "acceptedBy": "Alex Smith" }` | Validates required order details and locks the quote |
| Reopen | `{ "action": "revise", "version": 4 }` | Reopens an accepted, unsubmitted quote; acceptance must be reconfirmed |
| Submit order | `{ "action": "submit", "version": 4, "confirm": true }` | Creates a real AXIS order for an accepted quote when AXIS is configured |
| Reconcile | `{ "action": "reconcile", "version": 6 }` | Looks up an uncertain submission by exact REF |

Every successful action returns `{ "quote": ... }` with its latest version. Submitted quotes return their existing confirmed order on a repeated submit request. Reconciliation requires a positive version field for request compatibility, but operates on the latest uncertain submission. A submission still in progress cannot reconcile until one minute has passed.

An AXIS timeout can leave a quote in `review`. GET the quote after any submission error or client timeout; use reconciliation for `review` or an interrupted `submitting` state. Do not recreate a quote under a new REF to retry an uncertain order. See the [AXIS setup and uncertain-outcome workflow](../README.md) before enabling real order submission. Rate calculation does not require AXIS configuration.

## Errors

Errors use `{ "error": "Human-readable message" }`. JSON request bodies must be objects, use `Content-Type: application/json`, and contain at most 100,000 UTF-8 bytes.

| Status | Meaning |
| --- | --- |
| 400 | Malformed input, missing version, or missing explicit submission confirmation |
| 401 | Missing/invalid bearer key |
| 403 | Origin or preflight header denied |
| 404 | REF not found |
| 409 | Duplicate REF, stale version, locked quote, or invalid workflow state |
| 413 | Request body too large |
| 415 | Content type is not JSON |
| 422 | Invalid pricing or incomplete order details |
| 500 | Unexpected internal error; details are not exposed |
| 502 | AXIS gateway error; check quote state before any retry |
| 503 | API key or required AXIS configuration is missing |

Unsupported methods return `405` (Next.js may return an empty body). No API endpoint deletes quotes or bypasses the acceptance/submission safeguards.
