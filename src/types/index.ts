// Shared types for Holiday Light Guys Estimator

export type LightColor =
  | "Warm White"
  | "Cool White"
  | "Multicolor"
  | "Red"
  | "Green"
  | "Red & Green"
  | "Other";

export type LineType =
  | "front_roofline"
  | "porch_roof_wrap"
  | "pathway"
  | "other";

export interface CustomerLead {
  name: string;
  phone: string;
  email: string;
  address: string;
  message: string;
  color: LightColor | string;
  webForm?: string;
}

export interface Point {
  x: number;
  y: number;
}

export interface DrawnLine {
  id: string;
  label: string;
  type: LineType;
  color: string; // hex, defaults to gold #F4C542
  points: Point[]; // sequence of points forming the segment (image pixel space)
  /** Length in feet as calculated from pixels-per-foot scale. Null until scale is calibrated. */
  calculatedFeet: number | null;
  /** If set, this value is used instead of calculatedFeet for totals/pricing. */
  manualOverrideFeet: number | null;
  source: "manual" | "ai_suggested";
  confidence?: "low" | "medium" | "high";
  notes?: string;
}

export interface ScaleCalibration {
  /** Two reference points clicked on the image. */
  pointA: Point;
  pointB: Point;
  /** Real-world distance between pointA and pointB, in feet, entered by the user. */
  knownDistanceFeet: number;
  /** Derived: pixel distance between pointA/pointB divided by knownDistanceFeet. */
  pixelsPerFoot: number;
  /**
   * How this calibration was established — shown in the UI so a reviewer
   * knows how much to trust it:
   *  - "manual": a human clicked two points and typed a real distance
   *  - "auto_geo": derived from an aerial image's known geographic extent —
   *    mathematically exact, not an estimate
   *  - "ai_guess": AI identified a common object (e.g. a garage door) and
   *    assumed its standard size — an estimate, always needs confirmation
   */
  source?: "manual" | "auto_geo" | "ai_guess" | "ai_cross_reference";
  /**
   * For "ai_guess": what AI thinks the assumed-size reference object is.
   * For "ai_cross_reference": what real-world feature (e.g. "front wall of
   * house") AI matched between the aerial and street-level photos.
   */
  label?: string;
}

export interface AerialImageInfo {
  imageUrl: string;
  source: "static_map" | "satellite_free";
  /** Mathematically exact — derived from zoom level and geography, not an estimate. */
  pixelsPerFoot: number;
  /** Real-world width of the full aerial image, in feet. */
  referenceFeet: number;
}

export interface StreetViewImageInfo {
  imageUrl: string;
  /**
   * "county_assessor": a real elevation photo pulled from a county GIS
   * system (currently Johnson County, KS only — see
   * src/lib/countyPhoto.server.ts). Often better than Street View: taken
   * specifically for the building, sometimes multiple angles, dated.
   * "google_street_view": Google's Street View photo, used when no county
   * photo was found.
   */
  source: "county_assessor" | "google_street_view";
  /** ISO date (YYYY-MM-DD), only present for source "county_assessor". */
  imageDate?: string | null;
}

export interface PropertyImagesResult {
  available: boolean;
  formattedAddress?: string;
  lat?: number;
  lng?: number;
  error?: string;
  /** null when no Google key is set, or Street View has no coverage at this address. */
  streetView: StreetViewImageInfo | null;
  /** Present whenever available=true — Google satellite if a key is set, otherwise the free Esri fallback. Always has an exact scale. */
  aerial: AerialImageInfo | null;
}

export interface AiSuggestedLine {
  label: string;
  type: LineType;
  points: [number, number][];
  confidence: "low" | "medium" | "high";
  notes?: string;
}

/**
 * AI's proposed scale reference for calibrating the primary/display image.
 * Two possible methods, in order of preference:
 *
 *  - "aerial_cross_reference": AI matched a real feature (e.g. the front
 *    wall) between the aerial image (exact scale) and the primary/display
 *    image, giving pixel endpoints in BOTH. The server then computes the
 *    feature's real-world length from the aerial's exact scale — so `feet`
 *    here is an EXACT number, not a guess. The only uncertainty is whether
 *    AI matched the same real feature correctly in both photos.
 *  - "assumed_standard_size": fallback when no aerial image was available
 *    to cross-reference against. AI guesses a common object's typical size
 *    (e.g. a two-car garage door, ~16 ft). `feet` here is a genuine
 *    assumption, always capped at "medium" confidence.
 *
 * `points` are always in the PRIMARY/display image's pixel space (the one
 * lines get drawn on), regardless of which method was used.
 */
export interface AiSuggestedScaleReference {
  label: string;
  feet: number;
  points: [number, number][];
  method: "aerial_cross_reference" | "assumed_standard_size";
  confidence: "low" | "medium" | "high";
  notes?: string;
}

export interface AiSuggestLinesResponse {
  suggestedLines: AiSuggestedLine[];
  suggestedScaleReference?: AiSuggestedScaleReference | null;
  warnings: string[];
}

export interface PricingBreakdownLine {
  id: string;
  label: string;
  type: LineType;
  feet: number;
  ratePerFoot: number;
  lineTotal: number;
}

export interface PricingBreakdown {
  lines: PricingBreakdownLine[];
  totalFeet: number;
  subtotal: number;
  taxRate: number;
  tax: number;
  total: number;
}

export interface EstimateDraft {
  id: string;
  createdAt: string;
  updatedAt: string;
  lead: CustomerLead;
  imageUrl: string | null;
  lines: DrawnLine[];
  scaleCalibration: ScaleCalibration | null;
  pricing: PricingBreakdown | null;
  notes: string;
}
