import { NextRequest, NextResponse } from "next/server";

/**
 * PDF export note:
 *
 * The actual PDF generation for this MVP happens CLIENT-SIDE, in
 * src/lib/pdfExport.ts (buildEstimatePdf), called directly from the
 * Estimator page's "Export Estimate" button. That's because jsPDF needs the
 * canvas's rendered image data (a data URL) to embed the marked-up house
 * photo, and getting that image data is simplest in the browser where the
 * <canvas>/Konva stage already lives — round-tripping the image through a
 * server route would add complexity for no real benefit at this stage.
 *
 * This route is kept as a placeholder in case a server-side PDF generation
 * path is needed later — e.g. if drafts move to a real database and you
 * want to regenerate a PDF for a saved draft without reopening the canvas.
 * If you build that out, accept a draft ID or full draft JSON here, fetch/
 * recreate the marked-up image server-side, and use a server-safe PDF
 * library. It is unused by the current UI.
 */
export async function POST(_req: NextRequest) {
  return NextResponse.json(
    {
      error:
        "Server-side PDF export is not implemented. Use the client-side export in the Estimator page (see src/lib/pdfExport.ts).",
    },
    { status: 501 }
  );
}
