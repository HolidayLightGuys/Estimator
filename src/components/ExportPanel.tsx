"use client";

import { useState } from "react";
import type { EstimateDraft } from "@/types";
import { buildEstimatePdf } from "@/lib/pdfExport";

export default function ExportPanel({
  draft,
  getCanvasImageDataUrl,
}: {
  draft: EstimateDraft;
  /** Returns a PNG data URL of the current canvas, or null if nothing to export yet. */
  getCanvasImageDataUrl: () => string | null;
}) {
  const [busy, setBusy] = useState(false);

  const handleExportPng = () => {
    const dataUrl = getCanvasImageDataUrl();
    if (!dataUrl) return;
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `${(draft.lead.name || "estimate").replace(/\s+/g, "_")}_marked_up.png`;
    a.click();
  };

  const handleExportPdf = () => {
    setBusy(true);
    try {
      const dataUrl = getCanvasImageDataUrl();
      const doc = buildEstimatePdf(draft, dataUrl);
      doc.save(`${(draft.lead.name || "estimate").replace(/\s+/g, "_")}_estimate.pdf`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="hlg-card p-5 flex flex-wrap gap-3">
      <button
        type="button"
        onClick={handleExportPng}
        className="px-4 py-2 rounded-lg bg-hlg-gold text-hlg-charcoal text-sm font-semibold hover:brightness-95"
      >
        Export PNG
      </button>
      <button
        type="button"
        onClick={handleExportPdf}
        disabled={busy}
        className="px-4 py-2 rounded-lg bg-hlg-red text-white text-sm font-semibold hover:bg-hlg-red-dark disabled:opacity-50"
      >
        {busy ? "Building PDF…" : "Export Estimate PDF"}
      </button>
      <p className="text-xs text-neutral-400 self-center">
        Upload the exported file into Workiz manually — direct Workiz upload isn&apos;t wired up yet
        (see src/services/workiz.ts).
      </p>
    </div>
  );
}
