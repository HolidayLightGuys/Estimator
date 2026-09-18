import { NextRequest, NextResponse } from "next/server";
import { fetchPropertyImages } from "@/lib/propertyImage.server";

// Server-side route — thin wrapper around src/lib/propertyImage.server.ts,
// which is shared with the automated Workiz/email intake webhook
// (src/services/workiz.ts) so both paths behave identically. Always
// returns both a street-view photo (if available) and an aerial image
// with exact scale — the frontend decides how to combine them.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const address = body?.address;
  if (typeof address !== "string" || !address.trim()) {
    return NextResponse.json({ error: "Missing 'address' in request body." }, { status: 400 });
  }

  const result = await fetchPropertyImages(address);
  return NextResponse.json(result, { status: result.available ? 200 : 422 });
}
