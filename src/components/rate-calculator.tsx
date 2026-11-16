"use client";

import {
  ATL_SHEET,
  ATL_VEHICLES,
  type AtlPricingInput,
  type calculateAtlRate,
} from "@/lib/atl-rates";
import { money } from "@/lib/quotes";
import { Icon } from "./icon";

export function RateCalculator({
  input,
  onChange,
  result,
  error,
}: {
  input: AtlPricingInput;
  onChange: (input: AtlPricingInput) => void;
  result: ReturnType<typeof calculateAtlRate> | null;
  error: string;
}) {
  const profile = ATL_VEHICLES[input.vehicleClass];
  const set = <K extends keyof AtlPricingInput>(
    key: K,
    value: AtlPricingInput[K],
  ) => onChange({ ...input, [key]: value });
  const numeric = (value: string) => (value === "" ? null : Number(value));
  const truck = input.vehicleClass === "box-truck";
  const optionalFees = [
    ["secondAirlineCounter", "Second airline counter", 2000],
    ["paperworkFaxed", "MAWB / paperwork faxed", 600],
    ["dryIcePickup", "Dry ice pickup", 2500],
    ["dryIceReplenish", "Dry ice replenishment", 3000],
    ["hazmat", "HazMat fee", 2000],
    ["holdOver", "Hold over and ship later", 2000],
    ...(truck
      ? ([
          ["liftGate", "Lift gate · per truck", 5000],
          ["palletJack", "Pallet jack · per truck", 1500],
        ] as const)
      : []),
  ] as const;

  return (
    <div className="rate-calculator">
      <div className="rate-sheet-heading">
        <span className="stat-icon blue">
          <Icon name="dollar" size={18} />
        </span>
        <div>
          <strong>{ATL_SHEET.title}</strong>
          <p>Rates from your uploaded sheet · USD · Atlanta local time</p>
        </div>
        <span className="rate-version">2026 · v1</span>
      </div>
      <div className="form-grid rate-main-fields">
        <label>
          Rate vehicle class
          <select
            aria-label="Rate vehicle class"
            value={input.vehicleClass}
            onChange={(event) =>
              onChange({
                ...input,
                vehicleClass: event.target
                  .value as AtlPricingInput["vehicleClass"],
                ...(event.target.value !== "box-truck"
                  ? {
                      liftGate: false,
                      palletJack: false,
                      helperHours: 0,
                      helperHourlyRateCents: null,
                    }
                  : {}),
              })
            }
          >
            {Object.entries(ATL_VEHICLES).map(([key, vehicle]) => (
              <option key={key} value={key}>
                {vehicle.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Route distance (miles)
          <input
            type="number"
            min="0"
            max="10000"
            step="0.01"
            required
            value={input.miles ?? ""}
            placeholder="Enter actual route miles"
            onChange={(event) => set("miles", numeric(event.target.value))}
          />
        </label>
        <label>
          Mileage formula
          <input
            readOnly
            value={
              input.vehicleClass === "small-package"
                ? "Greater of $38 or miles × $1.60"
                : `${money(profile.minimum)} includes 20 mi; ${money(profile.perMile)}/extra mi`
            }
          />
          <span className="field-hint">
            Confirmed for this rate sheet. Distance is entered above.
          </span>
        </label>
        <label>
          Trip type
          <select
            value={input.trip}
            onChange={(event) =>
              set("trip", event.target.value as AtlPricingInput["trip"])
            }
          >
            <option value="one-way">One way · 100% of base</option>
            <option value="roundtrip">Roundtrip · 150% of base</option>
            <option value="return">Return · 50% of base</option>
          </select>
        </label>
        <label>
          Vehicle cargo capacity (lb)
          <input
            type="number"
            min="0.01"
            max="10000"
            step="0.01"
            required
            value={truck ? 9000 : (input.vehicleCapacityLb ?? "")}
            disabled={truck}
            placeholder="Actual rated vehicle capacity"
            onChange={(event) =>
              set("vehicleCapacityLb", numeric(event.target.value))
            }
          />
          <span className="field-hint">
            {truck
              ? "Box trucks have a 9,000 lb maximum in this sheet."
              : "Use the actual vehicle capacity; the sheet does not give a maximum."}
          </span>
        </label>
        <div className="rate-profile-summary">
          <strong>
            {money(profile.minimum)} minimum · {money(profile.perMile)}/mile
          </strong>
          <span>
            {profile.freeWait} free waiting minutes at each end, then{" "}
            {money(profile.perWaitMinute)}/minute.
          </span>
          <span>
            {profile.freeWeight.toLocaleString()} lb included, then{" "}
            {money(profile.perPound)}/lb.
          </span>
        </div>
      </div>
      {input.trip === "roundtrip" ? (
        <label className="rate-checkbox roundtrip-check">
          <input
            type="checkbox"
            checked={input.loadedBothWays}
            onChange={(event) => set("loadedBothWays", event.target.checked)}
          />
          <span>
            Freight is carried in both directions, as required for the 150%
            roundtrip rate.
          </span>
        </label>
      ) : null}
      <div className="form-grid rate-main-fields">
        <label>
          Pickup waiting (minutes)
          <input
            type="number"
            min="0"
            max="10080"
            step="1"
            value={input.pickupWaitMinutes}
            onChange={(event) =>
              set("pickupWaitMinutes", Number(event.target.value))
            }
          />
        </label>
        <label>
          Delivery waiting (minutes)
          <input
            type="number"
            min="0"
            max="10080"
            step="1"
            value={input.deliveryWaitMinutes}
            onChange={(event) =>
              set("deliveryWaitMinutes", Number(event.target.value))
            }
          />
        </label>
        <label>
          Confirmed FSC (%)
          <input
            type="number"
            min="0"
            max="1000"
            step="0.01"
            required
            value={input.fuelPercent ?? ""}
            placeholder="Current fuel surcharge"
            onChange={(event) =>
              set("fuelPercent", numeric(event.target.value))
            }
          />
          <span className="field-hint">
            Not supplied by the sheet. Enter 0 only when a zero FSC is
            confirmed.
          </span>
        </label>
        <label>
          Fuel surcharge applies to
          <select
            aria-label="Fuel surcharge applies to"
            required={input.fuelPercent !== 0}
            value={input.fuelBasis ?? ""}
            onChange={(event) =>
              set(
                "fuelBasis",
                (event.target.value || null) as AtlPricingInput["fuelBasis"],
              )
            }
          >
            <option value="">Confirm the FSC basis…</option>
            <option value="transport">Transport charges only</option>
            <option value="subtotal">Entire pre-fuel subtotal</option>
          </select>
          <span className="field-hint">
            Transport includes trip pricing and additional full delivery
            attempts.
          </span>
        </label>
      </div>
      <details className="rate-extras">
        <summary>
          <span>
            <Icon name="plus" size={15} />
            Accessorials & special handling
          </span>
          <span>Optional charges</span>
        </summary>
        <div className="rate-extras-body">
          <div className="rate-options">
            {optionalFees.map(([key, label, cents]) => (
              <label className="rate-checkbox" key={key}>
                <input
                  type="checkbox"
                  checked={input[key]}
                  onChange={(event) => set(key, event.target.checked)}
                />
                <span>{label}</span>
                <strong>{money(cents)}</strong>
              </label>
            ))}
          </div>
          <div className="form-grid">
            <label>
              Airport recovery attempts
              <input
                type="number"
                min="0"
                max="10"
                step="1"
                value={input.airportRecoveryAttempts}
                onChange={(event) =>
                  set("airportRecoveryAttempts", Number(event.target.value))
                }
              />
              <span className="field-hint">$18.00 per attempt.</span>
            </label>
            <label>
              Additional full delivery attempts
              <input
                type="number"
                min="0"
                max="10"
                step="1"
                value={input.additionalDeliveryAttempts}
                onChange={(event) =>
                  set("additionalDeliveryAttempts", Number(event.target.value))
                }
              />
              <span className="field-hint">
                One additional one-way base price per attempt.
              </span>
            </label>
            <label>
              Dry ice purchased (lb)
              <input
                type="number"
                min="0"
                max="1000"
                step="0.01"
                value={input.dryIcePounds}
                onChange={(event) =>
                  set("dryIcePounds", Number(event.target.value))
                }
              />
              <span className="field-hint">
                $3.25/lb, dated 09/25/2026. Required with pickup. Enter for
                replenishment only when ice is charged separately.
              </span>
            </label>
            {truck ? (
              <>
                <label>
                  Second person / helper hours
                  <input
                    type="number"
                    min="0"
                    max="168"
                    step="0.01"
                    value={input.helperHours}
                    onChange={(event) =>
                      set("helperHours", Number(event.target.value))
                    }
                  />
                  <span className="field-hint">Quote-only hourly service.</span>
                </label>
                <label>
                  Quoted helper hourly rate ($)
                  <input
                    type="number"
                    min="0"
                    max="1000000"
                    step="0.01"
                    value={
                      input.helperHourlyRateCents === null
                        ? ""
                        : input.helperHourlyRateCents / 100
                    }
                    onChange={(event) =>
                      set(
                        "helperHourlyRateCents",
                        event.target.value === ""
                          ? null
                          : Math.round(Number(event.target.value) * 100),
                      )
                    }
                    placeholder="Enter the agreed hourly rate"
                  />
                </label>
              </>
            ) : null}
          </div>
        </div>
      </details>
      <div className="rate-calendar-note">
        <Icon name="clock" size={16} />
        <p>
          After hours checks pickup start and delivery end in Atlanta
          (19:01–05:59). Weekend and named-holiday fees apply once when the
          service window overlaps those dates. Applicable surcharges stack.
        </p>
      </div>
      {result ? (
        <div className="rate-preview">
          <div className="rate-preview-heading">
            <strong>Calculated quote</strong>
            <span>Recalculated on the server when saved</span>
          </div>
          {result.charges.map((charge, index) => (
            <div className="rate-preview-line" key={index}>
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
          <div className="rate-preview-total">
            <strong>Total</strong>
            <strong>{money(result.snapshot.totalCents)}</strong>
          </div>
          {result.snapshot.warnings.map((warning) => (
            <p className="rate-warning" key={warning}>
              {warning}
            </p>
          ))}
        </div>
      ) : (
        <div className="rate-incomplete" role="status">
          <Icon name="help" size={17} />
          <span>{error}</span>
        </div>
      )}
      <details className="rate-rule-notes">
        <summary>How this sheet is applied</summary>
        <ul>
          <li>
            Waiting allowances apply separately at pickup and delivery.
            Vehicle-specific page 1 waiting rates take precedence over page 2’s
            general waiting line.
          </li>
          <li>
            Roundtrip and return percentages change only the mileage base.
            Accessorials are added separately.
          </li>
          <li>
            Holidays use actual dates for New Year’s Day, Memorial Day, July 4,
            Labor Day, Thanksgiving, and Christmas; observed replacement days
            are not added.
          </li>
          <li>
            Distance and weight use the entered values, without rounding up
            miles or pounds. Each monetary line is rounded to cents.
          </li>
        </ul>
      </details>
    </div>
  );
}
