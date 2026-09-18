import { NextRequest, NextResponse } from "next/server";
import { suggestLines } from "@/lib/aiSuggest.server";

// Server-side route — thin wrapper around src/lib/aiSuggest.server.ts,
// which is shared with the automated Workiz/email intake webhook
// (src/services/workiz.ts) so both paths behave identically.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body?.imageUrl) {
    return NextResponse.json({ error: "Missing 'imageUrl' in request body." }, { status: 400 });
  }

  const result = await suggestLines({
    imageUrl: body.imageUrl,
    aerialImageUrl: body.aerialImageUrl ?? null,
    aerialPixelsPerFoot: body.aerialPixelsPerFoot ?? null,
    message: body.message ?? "",
    color: body.color ?? "",
  });

  return NextResponse.json(result, { status: 200 });
}
