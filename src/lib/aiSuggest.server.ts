// Server-side only — shared by src/app/api/ai-suggest-lines/route.ts (manual
// "Suggest Lines with AI" button) AND src/services/workiz.ts (automated
// webhook intake), so both paths behave identically.
//
// Uses OpenAI's vision-capable chat completions API (gpt-4o-mini). Requires
// OPENAI_API_KEY in .env.local, on an OpenAI account with billing enabled —
// same kind of requirement as Google Maps, just with OpenAI instead.
//
// Two jobs:
// 1. Suggest lighting lines on the PRIMARY/display image (usually the real
//    Street View photo) — coordinates only, never a drawn image. This
//    sidesteps "AI isn't great at drawing": the model only ever describes
//    where lines should go, rendered as normal editable lines on the
//    existing Konva canvas.
// 2. Suggest a SCALE REFERENCE for that same image. Preferred method: if an
//    aerial image (with known exact scale) is also provided, find one real
//    feature (e.g. the front wall) visible in BOTH photos and return its
//    pixel endpoints in each. The server then computes that feature's
//    EXACT real-world length from the aerial's scale — so the resulting
//    number is exact, not guessed; only the cross-image match is AI's
//    judgment call. Fallback method (no aerial available): guess a common
//    object's standard size directly in the primary image — a genuine
//    assumption, always capped at "medium" confidence.

import type { AiSuggestLinesResponse } from "@/types";

function buildSystemPrompt(hasAerial: boolean): string {
  const scaleReferenceRules = hasAerial
    ? `Rules for scaleReference — METHOD: "aerial_cross_reference" (Image 2 is a top-down aerial photo of the same property, with an exact known scale already computed):
- Find ONE real feature you are confident is the SAME physical thing in both Image 1 (primary) and Image 2 (aerial) — e.g. the same length of the front wall, the same garage width, the same driveway width. Do not use a feature you can only see in one image.
- Return "primaryPoints": the two pixel endpoints of that feature in Image 1 (640x400 pixel space).
- Return "aerialPoints": the two pixel endpoints of the SAME feature in Image 2 (also 640x400 pixel space).
- Do NOT estimate the real-world length yourself — the server computes it exactly from Image 2's known scale. Just find matching points.
- Set "method" to "aerial_cross_reference" and leave "assumedFeet" null.
- If you cannot confidently match the same feature in both images, set "scaleReference" to null entirely — do not fall back to guessing a standard size when an aerial image was provided; add a warning instead explaining why no match was found.`
    : `Rules for scaleReference — METHOD: "assumed_standard_size" (no aerial image was available, so this is the only option):
- Only include this if you can clearly see an object with a well-known standard real-world size — e.g. a two-car garage door (~16 ft), a single garage door (~9 ft), a standard entry door (~3 ft wide), a standard window (~3 ft wide).
- Return "primaryPoints": the two pixel endpoints spanning that object's known dimension.
- Return "assumedFeet": the standard size you're assuming. Leave "aerialPoints" null.
- Set "method" to "assumed_standard_size".
- This is ALWAYS an assumption, never a measurement of this specific house — confidence must be "low" or "medium", never "high".
- If you cannot confidently identify such an object, set "scaleReference" to null — null is the correct answer more often than not.`;

  return `You are assisting a Christmas light installation company in estimating where to draw lighting lines on a photo of a house.

Respond with ONLY valid JSON — no prose, no markdown code fences — matching exactly this shape:

{
  "suggestedLines": [
    {
      "label": "string, short human-readable label",
      "type": "front_roofline" | "porch_roof_wrap" | "pathway" | "other",
      "points": [[x, y], [x, y]],
      "confidence": "low" | "medium" | "high",
      "notes": "string, optional caveat about this line"
    }
  ],
  "scaleReference": {
    "label": "string, what real-world feature this is",
    "method": "${hasAerial ? "aerial_cross_reference" : "assumed_standard_size"}",
    "primaryPoints": [[x, y], [x, y]],
    "aerialPoints": [[x, y], [x, y]] | null,
    "assumedFeet": number | null,
    "confidence": "low" | "medium" | "high",
    "notes": "string, brief caveat"
  } | null,
  "warnings": ["string", "..."]
}

Rules for suggestedLines:
- All line coordinates are pixel positions in Image 1 (the primary image), 640x400, top-left origin (0,0).
- Only suggest lines for areas the customer's message actually asked for.
- Use "low" confidence whenever the roofline is partially blocked, unclear, or you are guessing.
- Never claim exact measurements for a line — you are only suggesting where it should go.

${scaleReferenceRules}

General:
- Always add a warning if the photo angle makes any requested lighting area hard to see, or if no usable scale reference was found.`;
}

async function imageUrlToDataUrl(imageUrl: string): Promise<string | null> {
  try {
    const res = await fetch(imageUrl);
    if (!res.ok) return null;
    const buffer = await res.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");
    const contentType = res.headers.get("content-type") || "image/png";
    return `data:${contentType};base64,${base64}`;
  } catch {
    return null;
  }
}

function pixelDistance(a: [number, number], b: [number, number]): number {
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}

