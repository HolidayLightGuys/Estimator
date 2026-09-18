"use client";

import type { CustomerLead, LightColor } from "@/types";

const LIGHT_COLORS: LightColor[] = [
  "Warm White",
  "Cool White",
  "Multicolor",
  "Red",
  "Green",
  "Red & Green",
  "Other",
];

export default function LeadForm({
  lead,
  onChange,
  notes,
  onNotesChange,
}: {
  lead: CustomerLead;
  onChange: (lead: CustomerLead) => void;
  notes: string;
  onNotesChange: (notes: string) => void;
}) {
  const update = (field: keyof CustomerLead, value: string) => {
    onChange({ ...lead, [field]: value });
  };

  const inputClass =
    "w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-hlg-green-bright";

  return (
    <div className="hlg-card p-5 space-y-3">
      <h2 className="font-semibold text-hlg-charcoal">Customer & Job Details</h2>

      <div>
        <label className="text-xs font-medium text-neutral-500">Customer Name</label>
        <input
          className={inputClass}
          value={lead.name}
          onChange={(e) => update("name", e.target.value)}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-neutral-500">Phone</label>
          <input
            className={inputClass}
            value={lead.phone}
            onChange={(e) => update("phone", e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs font-medium text-neutral-500">Email</label>
          <input
            className={inputClass}
            value={lead.email}
            onChange={(e) => update("email", e.target.value)}
          />
        </div>
      </div>

      <div>
        <label className="text-xs font-medium text-neutral-500">Address</label>
        <input
          className={inputClass}
          value={lead.address}
          onChange={(e) => update("address", e.target.value)}
        />
      </div>

      <div>
        <label className="text-xs font-medium text-neutral-500">Message / Request Details</label>
        <textarea
          className={`${inputClass} h-24`}
          value={lead.message}
          onChange={(e) => update("message", e.target.value)}
        />
      </div>

      <div>
        <label className="text-xs font-medium text-neutral-500">Light Color</label>
        <select
          className={inputClass}
          value={lead.color}
          onChange={(e) => update("color", e.target.value)}
        >
          <option value="">Select a color…</option>
          {LIGHT_COLORS.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="text-xs font-medium text-neutral-500">Notes</label>
        <textarea
          className={`${inputClass} h-20`}
          placeholder="Internal notes for this estimate..."
          value={notes}
          onChange={(e) => onNotesChange(e.target.value)}
        />
      </div>
    </div>
  );
}
