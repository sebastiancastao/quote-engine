# ATL Medical Couriers 2026 pricing

Source: `ATL Rates 2026 Medical Couriers (1).pdf`, supplied by the user. Both pages were read and visually checked. The heading says 2026; both footers say “Rev. 1/01/2025”. The dry ice cost has its own 09/25/2026 date.

Source SHA-256: `c2b0eadd8620635dfa431caeebacb71a4fb874486ef64f812efbce4613f14384`.

The application stores the pricing inputs, sheet ID `atl-medical-2026-v1`, source hash, applied rules, and calculated amount with each quote. The server calculates the charges itself; posted line amounts or snapshot values cannot override them. Accepted quotes keep their saved calculation until deliberately reopened and accepted again.

## Vehicle rates

| Class                | Minimum | Mileage rate | Free waiting at EACH end | Extra waiting/min | Included weight | Extra weight/lb | After hours | Weekend | Holiday |
| -------------------- | ------: | -----------: | -----------------------: | ----------------: | --------------: | --------------: | ----------: | ------: | ------: |
| Small package        |  $38.00 |        $1.60 |                   15 min |             $0.49 |          100 lb |           $0.06 |         $20 |     $20 |     $50 |
| Cargo van            |  $59.00 |        $1.79 |                   15 min |             $0.49 |          100 lb |           $0.06 |         $20 |     $20 |     $50 |
| Cube / Sprinter      |  $99.50 |        $2.05 |                   15 min |             $0.50 |          100 lb |           $0.06 |         $20 |     $20 |     $50 |
| Straight / box truck | $250.00 |        $3.25 |                   60 min |             $0.90 |        2,000 lb |           $0.04 |         $50 |     $75 |    $100 |

The user explicitly confirmed these mileage formulas:

- Small package: `max($38.00, distance × $1.60)`.
- Vans/trucks: `minimum + max(0, distance − 20) × vehicle mileage rate`.

Distances are operator-entered route miles, not an automatically measured geographic radius. The first 20 miles are included for cargo, cube/Sprinter, and box truck classes. Monetary lines round to the nearest cent; miles and pounds are not rounded up.

Vehicle-specific waiting rates on page 1 take precedence over page 2's general $0.49/min waiting line, which conflicts for cube/Sprinter and box trucks. Free waiting at one end cannot offset waiting at the other.

Box-truck loads are limited to 9,000 lb, regardless of a posted capacity override. Actual cargo capacity must be entered for other vehicles because the sheet does not specify their limits. The weight field already present on the quote supplies the billable weight.

## Time and trip rules

- All calendar classification uses `America/New_York` (Atlanta), including daylight saving time. Date/time entry remains in the browser's local zone and is saved as an absolute timestamp.
- After hours applies once if pickup start OR delivery end falls in 19:01–05:59, inclusive by minute; 19:00 and 06:00 are excluded.
- Weekend fees apply once when the service window intersects a Saturday or Sunday. Holiday fees apply once when it intersects a named holiday. This interval interpretation is displayed in the calculator for review.
- Holidays are actual calendar dates: January 1, last Monday in May, July 4, first Monday in September, fourth Thursday in November, and December 25. Observed substitute days are not specified by the sheet and are not invented.
- Applicable after-hours, weekend, and holiday fees stack as separate flat additions. They are not charged again per endpoint or per day.
- Roundtrip is 150% of the one-way base and requires explicit confirmation that freight is carried in both directions. Return is 50% of the base. These multipliers do not multiply waiting, weight, or accessorials.
- The sheet has no explicit expiration clause. Service outside 2026 produces a visible validity warning. ASAP windows longer than 31 days require a separate quote.

## Accessorials

| Charge                   | Rule                                                                  |
| ------------------------ | --------------------------------------------------------------------- |
| Second airline counter   | $20                                                                   |
| Airport recovery attempt | $18 per additional attempt                                            |
| Full delivery attempt    | One additional one-way base price per attempt                         |
| MAWB / paperwork faxed   | $6                                                                    |
| Dry ice pickup           | $25 plus separately itemized ice cost                                 |
| Dry ice                  | $3.25/lb, dated 09/25/2026                                            |
| HazMat                   | $20                                                                   |
| Hold over and ship later | $20                                                                   |
| Dry ice replenishment    | $30; separately purchased ice is charged only when explicitly entered |
| Lift gate                | $50 per box truck                                                     |
| Pallet jack              | $15 per box truck                                                     |
| Second person / helper   | Enter the agreed hourly rate and hours; no rate is assumed            |

Dry ice pickup requires an entered ice weight because the sheet explicitly says “plus cost of ice”. Replenishment alone is $30; the sheet does not explicitly add an ice cost to that line. Purchased ice is added only when a weight is entered. Automatic ice pricing before 09/25/2026 is blocked because the sheet supplies no earlier ice price. Use a separately confirmed manual quote for historical ice pricing.

## Fuel surcharge: confirmation still needed

The sheet says to request current gas/diesel FSC. It gives neither a percentage nor a calculation basis. New rated quotes require an explicitly entered FSC, including an explicit 0 when waived, and a scope for any positive percentage:

- Transport charges: the trip-adjusted mileage base plus additional full delivery attempt charges.
- Entire pre-fuel subtotal: all charges before FSC, including accessorials.

The selected scope and computed FSC amount are saved with the quote. No external or assumed FSC rate is used. This remains a per-quote input until the user supplies a default rate and basis.

## Example checks

- Small package, 50 miles, ordinary weekday, within weight/wait allowances: $80 base. With an explicitly confirmed 10% transport-only FSC: **$88.00**.
- Cargo van, 30 miles: $59 + 10 × $1.79 = **$76.90**, before extras/FSC.
- Cube/Sprinter, 30 miles: $99.50 + 10 × $2.05 = **$120.00**, before extras/FSC.
- Box truck, 30 miles: $250 + 10 × $3.25 = **$282.50**, before extras/FSC.

These are verification examples calculated from the sheet, not examples printed in the original PDF. The rule engine is in `src/lib/atl-rates.ts`; coverage is in `tests/rates.test.ts`.
