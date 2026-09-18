import type { DrawnLine, PricingBreakdown, PricingBreakdownLine } from "@/types";

/**
 * Pricing config for NEW INSTALLATION jobs only.
 *
 * IMPORTANT: verify this against the current published rate on the
 * Holiday Light Guys website before relying on it — pricing pages change,
 * and this was entered as a best-guess figure, not confirmed from a live
 * source. This file is the single place to update it once confirmed.
 *
 * This app also currently treats every job as billed per LINEAR FOOT of
 * drawn line (roofline / porch wrap / pathway length). If the website
 * actually prices by a different unit (e.g. per square foot of roof
 * coverage, or a flat per-job rate with a footage tier), update
 * calculateEstimatePricing() below to match — it is not verified here.
 */
export const PRICING_CONFIG = {
  /** New-installation rate, USD per linear foot of lighting drawn. */
  newInstallRatePerFoot: 6.5,
  /**
   * Local sales tax rate as a decimal (e.g. 0.08125 for 8.125%).
   * Left at 0 until a jurisdiction-specific rate is confirmed —
   * do not assume tax is $0 in production.
   */
  taxRate: 0,
};

/**
 * Returns the foot value to bill for a line: manual override wins if present,
 * otherwise the calculated (scale-derived) footage. Falls back to 0 if neither
 * is available yet (e.g. scale not calibrated and no manual entry).
 */
export function getBillableFeet(line: DrawnLine): number {
  if (line.manualOverrideFeet !== null && line.manualOverrideFeet !== undefined) {
    return line.manualOverrideFeet;
  }
  return line.calculatedFeet ?? 0;
}

export function calculateEstimatePricing(
  lines: DrawnLine[],
  ratePerFoot: number = PRICING_CONFIG.newInstallRatePerFoot,
  taxRate: number = PRICING_CONFIG.taxRate
): PricingBreakdown {
  const lineItems: PricingBreakdownLine[] = lines.map((line) => {
    const feet = getBillableFeet(line);
    return {
      id: line.id,
      label: line.label,
      type: line.type,
      feet,
      ratePerFoot,
      lineTotal: Math.round(feet * ratePerFoot * 100) / 100,
    };
  });

  const totalFeet = Math.round(lineItems.reduce((sum, l) => sum + l.feet, 0) * 100) / 100;
  const subtotal = Math.round(lineItems.reduce((sum, l) => sum + l.lineTotal, 0) * 100) / 100;
  const tax = Math.round(subtotal * taxRate * 100) / 100;
  const total = Math.round((subtotal + tax) * 100) / 100;

  return {
    lines: lineItems,
    totalFeet,
    subtotal,
    taxRate,
    tax,
    total,
  };
}
