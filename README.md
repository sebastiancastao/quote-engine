# Quote Engine

A Next.js workspace for saving delivery quotes by REF, recording customer acceptance, and submitting an order to Xcelerator through AXIS.

## Run locally

Requires Node.js 22.13 or later with `node:sqlite` available (verified on Node 22.15).

```sh
npm install
npm run dev -- --hostname 127.0.0.1
```

Open http://localhost:3000. No Axis credentials are needed to create and save quotes.

## Quote workflow

1. Create a quote with a custom REF or leave REF blank for an automatic `REF-00001` reference.
2. Save it to the server. Search by REF, customer, or account to reopen it, including after a browser or server restart.
3. Mark the quote as sent after sharing it with the customer yourself. This action records status; it does not send an email.
4. Complete the account, addresses, service, vehicle, package, and pickup/delivery windows, then record the name of the customer who accepted.
5. Review and confirm order submission. The original REF is sent as `ClientRefNo`; a confirmed `OrderTrackingID` is saved on the quote.

Accepted quotes are locked. Reopening an unsubmitted quote clears acceptance and preserves the earlier acceptance in its activity history. Reconfirm acceptance after revising it.

Charges use integer cents and the total is calculated on the server. Versions reject stale edits, and database transactions prevent concurrent submission attempts. No sample quotes or simulated orders are added to the workspace.

## Axis configuration

Copy `.env.example` to `.env.local` and configure these **server-only** settings:

| Setting             | Value                                                                                    |
| ------------------- | ---------------------------------------------------------------------------------------- |
| `AXIS_BASE_URL`     | HTTPS Xcelerator application base URL, including a subdirectory if used, without `/Axis` |
| `AXIS_USERNAME`     | Axis-enabled caller login                                                                |
| `AXIS_PASSWORD`     | Caller password                                                                          |
| `AXIS_PACKAGE_MODE` | `counts` for `OrderPackages`, or `items` for individual scannable `OrderPackageItems`    |
| `QUOTE_DB_PATH`     | Optional SQLite file path; defaults to `.data/quotes.sqlite`                             |

Restart the server after changing settings, then use **Integrations → Test connection**. This authenticates and calls HelloWorld without creating an order. Credentials and tokens never enter client components or API responses.

The connector uses the vendor's password grant at `Axis/Login`, bearer authentication, and `Axis/v1/Order/SubmitOrders`. It loads the service, vehicle, and package catalogs before submission and resolves the chosen names against the caller's available types. The request follows the flat `OrderType`, `AccountNo`, `ServiceId`, `VehicleId`, `PCoName` / `DCoName` schema in the AXIS Partner Getting Started guide. Legacy instances with different catalog or request shapes must be adapted against their own Swagger before use.

**Live integration has not been tested against your instance.** Confirm its `Axis/Swagger` specification, account permissions, supported package mode, time-zone interpretation, and rate behavior in a sandbox before enabling live order entry.

The accepted USD quote amount is included in `SpecInstr` alongside the REF. The connector does **not** override Xcelerator's account rating or assume quoted and rated amounts are equal. A tenant-specific supported rate override must be implemented and verified if exact price synchronization is required.

References: [AXIS partner setup and downloadable API guides](https://keysoftwaresystems.atlassian.net/wiki/spaces/XKB/pages/595689546/AXIS+-+Connecting+with+your+Partner). The implementation also used the linked **Axis-GettingStarted Axis Partner.pdf**, **Required Fields.docx**, and **Hello_Axis_v1.0.zip**. Verify the current instance contract at `https://YOUR-XCELERATOR-BASE/Axis/Swagger`.

## Uncertain submission results

Once an order POST has been attempted, a timeout, unrecognized confirmation, or server error may mean an order was created. Such quotes enter **Needs review** and cannot be submitted again. **Check Xcelerator** reads open and completed orders, matching the exact REF, and confirms the result only when exactly one distinct order number is found. A submission interrupted by a server restart stays blocked and can be reconciled after one minute. Zero or multiple matches require manual review in Xcelerator; the application does not automatically retry a creation request.

Authentication/catalog errors before creation and definite validation/auth rejections return the quote to Accepted so the connection can be corrected and retried. No order is labeled Submitted without a confirmed tracking number.

## Storage and hosting

Quotes are stored in a SQLite file on this server, shared by browsers using this instance. They are not stored in browser localStorage. Back up the database with SQLite's online backup API, or stop the server and copy the database together with any `-wal` / `-shm` files.

This checkout is a local/trusted-workspace application without user authentication. Before exposing it to the internet, add workspace authentication and authorization. Run it on a single Node.js host with a persistent disk, or replace the store with a managed database before deploying to a stateless/serverless host. Ephemeral deployment filesystems will not preserve these records. Never commit `.data`, `.env.local`, or credentials.

## Verification

```sh
npm run lint
npm test
npm run build
npm run test:e2e
```

Unit/integration tests cover persistence across store restarts, REF collisions, stale edits, acceptance locking, validated amounts/dates, concurrent submission, ambiguous outcomes, and the documented Axis HTTP contract using test-only fake responses. Browser tests use Microsoft Edge on desktop and a mobile viewport, a separate temporary database, and empty Axis configuration. They create, reopen, accept, revise, and search real saved quotes without sending external orders. They do not touch the workspace database. Screenshots are written to `.artifacts/`.
