import { NextRequest, NextResponse } from "next/server";
import { geocodeAddress } from "@/lib/geocode";

// Server-side route — GOOGLE_MAPS_API_KEY is only read here, never sent to the client.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const address = body?.address;

  if (typeof address !== "string" || !address.trim()) {
    return NextResponse.json({ error: "Missing 'address' in request body." }, { status: 400 });
  }

  const result = await geocodeAddress(address);

  if ("error" in result) {
    return NextResponse.json(result, { status: 422 });
  }

  return NextResponse.json(result, { status: 200 });
}
