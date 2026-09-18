import type { CustomerLead } from "@/types";

/**
 * Parses pasted Workiz lead/email text into structured fields.
 *
 * Expected loose format (labels are case-insensitive, order doesn't matter):
 *
 *   From: KAYLA ARMENTROUT
 *   Phone: (573) 673-7844
 *   Email: kay.m.armentrout@gmail.com
 *   Address: 2 East Dartmouth Road Kansas City, Missouri 64113
 *   Message: We like a simple warm white light on the 1st story roofline...
 *   Color: Warm White
 *   Web form: HLG Website
 *
 * This is a best-effort line-based parser, not a guarantee. Always show the
 * parsed result to the user for review/edit before saving — Workiz email
 * formatting can vary and this will not catch every variant.
 */
export function parseWorkizLead(raw: string): CustomerLead {
  const lines = raw.split(/\r?\n/);

  const fields: Record<string, string> = {};
  let currentKey: string | null = null;

  const labelMap: Record<string, string> = {
    from: "name",
    name: "name",
    customer: "name",
    phone: "phone",
    tel: "phone",
    email: "email",
    address: "address",
    message: "message",
    notes: "message",
    color: "color",
    "light color": "color",
    "web form": "webForm",
    webform: "webForm",
    source: "webForm",
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const match = line.match(/^([A-Za-z ]{2,20}):\s*(.*)$/);
    if (match) {
      const label = match[1].trim().toLowerCase();
      const value = match[2].trim();
      const key = labelMap[label];
      if (key) {
        fields[key] = value;
        currentKey = key;
        continue;
      }
    }

    // Continuation of a multi-line field (most commonly the message body).
    if (currentKey) {
      fields[currentKey] = fields[currentKey] ? `${fields[currentKey]} ${line}` : line;
    }
  }

  return {
    name: fields.name ?? "",
    phone: fields.phone ?? "",
    email: fields.email ?? "",
    address: fields.address ?? "",
    message: fields.message ?? "",
    color: fields.color ?? "",
    webForm: fields.webForm ?? "",
  };
}
