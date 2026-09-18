"use client";

import type { PricingBreakdown } from "@/types";
import { MEASUREMENT_DISCLAIMER } from "@/lib/measurement";

export default function MeasurementPanel({ pricing }: { pricing: PricingBreakdown | null }) {
  if (!pricing) {
    return (
      <div className="hlg-card p-5">
        <h2 className="font-semibold text-hlg-charcoal mb-2">Estimate Summary</h2>
        <p className="text-sm text-neutral-400">Draw at least one line to see pricing.</p>
      </div>
    );
  }

  return (
    <div className="hlg-card p-5">
      <h2 className="font-semibold text-hlg-charcoal mb-3">Estimate Summary</h2>

      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-neutral-400 text-xs">
            <th className="pb-2">Line</th>
            <th className="pb-2">Feet</th>
            <th className="pb-2 text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {pricing.lines.map((l) => (
            <tr key={l.id} className="border-t border-neutral-100">
              <td className="py-1.5">{l.label}</td>
              <td className="py-1.5">{l.feet} ft</td>
              <td className="py-1.5 text-right">${l.lineTotal.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-3 pt-3 border-t border-neutral-200 space-y-1 text-sm">
        <div className="flex justify-between">
          <span className="text-neutral-500">Total Footage</span>
          <span className="font-medium">{pricing.totalFeet} ft</span>
        </div>
        <div className="flex justify-between">
          <span className="text-neutral-500">Subtotal</span>
          <span className="font-medium">${pricing.subtotal.toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-neutral-500">Tax ({(pricing.taxRate * 100).toFixed(2)}%)</span>
          <span className="font-medium">${pricing.tax.toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-hlg-green font-bold text-base pt-1">
          <span>Total</span>
          <span>${pricing.total.toFixed(2)}</span>
        </div>
      </div>

      <p className="mt-3 text-xs italic text-hlg-red-dark">{MEASUREMENT_DISCLAIMER}</p>
      <p className="mt-1 text-xs text-neutral-400">
        Rate: new-installation pricing per linear foot — confirm against the current published
        rate on the Holiday Light Guys website (see src/lib/pricing.ts).
      </p>
    </div>
  );
}
