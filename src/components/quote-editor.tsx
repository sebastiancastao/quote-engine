"use client";
import { useState, type FormEvent } from "react";
import {
  blankQuote,
  money,
  totalCharges,
  type Quote,
  type QuoteInput,
  type Address,
} from "@/lib/quotes";
import { Icon } from "./icon";
import { Modal } from "./modal";

function localDate(iso: string) {
  if (!iso) return "";
  const d = new Date(iso),
    pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function AddressFields({
  label,
  value,
  onChange,
}: {
  label: string;
  value: Address;
  onChange: (value: Address) => void;
}) {
  return (
    <fieldset className="address-fields">
      <legend>
        <span
          className={`location-dot ${label === "Delivery" ? "destination" : ""}`}
        />
        {label}
      </legend>
      {(
        [
          ["name", "Company / location"],
          ["street", "Street address"],
        ] as const
      ).map(([field, text]) => (
        <label key={field}>
          {text}
          <input
            value={value[field]}
            onChange={(event) =>
              onChange({ ...value, [field]: event.target.value })
            }
            maxLength={200}
            placeholder={
              field === "name"
                ? `${label} location`
                : "Street and building number"
            }
            autoComplete="off"
          />
        </label>
      ))}
      <div className="address-city">
        <label>
          City
          <input
            value={value.city}
            onChange={(event) =>
              onChange({ ...value, city: event.target.value })
            }
            placeholder="City"
            maxLength={200}
          />
        </label>
        <label>
          State
          <input
            value={value.state}
            onChange={(event) =>
              onChange({ ...value, state: event.target.value })
            }
            placeholder="State"
            maxLength={200}
          />
        </label>
        <label>
          ZIP
          <input
            value={value.zip}
            onChange={(event) =>
              onChange({ ...value, zip: event.target.value })
            }
            placeholder="ZIP"
            maxLength={200}
          />
        </label>
      </div>
    </fieldset>
  );
}
export function QuoteEditor({
  quote,
  onClose,
  onSave,
}: {
  quote: Quote | null;
  onClose: () => void;
  onSave: (quote: Quote) => void;
}) {
  const [form, setForm] = useState<QuoteInput>(() =>
    quote ? structuredClone(quote) : blankQuote(),
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const set = <K extends keyof QuoteInput>(key: K, value: QuoteInput[K]) =>
    setForm((form) => ({ ...form, [key]: value }));
  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        quote ? `/api/quotes/${encodeURIComponent(quote.ref)}` : "/api/quotes",
        {
          method: quote ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...form,
            ...(quote ? { version: quote.version } : {}),
          }),
        },
      );
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error || "Could not save this quote.");
      onSave(body.quote);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Could not save this quote.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      onClose={onClose}
      label={quote ? `Edit ${quote.ref}` : "Create a new quote"}
      className="editor-modal"
      busy={busy}
    >
      <form onSubmit={save}>
        <header className="modal-header">
          <div>
            <span className="eyebrow">LET’S GET IT MOVING</span>
            <h2>{quote ? `Edit ${quote.ref}` : "Create a new quote"}</h2>
            <p>Save the details now. Turn acceptance into an order later.</p>
          </div>
          <button
            className="icon-button"
            type="button"
            onClick={onClose}
            aria-label="Close quote editor"
            disabled={busy}
          >
            <Icon name="close" />
          </button>
        </header>
        <div className="editor-body">
          {error ? (
            <div className="notice error" role="alert">
              {error}
            </div>
          ) : null}
          <section className="form-section">
            <h3>
              <span>01</span>Customer & reference
            </h3>
            <div className="form-grid">
              <label>
                Customer name <span className="required">*</span>
                <input
                  required
                  autoFocus
                  value={form.customer}
                  maxLength={200}
                  onChange={(e) => set("customer", e.target.value)}
                  placeholder="Company or customer name"
                />
              </label>
              <label>
                Customer email
                <input
                  type="email"
                  value={form.email}
                  maxLength={200}
                  onChange={(e) => set("email", e.target.value)}
                  placeholder="name@company.com"
                />
              </label>
              <label>
                REF number
                <input
                  value={form.ref || ""}
                  maxLength={40}
                  onChange={(e) => set("ref", e.target.value.toUpperCase())}
                  placeholder="Auto-generated when saved"
                  disabled={!!quote}
                />
                <span className="field-hint">
                  A unique reference to find this quote anytime.
                </span>
              </label>
              <label>
                Xcelerator account number
                <input
                  value={form.accountNo}
                  maxLength={200}
                  onChange={(e) => set("accountNo", e.target.value)}
                  placeholder="Customer’s account number"
                />
                <span className="field-hint">
                  Required before recording acceptance.
                </span>
              </label>
            </div>
          </section>
          <section className="form-section">
            <h3>
              <span>02</span>Shipment details
            </h3>
            <div className="form-grid address-grid">
              <AddressFields
                label="Pickup"
                value={form.pickup}
                onChange={(value) => set("pickup", value)}
              />
              <AddressFields
                label="Delivery"
                value={form.delivery}
                onChange={(value) => set("delivery", value)}
              />
            </div>
            <div className="form-grid timing-grid">
              {(
                [
                  ["pickupFrom", "Pickup window · from"],
                  ["pickupTo", "Pickup window · to"],
                  ["deliveryFrom", "Delivery window · from"],
                  ["deliveryTo", "Delivery window · to"],
                ] as const
              ).map(([field, label]) => (
                <label key={field}>
                  {label}
                  <input
                    type="datetime-local"
                    value={localDate(form[field])}
                    onChange={(e) =>
                      set(
                        field,
                        e.target.value
                          ? new Date(e.target.value).toISOString()
                          : "",
                      )
                    }
                  />
                </label>
              ))}
            </div>
            <p className="field-hint">
              Times use your local time zone. Pickup must finish before delivery
              begins.
            </p>
            <div className="form-grid service-grid">
              <label>
                Service
                <input
                  value={form.service}
                  maxLength={200}
                  onChange={(e) => set("service", e.target.value)}
                  placeholder="e.g. Same Day"
                />
              </label>
              <label>
                Vehicle
                <input
                  value={form.vehicle}
                  maxLength={200}
                  onChange={(e) => set("vehicle", e.target.value)}
                  placeholder="e.g. Cargo Van"
                />
              </label>
              <label>
                Package type
                <input
                  value={form.packageType}
                  maxLength={200}
                  onChange={(e) => set("packageType", e.target.value)}
                  placeholder="Box"
                />
              </label>
              <label>
                Pieces
                <input
                  type="number"
                  min="1"
                  max="10000"
                  step="1"
                  required
                  value={form.pieces}
                  onChange={(e) => set("pieces", Number(e.target.value))}
                />
              </label>
              <label>
                Total weight (lb)
                <input
                  type="number"
                  min="0"
                  max="10000"
                  step="0.01"
                  value={form.weight}
                  onChange={(e) => set("weight", Number(e.target.value))}
                />
              </label>
            </div>
            <p className="field-hint">
              Use the service, vehicle, and package names from your Xcelerator
              account.
            </p>
          </section>
          <section className="form-section">
            <h3>
              <span>03</span>Quote charges<small>USD</small>
            </h3>
            <div className="charge-labels">
              <span>Description</span>
              <span>Qty</span>
              <span>Rate</span>
              <span>Amount</span>
              <span />
            </div>
            {form.charges.map((charge, index) => (
              <div className="charge-row" key={index}>
                <input
                  aria-label={`Charge ${index + 1} description`}
                  required
                  value={charge.description}
                  maxLength={200}
                  onChange={(e) =>
                    set(
                      "charges",
                      form.charges.map((item, i) =>
                        i === index
                          ? { ...item, description: e.target.value }
                          : item,
                      ),
                    )
                  }
                />
                <input
                  aria-label={`Charge ${index + 1} quantity`}
                  type="number"
                  min="1"
                  max="10000"
                  required
                  value={charge.quantity}
                  onChange={(e) =>
                    set(
                      "charges",
                      form.charges.map((item, i) =>
                        i === index
                          ? { ...item, quantity: Number(e.target.value) }
                          : item,
                      ),
                    )
                  }
                />
                <div className="money-input">
                  <span>$</span>
                  <input
                    aria-label={`Charge ${index + 1} rate`}
                    type="number"
                    min="0"
                    max="1000000"
                    step="0.01"
                    required
                    value={charge.rateCents / 100}
                    onChange={(e) =>
                      set(
                        "charges",
                        form.charges.map((item, i) =>
                          i === index
                            ? {
                                ...item,
                                rateCents: Math.round(
                                  Number(e.target.value) * 100,
                                ),
                              }
                            : item,
                        ),
                      )
                    }
                  />
                </div>
                <span className="charge-amount">
                  {money(charge.quantity * charge.rateCents)}
                </span>
                <button
                  className="icon-button"
                  type="button"
                  aria-label={`Remove charge ${index + 1}`}
                  disabled={form.charges.length === 1}
                  onClick={() =>
                    set(
                      "charges",
                      form.charges.filter((_, i) => i !== index),
                    )
                  }
                >
                  <Icon name="close" size={15} />
                </button>
              </div>
            ))}
            <button
              type="button"
              className="text-button add-charge"
              disabled={form.charges.length >= 50}
              onClick={() =>
                set("charges", [
                  ...form.charges,
                  { description: "", quantity: 1, rateCents: 0 },
                ])
              }
            >
              <Icon name="plus" size={16} />
              Add a charge
            </button>
            <label className="notes-field">
              Notes & special instructions
              <textarea
                rows={3}
                value={form.notes}
                maxLength={4000}
                onChange={(e) => set("notes", e.target.value)}
                placeholder="Anything the customer or dispatch team should know…"
              />
            </label>
          </section>
        </div>
        <footer className="editor-footer">
          <div>
            <span>Quote total</span>
            <strong>
              {money(totalCharges(form.charges))}
              <small>USD</small>
            </strong>
          </div>
          <div className="button-group">
            <button
              type="button"
              className="button secondary"
              onClick={onClose}
              disabled={busy}
            >
              Cancel
            </button>
            <button className="button primary" disabled={busy}>
              <Icon
                name={busy ? "refresh" : "check"}
                size={17}
                className={busy ? "spin" : ""}
              />
              {busy ? "Saving…" : quote ? "Save changes" : "Save quote"}
            </button>
          </div>
        </footer>
      </form>
    </Modal>
  );
}
