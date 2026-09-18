import { NextRequest, NextResponse } from "next/server";
import { listDraftsServer, saveDraftServer } from "@/lib/draftsStore.server";

export async function GET() {
  const drafts = await listDraftsServer();
  return NextResponse.json(drafts, { status: 200 });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || !body.id) {
    return NextResponse.json({ error: "Invalid draft payload — missing 'id'." }, { status: 400 });
  }
  const saved = await saveDraftServer(body);
  return NextResponse.json(saved, { status: 200 });
}
