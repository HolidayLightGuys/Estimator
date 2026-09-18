import { jsPDF } from "jspdf";
import type { EstimateDraft } from "@/types";
import { MEASUREMENT_DISCLAIMER } from "@/lib/measurement";

const BRAND = {
  green: "#0B5D2A",
  red: "#C62828",
  gold: "#F4C542",
  charcoal: "#1E1E1E",
};

/**
 * Builds a branded PDF summary of the estimate: customer details, address,
 * request, light color, line-item footage, total footage, pricing, and the
 * measurement disclaimer. Optionally embeds the marked-up house image as a
 * PNG data URL (imageDataUrl) if the caller has already rendered the canvas.
 *
 * Runs client-side (jsPDF works in the browser) — call this from the
 * Estimator page's export handler, not from an API route.
 */
export function buildEstimatePdf(draft: EstimateDraft, imageDataUrl?: string | null): jsPDF {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const marginX = 48;
  let y = 48;

  // Header bar
  doc.setFillColor(BRAND.green);
  doc.rect(0, 0, 612, 64, "F");
  doc.setTextColor("#FFFFFF");
  doc.setFontSize(18);
  doc.text("Holiday Light Guys — Installation Estimate", marginX, 40);
  y = 90;

  doc.setTextColor(BRAND.charcoal);
  doc.setFontSize(11);

  const line = (label: string, value: string) => {
    doc.setFont("helvetica", "bold");
    doc.text(`${label}:`, marginX, y);
    doc.setFont("helvetica", "normal");
    doc.text(value || "—", marginX + 110, y);
    y += 18;
  };

  line("Customer", draft.lead.name);
  line("Phone", draft.lead.phone);
  line("Email", draft.lead.email);
  line("Address", draft.lead.address);
  line("Light Color", String(draft.lead.color));
  y += 6;

  doc.setFont("helvetica", "bold");
  doc.text("Customer Request:", marginX, y);
  y += 16;
  doc.setFont("helvetica", "normal");
  const messageLines = doc.splitTextToSize(draft.lead.message || "—", 500);
  doc.text(messageLines, marginX, y);
  y += messageLines.length * 14 + 12;

  // Marked-up image
  if (imageDataUrl) {
    try {
      doc.addImage(imageDataUrl, "PNG", marginX, y, 500, 280, undefined, "FAST");
      y += 296;
    } catch {
      // If the image fails to embed, continue without it rather than failing the whole export.
    }
  }

  // Line items table
  doc.setFillColor(BRAND.gold);
  doc.rect(marginX, y, 500, 20, "F");
  doc.setTextColor(BRAND.charcoal);
  doc.setFont("helvetica", "bold");
  doc.text("Line Item", marginX + 6, y + 14);
  doc.text("Type", marginX + 220, y + 14);
  doc.text("Feet", marginX + 340, y + 14);
  doc.text("Total", marginX + 420, y + 14);
  y += 26;

  doc.setFont("helvetica", "normal");
  const pricingLines = draft.pricing?.lines ?? [];
  for (const item of pricingLines) {
    doc.text(item.label, marginX + 6, y);
    doc.text(item.type.replace(/_/g, " "), marginX + 220, y);
    doc.text(`${item.feet} ft`, marginX + 340, y);
    doc.text(`$${item.lineTotal.toFixed(2)}`, marginX + 420, y);
    y += 16;
  }

  y += 8;
  doc.setDrawColor(BRAND.charcoal);
  doc.line(marginX, y, marginX + 500, y);
  y += 20;

  if (draft.pricing) {
    const totalsLine = (label: string, value: string, bold = false) => {
      doc.setFont("helvetica", bold ? "bold" : "normal");
      doc.text(label, marginX + 300, y);
      doc.text(value, marginX + 420, y);
      y += 16;
    };
    totalsLine("Total Footage", `${draft.pricing.totalFeet} ft`);
    totalsLine("Subtotal", `$${draft.pricing.subtotal.toFixed(2)}`);
    totalsLine(
      `Tax (${(draft.pricing.taxRate * 100).toFixed(2)}%)`,
      `$${draft.pricing.tax.toFixed(2)}`
    );
    totalsLine("Total", `$${draft.pricing.total.toFixed(2)}`, true);
  }

  y += 20;
  if (draft.notes) {
    doc.setFont("helvetica", "bold");
    doc.text("Notes:", marginX, y);
    y += 16;
    doc.setFont("helvetica", "normal");
    const notesLines = doc.splitTextToSize(draft.notes, 500);
    doc.text(notesLines, marginX, y);
    y += notesLines.length * 14 + 10;
  }

  doc.setTextColor(BRAND.red);
  doc.setFont("helvetica", "italic");
  const disclaimerLines = doc.splitTextToSize(MEASUREMENT_DISCLAIMER, 500);
  doc.text(disclaimerLines, marginX, y);

  return doc;
}
