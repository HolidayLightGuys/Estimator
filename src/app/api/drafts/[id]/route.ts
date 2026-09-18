import { NextRequest, NextResponse } from "next/server";
import { getDraftServer, deleteDraftServer } from "@/lib/draftsStore.server";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const draft = await getDraftServer(params.id);
  if (!draft) {
    return NextResponse.json({ error: "Draft not found." }, { status: 404 });
  }
  return NextResponse.json(draft, { status: 200 });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  await deleteDraftServer(params.id);
  return NextResponse.json({ deleted: true }, { status: 200 });
}
