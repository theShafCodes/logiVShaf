/** Stage 5 domain types — routing and pricing output shapes. */

export interface Route {
  readonly origin: string;
  readonly destination: string;
  readonly distanceMiles: number;
  readonly durationSeconds: number;
}

export interface QuoteLineItem {
  readonly label: string;
  readonly amount: number;
}

/** One vehicle in a multi-van quote. `description` is the brand-free capability
 *  string; `id`/`label` are carried for the dedicated fleet-reference table. */
export interface QuoteVan {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly perMileRate: number;
  /** route.distanceMiles × perMileRate — this van's share of the distance cost. */
  readonly distanceCost: number;
}

export interface Quote {
  readonly route: Route;
  /** Every vehicle on the job (per-van full-route pricing). */
  readonly vans: QuoteVan[];
  readonly lineItems: QuoteLineItem[];
  readonly subtotal: number;
  readonly surcharges: number;
  readonly total: number;
}
