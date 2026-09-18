"use client";

import { useEffect, useRef, useState } from "react";
import type { AiSuggestLinesResponse, CustomerLead, DrawnLine, EstimateDraft, ScaleCalibration } from "@/types";
import { calculateEstimatePricing } from "@/lib/pricing";
import { calculateLineFeet, createScaleCalibration } from "@/lib/measurement";
import { createEmptyDraft, saveDraft, getDraft } from "@/lib/storage";
import DraftsInbox from "@/components/DraftsInbox";
import WorkizLeadInput from "@/components/WorkizLeadInput";
import LeadForm from "@/components/LeadForm";
import PropertyImage, { type LoadedPropertyImage } from "@/components/PropertyImage";
import DrawingCanvas, { type DrawingCanvasHandle } from "@/components/DrawingCanvas";
import MeasurementPanel from "@/components/MeasurementPanel";
import ExportPanel from "@/components/ExportPanel";

export default function EstimatorPage() {
  const [draft, setDraft] = useState<EstimateDraft>(createEmptyDraft());
  const [aiWarnings, setAiWarnings] = useState<string[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [draftsRefreshKey, setDraftsRefreshKey] = useState(0);
  // Kept alongside the draft so AI suggestion can always cross-reference
  // against the aerial image, even though the canvas displays the street
  // view photo. Not persisted as part of the draft itself — it's a fetch
  // input, not something the user edits.
  const [aerialRef, setAerialRef] = useState<{ imageUrl: string; pixelsPerFoot: number } | null>(null);
  const canvasRef = useRef<DrawingCanvasHandle>(null);

  // Keep pricing in sync whenever lines change.
  useEffect(() => {
    setDraft((prev) => ({ ...prev, pricing: calculateEstimatePricing(prev.lines) }));
  }, [draft.lines]);

  const handleLeadParsed = (lead: CustomerLead) => {
    setDraft((prev) => ({ ...prev, lead }));
  };

  const handleLeadChange = (lead: CustomerLead) => {
    setDraft((prev) => ({ ...prev, lead }));
  };

  const handleImageLoaded = (loaded: LoadedPropertyImage) => {
    setAerialRef({ imageUrl: loaded.aerialImageUrl, pixelsPerFoot: loaded.aerialPixelsPerFoot });

    setDraft((prev) => {
      // If the display image IS the aerial image (no Street View available),
      // its scale is already exact — apply it directly, no AI needed.
      const scaleCalibration: ScaleCalibration | null = loaded.imageIsAerial
        ? createScaleCalibration(
            { x: 0, y: 200 },
            { x: 640, y: 200 },
            loaded.aerialReferenceFeet,
            { source: "auto_geo", label: "Full image width (aerial, computed from zoom/geography)" }
          )
        : prev.scaleCalibration;

      const lines = loaded.imageIsAerial
        ? prev.lines.map((l) => ({ ...l, calculatedFeet: calculateLineFeet(l.points, scaleCalibration) }))
        : prev.lines;

      return { ...prev, imageUrl: loaded.imageUrl, scaleCalibration, lines };
    });

    // Automatically ask AI to suggest lines the moment a photo loads — no
    // separate button click required. When the display image is the real
    // Street View photo (not aerial), also pass the aerial reference along
    // so AI can cross-reference for exact scale instead of guessing.
    runAiSuggest(
      loaded.imageUrl,
      draft.lead.message,
      String(draft.lead.color),
      loaded.imageIsAerial ? null : loaded.aerialImageUrl,
      loaded.imageIsAerial ? null : loaded.aerialPixelsPerFoot
    );
  };

  const handleLinesChange = (lines: DrawnLine[]) => {
    setDraft((prev) => ({ ...prev, lines }));
  };

  const handleCalibrationChange = (scaleCalibration: ScaleCalibration) => {
    setDraft((prev) => ({ ...prev, scaleCalibration }));
  };

  const runAiSuggest = async (
    imageUrl: string,
    message: string,
    color: string,
    aerialImageUrl?: string | null,
    aerialPixelsPerFoot?: number | null
  ) => {
    setAiLoading(true);
    setAiWarnings([]);
    try {
      const res = await fetch("/api/ai-suggest-lines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl, message, color, aerialImageUrl, aerialPixelsPerFoot }),
      });
      const data: AiSuggestLinesResponse & { error?: string } = await res.json();

      if (!res.ok) {
        setAiWarnings([data.error || "AI suggestion failed."]);
        return;
      }

      const warnings = [...(data.warnings ?? [])];

      const newLines: DrawnLine[] = data.suggestedLines.map((s) => {
        const points = s.points.map(([x, y]) => ({ x, y }));
        return {
          id: crypto.randomUUID(),
          label: s.label,
          type: s.type,
          color: "#F4C542",
          points,
          calculatedFeet: null, // computed below, once the final scale for this update is known
          manualOverrideFeet: null,
          source: "ai_suggested",
          confidence: s.confidence,
          notes: s.notes,
        };
      });

      setDraft((prev) => {
        let scaleCalibration = prev.scaleCalibration;

        // Only fill in an AI scale reference if nothing better already
        // exists (a manual calibration or an aerial auto-scale always wins).
        if (!scaleCalibration && data.suggestedScaleReference) {
          const ref = data.suggestedScaleReference;
          scaleCalibration = createScaleCalibration(
            { x: ref.points[0][0], y: ref.points[0][1] },
            { x: ref.points[1][0], y: ref.points[1][1] },
            ref.feet,
            {
              source: ref.method === "aerial_cross_reference" ? "ai_cross_reference" : "ai_guess",
              label: ref.label,
            }
          );
          warnings.push(
            ref.method === "aerial_cross_reference"
              ? `Scale matched from an exact aerial measurement of "${ref.label}" (~${ref.feet.toFixed(1)} ft) — worth a quick check, but the underlying number is exact.`
              : `Scale auto-estimated from AI's guess of a ${ref.label} (~${ref.feet} ft) — this is an assumption, not a measurement. Verify it or click Calibrate Scale to correct it.`
          );
        }

        const existingLines = scaleCalibration
          ? prev.lines.map((l) => ({
              ...l,
              calculatedFeet: calculateLineFeet(l.points, scaleCalibration),
            }))
          : prev.lines;

        const suggestedLinesWithFeet = newLines.map((l) => ({
          ...l,
          calculatedFeet: calculateLineFeet(l.points, scaleCalibration),
        }));

        return {
          ...prev,
          scaleCalibration,
          lines: [...existingLines, ...suggestedLinesWithFeet],
        };
      });

      setAiWarnings(warnings);
    } catch (err) {
      setAiWarnings([err instanceof Error ? err.message : "AI suggestion failed."]);
    } finally {
      setAiLoading(false);
    }
  };

  const handleSuggestLines = () => {
    if (!draft.imageUrl) return;
    runAiSuggest(
      draft.imageUrl,
      draft.lead.message,
      String(draft.lead.color),
      aerialRef?.imageUrl,
      aerialRef?.pixelsPerFoot
    );
  };

  const handleSaveDraft = async () => {
    setSaveStatus("Saving…");
    try {
      const saved = await saveDraft(draft);
      setDraft(saved);
      setSaveStatus("Saved.");
      setDraftsRefreshKey((k) => k + 1);
    } catch {
      setSaveStatus("Save failed.");
    } finally {
      setTimeout(() => setSaveStatus(null), 2000);
    }
  };

  const handleSelectDraft = async (id: string) => {
    const found = await getDraft(id);
    if (found) {
      setDraft(found);
      setAiWarnings([]);
      setAerialRef(null);
    }
  };

  const handleNewDraft = () => {
    setDraft(createEmptyDraft());
    setAiWarnings([]);
    setAerialRef(null);
  };

  return (
    <main className="min-h-screen bg-neutral-100">
      <header className="bg-hlg-green">
        <div className="max-w-6xl mx-auto px-6 py-4 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-white font-bold text-lg">Holiday Light Guys — Estimator</h1>
          <DraftsInbox
            currentDraftId={draft.id}
            onSelect={handleSelectDraft}
            onNew={handleNewDraft}
            refreshKey={draftsRefreshKey}
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSuggestLines}
              disabled={!draft.imageUrl || aiLoading}
              className="px-4 py-2 rounded-lg bg-hlg-gold text-hlg-charcoal text-sm font-semibold disabled:opacity-50"
            >
              {aiLoading ? "Suggesting…" : "Suggest Lines with AI"}
            </button>
            <button
              type="button"
              onClick={handleSaveDraft}
              className="px-4 py-2 rounded-lg bg-white text-hlg-green text-sm font-semibold"
            >
              {saveStatus ?? "Save Draft"}
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-6">
          <WorkizLeadInput onParsed={handleLeadParsed} />
          <LeadForm
            lead={draft.lead}
            onChange={handleLeadChange}
            notes={draft.notes}
            onNotesChange={(notes) => setDraft((prev) => ({ ...prev, notes }))}
          />
          <PropertyImage address={draft.lead.address} onImageLoaded={handleImageLoaded} />
        </div>

        <div className="space-y-6">
          {aiWarnings.length > 0 && (
            <div className="hlg-card p-4 border-l-4 border-hlg-gold">
              {aiWarnings.map((w, i) => (
                <p key={i} className="text-sm text-neutral-600">
                  {w}
                </p>
              ))}
            </div>
          )}

          <DrawingCanvas
            ref={canvasRef}
            imageUrl={draft.imageUrl}
            lines={draft.lines}
            onLinesChange={handleLinesChange}
            calibration={draft.scaleCalibration}
            onCalibrationChange={handleCalibrationChange}
          />
          <MeasurementPanel pricing={draft.pricing} />
          <ExportPanel
            draft={draft}
            getCanvasImageDataUrl={() => canvasRef.current?.getDataURL() ?? null}
          />
        </div>
      </div>
    </main>
  );
}