/**
 * Normalizes a raw (untyped, from JSON.parse) confidence value down to
 * exactly the "low" | "medium" | "high" literal union — an explicit return
 * type annotation here guarantees the result's type, rather than relying
 * on a ternary whose branches TypeScript may or may not narrow correctly
 * when one side comes from an `any`-typed source (this caused a real build
 * failure: "Type 'string' is not assignable to type '\"low\" | \"medium\" |
 * \"high\"'" — `next dev` doesn't type-check as strictly as `next build`,
 * which is why this only surfaced during a production build).
 */
function toConfidence(value: unknown, allowHigh: boolean): "low" | "medium" | "high" {
  if (allowHigh && value === "high") return "high";
  return value === "medium" ? "medium" : "low";
}

export async function suggestLines(params: {
  /** The primary/display image — lines get suggested in this image's pixel space. */
  imageUrl: string;
  /** Optional: a top-down aerial image of the same property with a known exact scale. */
  aerialImageUrl?: string | null;
  /** Required if aerialImageUrl is given — the aerial image's exact pixels-per-foot. */
  aerialPixelsPerFoot?: number | null;
  message: string;
  color: string;
}): Promise<AiSuggestLinesResponse> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      suggestedLines: [],
      suggestedScaleReference: null,
      warnings: [
        "OPENAI_API_KEY is not set — AI line suggestion is unavailable. Draw lines manually for now.",
      ],
    };
  }

  // Fetch images ourselves and pass them to OpenAI as base64 data, rather
  // than handing OpenAI the original URLs — matters when a URL has a
  // Google API key in its query string, which this keeps from ever being
  // sent to OpenAI.
  const primaryDataUrl = await imageUrlToDataUrl(params.imageUrl);
  if (!primaryDataUrl) {
    return {
      suggestedLines: [],
      suggestedScaleReference: null,
      warnings: ["Could not fetch the property image to analyze — try Load Property again first."],
    };
  }

  const hasAerial = Boolean(params.aerialImageUrl && params.aerialPixelsPerFoot);
  const aerialDataUrl = hasAerial ? await imageUrlToDataUrl(params.aerialImageUrl!) : null;
  const aerialActuallyUsable = hasAerial && Boolean(aerialDataUrl);

  const userText = `Customer request: "${params.message || "(no message provided)"}"
Requested light color: ${params.color || "(not specified)"}

Suggest roofline/porch/pathway lines matching this request on Image 1.${
    aerialActuallyUsable
      ? " Image 2 is a top-down aerial photo of the same property for finding a scale reference — see system instructions."
      : ""
  }`;

  const content: Array<Record<string, unknown>> = [
    { type: "text", text: userText },
    { type: "image_url", image_url: { url: primaryDataUrl } },
  ];
  if (aerialActuallyUsable) {
    content.push({ type: "image_url", image_url: { url: aerialDataUrl } });
  }

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: buildSystemPrompt(aerialActuallyUsable) },
          { role: "user", content },
        ],
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return {
        suggestedLines: [],
        suggestedScaleReference: null,
        warnings: [`AI suggestion request failed (status ${res.status}). ${errText.slice(0, 200)}`],
      };
    }

    const data = await res.json();
    const rawContent = data?.choices?.[0]?.message?.content;
    if (!rawContent) {
      return { suggestedLines: [], suggestedScaleReference: null, warnings: ["AI response had no content to parse."] };
    }

    const parsed = JSON.parse(rawContent);
    const suggestedLines = Array.isArray(parsed.suggestedLines) ? parsed.suggestedLines : [];
    const warnings: string[] = Array.isArray(parsed.warnings) ? parsed.warnings : [];

    let suggestedScaleReference = null;
    const ref = parsed.scaleReference;

    if (ref && typeof ref.label === "string" && Array.isArray(ref.primaryPoints) && ref.primaryPoints.length === 2) {
      if (
        aerialActuallyUsable &&
        ref.method === "aerial_cross_reference" &&
        Array.isArray(ref.aerialPoints) &&
        ref.aerialPoints.length === 2 &&
        params.aerialPixelsPerFoot
      ) {
        // Compute the EXACT real-world length from the aerial image's known
        // scale — this number is not something the model stated, it's
        // computed here from geometry, so it can't be hallucinated.
        const aerialPxDist = pixelDistance(
          ref.aerialPoints[0] as [number, number],
          ref.aerialPoints[1] as [number, number]
        );
        const feet = aerialPxDist / params.aerialPixelsPerFoot;

        if (feet > 0 && Number.isFinite(feet)) {
          suggestedScaleReference = {
            label: ref.label,
            feet,
            points: ref.primaryPoints,
            method: "aerial_cross_reference" as const,
            confidence: toConfidence(ref.confidence, true),
            notes: typeof ref.notes === "string" ? ref.notes : undefined,
          };
        }
      } else if (
        ref.method === "assumed_standard_size" &&
        typeof ref.assumedFeet === "number" &&
        ref.assumedFeet > 0
      ) {
        suggestedScaleReference = {
          label: ref.label,
          feet: ref.assumedFeet,
          points: ref.primaryPoints,
          method: "assumed_standard_size" as const,
          confidence: toConfidence(ref.confidence, false),
          notes: typeof ref.notes === "string" ? ref.notes : undefined,
        };
      }
    }

    return { suggestedLines, suggestedScaleReference, warnings };
  } catch (err) {
    return {
      suggestedLines: [],
      suggestedScaleReference: null,
      warnings: [
        `AI suggestion threw an error: ${err instanceof Error ? err.message : "unknown error"}`,
      ],
    };
  }
}
