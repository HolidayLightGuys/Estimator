import { NextRequest, NextResponse } from "next/server";
import { mapWorkizPayloadToLead, createDraftFromWorkizLead } from "@/services/workiz";

/**
 * Intake endpoint for incoming leads. Point one of these at this URL:
 *   - An email-forwarding/parsing service (SendGrid Inbound Parse, Mailgun
 *     Routes) set up to receive mail sent to your leads address
 *   - Workiz's own webhook feature, if/when confirmed available on this
 *     account
 *
 * See src/services/workiz.ts for the full explanation of what this does
 * (loads a property image + gets AI-suggested lines automatically, saves a
 * draft, does NOT send anything to a customer or push anything to Workiz).
 *
 * Optional shared-secret protection: set WORKIZ_WEBHOOK_SECRET in
 * .env.local, and configure your email/webhook provider to send it back as
 * an `x-webhook-secret` header. Strongly recommended once this is deployed
 * anywhere reachable from the internet — without it, anyone who finds this
 * URL could create fake drafts (though nothing worse than that, since
 * nothing here can send anything out).
 */
export async function POST(req: NextRequest) {
  const expectedSecret = process.env.WORKIZ_WEBHOOK_SECRET;
  if (expectedSecret) {
    const providedSecret = req.headers.get("x-webhook-secret");
    if (providedSecret !== expectedSecret) {
      return NextResponse.json({ error: "Invalid or missing webhook secret." }, { status: 401 });
    }
  }

  const contentType = req.headers.get("content-type") || "";
  let payload: Record<string, unknown> = {};

  try {
    if (contentType.includes("application/json")) {
      payload = await req.json();
    } else if (
      contentType.includes("multipart/form-data") ||
      contentType.includes("application/x-www-form-urlencoded")
    ) {
      const form = await req.formData();
      for (const [key, value] of form.entries()) {
        if (typeof value === "string") payload[key] = value;
      }
    } else {
      // Fall back to treating the raw body as plain email text.
      payload = { text: await req.text() };
    }
  } catch (err) {
    return NextResponse.json(
      {
        error: `Could not parse webhook payload: ${
          err instanceof Error ? err.message : "unknown error"
        }`,
      },
      { status: 400 }
    );
  }

  const lead = mapWorkizPayloadToLead(payload);

  if (!lead.name && !lead.address && !lead.message) {
    return NextResponse.json(
      { error: "Could not find any usable lead fields (name/address/message) in the payload." },
      { status: 422 }
    );
  }

  try {
    const draft = await createDraftFromWorkizLead(lead);
    return NextResponse.json({ draftId: draft.id, draft }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      {
        error: `Failed to create draft: ${err instanceof Error ? err.message : "unknown error"}`,
      },
      { status: 500 }
    );
  }
}
