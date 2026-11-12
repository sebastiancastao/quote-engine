"use client";
import { useState } from "react";
import { money, statusLabels, type Quote, type AxisStatus } from "@/lib/quotes";
import { Icon } from "./icon";
import { Modal } from "./modal";
const dateTime = (value: string) =>
  value
    ? new Date(value).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "Not scheduled";
export function StatusBadge({ status }: { status: Quote["status"] }) {
  return (
    <span className={`status-badge status-${status}`}>
      <span />
      {statusLabels[status]}
    </span>
  );
}
export function QuoteDetail({
  quote,
  axis,
  onClose,
  onEdit,
  onAction,
  onSetup,
}: {
  quote: Quote;
  axis: AxisStatus;
  onClose: () => void;
  onEdit: (quote: Quote) => void;
  onAction: (
    quote: Quote,
    action: string,
    extra?: Record<string, unknown>,
  ) => Promise<Quote>;
  onSetup: () => void;
}) {
  const [mode, setMode] = useState<"view" | "accept" | "submit" | "revise">(
    "view",
  );
  const [acceptedBy, setAcceptedBy] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const editable = ["draft", "sent"].includes(quote.status);
  async function act(action: string, extra?: Record<string, unknown>) {
    setBusy(true);
    setError("");
    try {
      const updated = await onAction(quote, action, extra);
      setMode("view");
      if (action === "revise") onEdit(updated);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "The action could not be completed.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      onClose={onClose}
      label={`Quote ${quote.ref}`}
      className="detail-modal"
      busy={busy}
    >
      <header className="modal-header">
        <div>
          <span className="eyebrow">QUOTE DETAILS</span>
          <h2>{quote.ref}</h2>
          <StatusBadge status={quote.status} />
        </div>
        <div className="button-group">
          <button
            className="icon-button"
            aria-label="Print quote"
            onClick={() => window.print()}
          >
            <Icon name="print" />
          </button>
          <button
            className="icon-button"
            aria-label="Close quote details"
            onClick={onClose}
            disabled={busy}
          >
            <Icon name="close" />
          </button>
        </div>
      </header>
      <div className="detail-body">
        {error ? (
          <div className="notice error" role="alert">
            {error}
          </div>
        ) : null}
        {quote.lastError && !error ? (
          <div className="notice warning">{quote.lastError}</div>
        ) : null}
        {quote.status === "submitted" ? (
          <div className="order-success">
            <span className="success-icon">
              <Icon name="check" />
            </span>
            <div>
              <strong>From quote to order. All set.</strong>
              <p>
                Xcelerator order <b>{quote.orderTrackingId}</b>
              </p>
            </div>
          </div>
        ) : null}
        <section className="detail-customer">
          <span className="customer-avatar">
            {quote.customer.slice(0, 2).toUpperCase()}
          </span>
          <div>
            <h3>{quote.customer}</h3>
            <p>{quote.email || "No email added"}</p>
          </div>
        </section>
        <div className="detail-metadata">
          <div>
            <span>Account number</span>
            <strong>{quote.accountNo || "Not added"}</strong>
          </div>
          <div>
            <span>Created</span>
            <strong>
              {new Date(quote.createdAt).toLocaleDateString(undefined, {
                dateStyle: "medium",
              })}
            </strong>
          </div>
          <div>
            <span>Service</span>
            <strong>{quote.service || "Not selected"}</strong>
          </div>
          <div>
            <span>Vehicle</span>
            <strong>{quote.vehicle || "Not selected"}</strong>
          </div>
        </div>
        <section className="detail-section">
          <h3>Shipment route</h3>
          <div className="route-details">
            {(["pickup", "delivery"] as const).map((key) => (
              <div className="route-stop" key={key}>
                <span
                  className={`location-dot ${key === "delivery" ? "destination" : ""}`}
                />
                <div>
                  <span className="stop-label">
                    {key === "pickup" ? "PICKUP" : "DELIVERY"}
                  </span>
                  <strong>{quote[key].name || "Location not added"}</strong>
                  <p>
                    {[
                      quote[key].street,
                      [quote[key].city, quote[key].state, quote[key].zip]
                        .filter(Boolean)
                        .join(", "),
                    ]
                      .filter(Boolean)
                      .join(" · ") || "Complete the address before acceptance"}
                  </p>
                  <p className="route-time">
                    <Icon name="clock" size={13} />
                    {dateTime(
                      key === "pickup" ? quote.pickupFrom : quote.deliveryFrom,
                    )}
                    <br />
                    to{" "}
                    {dateTime(
                      key === "pickup" ? quote.pickupTo : quote.deliveryTo,
                    )}
                  </p>
                </div>
              </div>
            ))}
          </div>
          <div className="package-summary">
            <Icon name="orders" size={18} />
            <span>
              {quote.pieces} {quote.packageType || "package"}
              {quote.pieces !== 1 ? "s" : ""}
            </span>
            <span className="separator-dot">·</span>
            <span>{quote.weight} lb total</span>
          </div>
        </section>
        <section className="detail-section">
          <h3>
            Quote breakdown<span>USD</span>
          </h3>
          <div className="price-lines">
            {quote.charges.map((charge, index) => (
              <div key={index}>
                <span>
                  {charge.description}
                  {charge.quantity > 1 ? (
                    <small>
                      {charge.quantity} × {money(charge.rateCents)}
                    </small>
                  ) : null}
                </span>
                <strong>{money(charge.quantity * charge.rateCents)}</strong>
              </div>
            ))}
          </div>
          <div className="detail-total">
            <span>Quote total</span>
            <strong>{money(quote.totalCents)}</strong>
          </div>
        </section>
        {quote.notes ? (
          <section className="detail-section">
            <h3>Notes & instructions</h3>
            <p className="notes-text">{quote.notes}</p>
          </section>
        ) : null}
        <section className="detail-section activity-section">
          <h3>Activity</h3>
          <ol className="activity-list">
            {quote.events.toReversed().map((event, index) => (
              <li key={`${event.at}-${index}`}>
                <span className="activity-dot" />
                <div>
                  <strong>{event.label}</strong>
                  <time dateTime={event.at}>{dateTime(event.at)}</time>
                </div>
              </li>
            ))}
          </ol>
        </section>
        {mode === "accept" ? (
          <form
            className="action-panel"
            onSubmit={(event) => {
              event.preventDefault();
              void act("accept", { acceptedBy });
            }}
          >
            <h3>Record customer acceptance</h3>
            <p>
              Confirm that the customer agreed to this quote. The price and
              shipment details will be locked.
            </p>
            <label>
              Accepted by
              <input
                autoFocus
                required
                value={acceptedBy}
                maxLength={200}
                onChange={(e) => setAcceptedBy(e.target.value)}
                placeholder="Customer’s full name"
              />
            </label>
            <div className="button-group">
              <button
                className="button secondary"
                type="button"
                onClick={() => setMode("view")}
                disabled={busy}
              >
                Cancel
              </button>
              <button className="button primary" disabled={busy}>
                {busy ? "Recording…" : "Confirm acceptance"}
                <Icon name="check" size={16} />
              </button>
            </div>
          </form>
        ) : null}
        {mode === "submit" ? (
          <section className="action-panel">
            <h3>Submit this order to Xcelerator?</h3>
            <p>
              {quote.ref} and its shipment details will be sent through Axis.
              The confirmed Xcelerator order number will be saved here.
            </p>
            <p className="rating-note">
              The accepted {money(quote.totalCents)} amount is included in order
              instructions. Xcelerator applies its account pricing; this
              connection does not override its charges.
            </p>
            <div className="button-group">
              <button
                className="button secondary"
                onClick={() => setMode("view")}
                disabled={busy}
              >
                Cancel
              </button>
              <button
                className="button primary"
                onClick={() => void act("submit", { confirm: true })}
                disabled={busy}
              >
                {busy ? "Submitting…" : "Confirm & submit"}
                <Icon name="arrow" size={16} />
              </button>
            </div>
          </section>
        ) : null}
        {mode === "revise" ? (
          <section className="action-panel">
            <h3>Reopen this quote as a draft?</h3>
            <p>
              This clears the current acceptance. Have the customer accept the
              revised quote before ordering. Earlier acceptance stays in
              activity.
            </p>
            <div className="button-group">
              <button
                className="button secondary"
                onClick={() => setMode("view")}
                disabled={busy}
              >
                Cancel
              </button>
              <button
                className="button primary"
                onClick={() => void act("revise")}
                disabled={busy}
              >
                Reopen & edit
              </button>
            </div>
          </section>
        ) : null}
      </div>
      {mode === "view" ? (
        <footer className="detail-footer">
          {editable ? (
            <>
              <button
                className="button secondary"
                onClick={() => onEdit(quote)}
                disabled={busy}
              >
                <Icon name="edit" size={16} />
                Edit quote
              </button>
              <div className="button-group">
                {quote.status === "draft" ? (
                  <button
                    className="button secondary"
                    onClick={() => void act("sent")}
                    disabled={busy}
                  >
                    Mark as sent
                  </button>
                ) : null}
                <button
                  className="button primary"
                  onClick={() => setMode("accept")}
                  disabled={busy}
                >
                  <Icon name="check" size={16} />
                  Record acceptance
                </button>
              </div>
            </>
          ) : null}
          {quote.status === "accepted" ? (
            <>
              <button className="text-button" onClick={() => setMode("revise")}>
                Revise quote
              </button>
              {axis.configured ? (
                <button
                  className="button primary"
                  onClick={() => setMode("submit")}
                >
                  <Icon name="send" size={16} />
                  Submit to Xcelerator
                </button>
              ) : (
                <button className="button primary" onClick={onSetup}>
                  <Icon name="link" size={16} />
                  Set up Axis to submit
                </button>
              )}
            </>
          ) : null}
          {["review", "submitting"].includes(quote.status) ? (
            <>
              <span className="footer-note">
                Reconcile before trying another submission.
              </span>
              <button
                className="button primary"
                onClick={() => void act("reconcile")}
                disabled={busy}
              >
                <Icon name="refresh" size={16} className={busy ? "spin" : ""} />
                {busy ? "Checking…" : "Check Xcelerator"}
              </button>
            </>
          ) : null}
          {quote.status === "submitted" ? (
            <>
              <span className="footer-note">
                <Icon name="shield" size={16} />
                Saved with the original REF
              </span>
              <button className="button secondary" onClick={onClose}>
                Done
                <Icon name="check" size={16} />
              </button>
            </>
          ) : null}
        </footer>
      ) : null}
    </Modal>
  );
}
