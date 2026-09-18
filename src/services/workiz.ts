/**
 * Automated lead intake — this is what turns an incoming email/lead into a
 * ready-to-review draft automatically: house found, image loaded, lines
 * suggested. A human still has to open it, review/edit the lines, and
 * export — nothing here ever sends anything to a customer or to Workiz
 * automatically.
 *
 * Entry point: src/app/api/workiz-webhook/route.ts. Point one of these at
 * that URL:
 *   - Workiz's own webhook feature, if/when confirmed available on this
 *     account and its real payload shape is known (update
 *     mapWorkizPayloadToLead below to match it)
 *   - An email-forwarding/parsing service (e.g. SendGrid Inbound Parse,
 *     Mailgun Routes) pointed at the address the lead emails arrive at —
 *     these post the raw email body as form fields, which this file
 *     recognizes and parses with the same logic as the manual paste box
 *     (src/lib/parseWorkizLead.ts)
 *
 * NOT implemented, and not needed: pushing the finished estimate back into
 * Workiz automatically. Confirmed directly by the business owner — the
 * final marked-up image is uploaded into Workiz manually by whoever
 * reviews the estimate. pushEstimateToWorkiz is kept below only in case
 * that ever changes.
 */

import { randomUUID } from "crypto";
import type { CustomerLead, DrawnLine, EstimateDraft } from "@/types";
import { parseWorkizLead } from "@/lib/parseWorkizLead";
import { fetchPropertyImages } from "@/lib/propertyImage.server";
import { suggestLines } from "@/lib/aiSuggest.server";
import { calculateEstimatePricing } from "@/lib/pricing";
import { calculateLineFeet, createScaleCalibration } from "@/lib/measurement";
import { createEmptyDraftServer, saveDraftServer } from "@/lib/draftsStore.server";

export interface WorkizWebhookPayload {
  [key: string]: unknown;
}

/**
 * Maps an incoming webhook payload into a CustomerLead. Supports two shapes:
 *  - Raw forwarded email text under `text`, `body`, or `body-plain` (the
 *    field names SendGrid Inbound Parse / Mailgun Routes typically post) —
 *    parsed the same way as the manual "Paste Workiz Lead" box.
 *  - Already-structured fields (name/phone/email/address/message/color/
 *    webForm) sent directly — used once Workiz's own webhook payload shape
 *    is confirmed, if it ever sends structured JSON instead of raw email.
 */
export function mapWorkizPayloadToLead(payload: WorkizWebhookPayload): CustomerLead {
  const rawText =
    (payload.text as string) || (payload.body as string) || (payload["body-plain"] as string);

  if (typeof rawText === "string" && rawText.trim()) {
    return parseWorkizLead(rawText);
  }

  return {
    name: (payload.name as string) || "",
    phone: (payload.phone as string) || "",
    email: (payload.email as string) || "",
    address: (payload.address as string) || "",
    message: (payload.message as string) || "",
    color: (payload.color as string) || "",
    webForm: (payload.webForm as string) || (payload.source as string) || "",
  };
}

/**
 * Creates a full draft automatically from an incoming lead: loads a
 * property image and asks AI to suggest lines — the same two steps as
 * clicking "Load Property" then "Suggest Lines with AI" in the UI — so a
 * human just opens the resulting draft, reviews/edits, and exports.
 */
export async function createDraftFromWorkizLead(lead: CustomerLead): Promise<EstimateDraft> {
  const draft: EstimateDraft = { ...createEmptyDraftServer(), lead };

  if (lead.address && lead.address.trim().length >= 5) {
    // Fetches both a real Street View photo (for display/export) and an
    // aerial image (for exact scale) from one geocode lookup — same as the
    // manual "Load Property" button.
    const imagesResult = await fetchPropertyImages(lead.address);

    if (imagesResult.available && imagesResult.aerial) {
      const imageIsAerial = !imagesResult.streetView;
      draft.imageUrl = imagesResult.streetView?.imageUrl ?? imagesResult.aerial.imageUrl;

      if (imageIsAerial) {
        // No Street View available — the display image IS the aerial image,
        // so its scale is already exact. No AI reference needed.
        draft.scaleCalibration = createScaleCalibration(
          { x: 0, y: 200 },
          { x: 640, y: 200 },
          imagesResult.aerial.referenceFeet,
          { source: "auto_geo", label: "Full image width (aerial, computed from zoom/geography)" }
        );
      }

      const aiResult = await suggestLines({
        imageUrl: draft.imageUrl,
        aerialImageUrl: imageIsAerial ? null : imagesResult.aerial.imageUrl,
        aerialPixelsPerFoot: imageIsAerial ? null : imagesResult.aerial.pixelsPerFoot,
        message: lead.message,
        color: String(lead.color),
      });

      const warnings = [...aiResult.warnings];

      // Only fill in an AI scale reference if the image didn't already come
      // with an exact (aerial) scale.
      if (!draft.scaleCalibration && aiResult.suggestedScaleReference) {
        const ref = aiResult.suggestedScaleReference;
        draft.scaleCalibration = createScaleCalibration(
          { x: ref.points[0][0], y: ref.points[0][1] },
          { x: ref.points[1][0], y: ref.points[1][1] },
          ref.feet,
          {
            source: ref.method === "aerial_cross_reference" ? "ai_cross_reference" : "ai_guess",
            label: ref.label,
          }
        );
        warnings.push(
          ref.method === "aerial_cross_reference"
            ? `Scale matched from an exact aerial measurement of "${ref.label}" (~${ref.feet.toFixed(1)} ft) — worth a quick check, but the underlying number is exact.`
            : `Scale auto-estimated from AI's guess of a ${ref.label} (~${ref.feet} ft) — this is an assumption, not a measurement. Verify it before trusting totals.`
        );
      }

      const lines: DrawnLine[] = aiResult.suggestedLines.map((s) => {
        const points = s.points.map(([x, y]) => ({ x, y }));
        return {
          id: randomUUID(),
          label: s.label,
          type: s.type,
          color: "#F4C542",
          points,
          calculatedFeet: calculateLineFeet(points, draft.scaleCalibration),
          manualOverrideFeet: null,
          source: "ai_suggested" as const,
          confidence: s.confidence,
          notes: s.notes,
        };
      });

      draft.lines = lines;
      draft.notes = warnings.join(" ");
    } else if (imagesResult.error) {
      draft.notes = `Could not auto-load a property image: ${imagesResult.error}`;
    }
  } else {
    draft.notes =
      "No usable address was found on this lead — add one manually, then click Load Property.";
  }

  draft.pricing = calculateEstimatePricing(draft.lines);

  return saveDraftServer(draft);
}

/**
 * NOT implemented on purpose (see file header). Kept only in case a real
 * Workiz upload API is confirmed and this business's workflow changes to
 * want it.
 */
export async function pushEstimateToWorkiz(
  _draft: EstimateDraft,
  _fileBlob: Blob
): Promise<void> {
  throw new Error(
    "pushEstimateToWorkiz is intentionally not implemented — estimates are uploaded into Workiz manually by design."
  );
}
