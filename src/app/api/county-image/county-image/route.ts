import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const imageUrl = req.nextUrl.searchParams.get("url");
  if (!imageUrl) {
    return NextResponse.json({ error: "Missing image URL." }, { status: 400 });
  }

  let source: URL;
  try {
    source = new URL(imageUrl);
  } catch {
    return NextResponse.json({ error: "Invalid image URL." }, { status: 400 });
  }

  const isJohnsonCountyHost =
    source.hostname === "jocogov.org" ||
    source.hostname.endsWith(".jocogov.org");

  if (
    (source.protocol !== "http:" && source.protocol !== "https:") ||
    !isJohnsonCountyHost
  ) {
    return NextResponse.json({ error: "Image host is not allowed." }, { status: 400 });
  }

  const response = await fetch(source.toString());
  const contentType = response.headers.get("content-type") || "";

  if (!response.ok || !contentType.startsWith("image/")) {
    return NextResponse.json({ error: "County image could not be loaded." }, { status: 502 });
  }

  return new NextResponse(await response.arrayBuffer(), {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=86400",
    },
  });
}