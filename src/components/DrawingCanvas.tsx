"use client";

import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Stage, Layer, Image as KonvaImage, Line as KonvaLine, Circle } from "react-konva";
import useImage from "use-image";
import type { DrawnLine, LineType, Point, ScaleCalibration } from "@/types";
import { calculateLineFeet, createScaleCalibration } from "@/lib/measurement";

const CANVAS_WIDTH = 640;
const CANVAS_HEIGHT = 400;

const LINE_TYPE_LABELS: Record<LineType, string> = {
  front_roofline: "Front Roofline",
  peak: "Peak",
  side_roofline: "Side Roofline",
  porch_roof_wrap: "Porch Roof Wrap",
  pathway: "Pathway",
  other: "Other",
};

const DEFAULT_LINE_COLOR = "#F4C542"; // gold, per brand spec

type Mode = "idle" | "drawing" | "calibrating";

function flatten(points: Point[]): number[] {
  return points.flatMap((p) => [p.x, p.y]);
}

export interface DrawingCanvasHandle {
  /** Returns a PNG data URL of the current canvas (image + drawn lines), or null if not ready. */
  getDataURL: () => string | null;
}

const DrawingCanvas = forwardRef<DrawingCanvasHandle, {
  imageUrl: string | null;
  lines: DrawnLine[];
  onLinesChange: (lines: DrawnLine[]) => void;
  calibration: ScaleCalibration | null;
  onCalibrationChange: (c: ScaleCalibration) => void;
}>(function DrawingCanvas(
  { imageUrl, lines, onLinesChange, calibration, onCalibrationChange },
  ref
) {
  const canvasImageUrl =
  imageUrl?.includes("ims.jocogov.org/")
    ? `/api/county-image?url=${encodeURIComponent(imageUrl)}`
    : imageUrl ?? "";

const [image] = useImage(canvasImageUrl, "anonymous");
  const [mode, setMode] = useState<Mode>("idle");
  const [draftPoints, setDraftPoints] = useState<Point[]>([]);
  const [draftType, setDraftType] = useState<LineType>("front_roofline");
  const [draftColor, setDraftColor] = useState(DEFAULT_LINE_COLOR);

  const [calibrationPoints, setCalibrationPoints] = useState<Point[]>([]);
  const [pendingCalibrationDistance, setPendingCalibrationDistance] = useState("");

  const stageRef = useRef<any>(null);

  useImperativeHandle(ref, () => ({
    getDataURL: () => {
      if (!stageRef.current) return null;
      return stageRef.current.toDataURL({ pixelRatio: 2 });
    },
  }));

  const handleStageClick = (e: any) => {
    const pos = e.target.getStage().getPointerPosition();
    if (!pos) return;

    if (mode === "drawing") {
      setDraftPoints((prev) => [...prev, { x: pos.x, y: pos.y }]);
    } else if (mode === "calibrating") {
      setCalibrationPoints((prev) => (prev.length >= 2 ? [{ x: pos.x, y: pos.y }] : [...prev, { x: pos.x, y: pos.y }]));
    }
  };

  const finishLine = () => {
    if (draftPoints.length < 2) {
      setDraftPoints([]);
      setMode("idle");
      return;
    }
    const newLine: DrawnLine = {
      id: crypto.randomUUID(),
      label: `${LINE_TYPE_LABELS[draftType]} ${lines.filter((l) => l.type === draftType).length + 1}`,
      type: draftType,
      color: draftColor,
      points: draftPoints,
      calculatedFeet: calculateLineFeet(draftPoints, calibration),
      manualOverrideFeet: null,
      source: "manual",
    };
    onLinesChange([...lines, newLine]);
    setDraftPoints([]);
    setMode("idle");
  };

  const cancelDrawing = () => {
    setDraftPoints([]);
    setMode("idle");
  };

  const deleteLine = (id: string) => {
    onLinesChange(lines.filter((l) => l.id !== id));
  };

  const updateLine = (id: string, patch: Partial<DrawnLine>) => {
    onLinesChange(lines.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  };

  const movePoint = (lineId: string, pointIndex: number, newPos: Point) => {
    const target = lines.find((l) => l.id === lineId);
    if (!target) return;
    const newPoints = target.points.map((p, i) => (i === pointIndex ? newPos : p));
    const calculatedFeet = calculateLineFeet(newPoints, calibration);
    updateLine(lineId, { points: newPoints, calculatedFeet });
  };

  const confirmCalibration = () => {
    const feet = parseFloat(pendingCalibrationDistance);
    if (calibrationPoints.length < 2 || !feet || feet <= 0) return;
    const newCalibration = createScaleCalibration(calibrationPoints[0], calibrationPoints[1], feet);
    onCalibrationChange(newCalibration);
    // Recalculate all existing lines against the new scale.
    onLinesChange(
      lines.map((l) => ({ ...l, calculatedFeet: calculateLineFeet(l.points, newCalibration) }))
    );
    setCalibrationPoints([]);
    setPendingCalibrationDistance("");
    setMode("idle");
  };

  const totalFeet = useMemo(() => {
    return lines.reduce((sum, l) => {
      const feet = l.manualOverrideFeet ?? l.calculatedFeet ?? 0;
      return sum + feet;
    }, 0);
  }, [lines]);

  return (
    <div className="hlg-card p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-hlg-charcoal">Roofline / Pathway Drawing</h2>
        <span className="text-sm font-semibold text-hlg-green">
          Total: {Math.round(totalFeet * 10) / 10} ft
        </span>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap gap-2 mb-3">
        {mode === "idle" && (
          <>
            <select
              className="text-sm rounded-lg border border-neutral-200 px-2 py-1"
              value={draftType}
              onChange={(e) => setDraftType(e.target.value as LineType)}
            >
              {Object.entries(LINE_TYPE_LABELS).map(([value, labelText]) => (
                <option key={value} value={value}>
                  {labelText}
                </option>
              ))}
            </select>
            <input
              type="color"
              value={draftColor}
              onChange={(e) => setDraftColor(e.target.value)}
              className="w-9 h-8 rounded border border-neutral-200"
              title="Line color"
            />
            <button
              type="button"
              onClick={() => setMode("drawing")}
              disabled={!imageUrl}
              className="px-3 py-1.5 rounded-lg bg-hlg-green text-white text-sm font-semibold hover:bg-hlg-green-bright disabled:opacity-50"
            >
              + Draw Line
            </button>
            <button
              type="button"
              onClick={() => setMode("calibrating")}
              disabled={!imageUrl}
              className="px-3 py-1.5 rounded-lg bg-hlg-gold text-hlg-charcoal text-sm font-semibold hover:brightness-95 disabled:opacity-50"
            >
              Calibrate Scale
            </button>
          </>
        )}

        {mode === "drawing" && (
          <>
            <span className="text-sm text-neutral-500 self-center">
              Click on the image to add points ({draftPoints.length} placed). Click Finish when done.
            </span>
            <button
              type="button"
              onClick={finishLine}
              className="px-3 py-1.5 rounded-lg bg-hlg-green text-white text-sm font-semibold"
            >
              Finish Line
            </button>
            <button
              type="button"
              onClick={cancelDrawing}
              className="px-3 py-1.5 rounded-lg bg-neutral-200 text-hlg-charcoal text-sm font-semibold"
            >
              Cancel
            </button>
          </>
        )}

        {mode === "calibrating" && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-neutral-500">
              Click two points of a known distance (e.g. garage width) — {calibrationPoints.length}/2 placed.
            </span>
            <input
              type="number"
              placeholder="Known distance (ft)"
              value={pendingCalibrationDistance}
              onChange={(e) => setPendingCalibrationDistance(e.target.value)}
              className="w-40 text-sm rounded-lg border border-neutral-200 px-2 py-1"
            />
            <button
              type="button"
              onClick={confirmCalibration}
              disabled={calibrationPoints.length < 2 || !pendingCalibrationDistance}
              className="px-3 py-1.5 rounded-lg bg-hlg-green text-white text-sm font-semibold disabled:opacity-50"
            >
              Set Scale
            </button>
            <button
              type="button"
              onClick={() => {
                setCalibrationPoints([]);
                setMode("idle");
              }}
              className="px-3 py-1.5 rounded-lg bg-neutral-200 text-hlg-charcoal text-sm font-semibold"
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {calibration && calibration.source === "ai_cross_reference" && (
        <p className="text-xs text-hlg-charcoal bg-amber-50 border border-hlg-gold rounded p-1.5 mb-2 font-medium">
          Scale matched from an exact aerial measurement of {calibration.label ?? "a reference feature"}
          {" "}(~{calibration.knownDistanceFeet.toFixed(1)} ft) — the number is exact, only the photo-matching
          is AI&apos;s judgment. Worth a quick glance, or click Calibrate Scale to correct it.
        </p>
      )}
      {calibration && calibration.source === "ai_guess" && (
        <p className="text-xs text-hlg-red-dark mb-2 font-medium">
          ⚠ Scale auto-estimated from AI&apos;s guess of a {calibration.label ?? "reference object"}
          {" "}(~{calibration.knownDistanceFeet} ft assumed) — not a real measurement. Verify it, or click
          Calibrate Scale to correct it.
        </p>
      )}
      {calibration && calibration.source === "auto_geo" && (
        <p className="text-xs text-hlg-green mb-2">
          Scale calibrated automatically and exactly from the aerial image&apos;s geometry —
          {" "}{calibration.pixelsPerFoot.toFixed(2)} px/ft.
        </p>
      )}
      {calibration && (calibration.source === "manual" || !calibration.source) && (
        <p className="text-xs text-neutral-400 mb-2">
          Scale: {calibration.pixelsPerFoot.toFixed(2)} px/ft (from {calibration.knownDistanceFeet} ft manual reference)
        </p>
      )}
      {!calibration && (
        <p className="text-xs text-hlg-red-dark mb-2">
          Scale not calibrated yet — footage will show as manual-entry only until you calibrate.
        </p>
      )}

      {/* Canvas */}
      <div className="rounded-lg overflow-hidden border border-neutral-200 bg-neutral-100" style={{ width: CANVAS_WIDTH }}>
        <Stage
          ref={stageRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          onClick={handleStageClick}
        >
          <Layer>
            {image && <KonvaImage image={image} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} />}

            {/* Existing lines */}
            {lines.map((line) => (
              <KonvaLine
                key={line.id}
                points={flatten(line.points)}
                stroke={line.color}
                strokeWidth={4}
                lineCap="round"
                lineJoin="round"
                shadowColor={line.color}
                shadowBlur={6}
                shadowOpacity={0.6}
              />
            ))}

            {/* Draggable handles for existing line points */}
            {lines.map((line) =>
              line.points.map((p, idx) => (
                <Circle
                  key={`${line.id}-${idx}`}
                  x={p.x}
                  y={p.y}
                  radius={5}
                  fill={line.color}
                  stroke="#1E1E1E"
                  strokeWidth={1}
                  draggable
                  onDragMove={(e) =>
                    movePoint(line.id, idx, { x: e.target.x(), y: e.target.y() })
                  }
                />
              ))
            )}

            {/* In-progress draft line */}
            {draftPoints.length > 0 && (
              <KonvaLine
                points={flatten(draftPoints)}
                stroke={draftColor}
                strokeWidth={3}
                dash={[6, 4]}
              />
            )}
            {draftPoints.map((p, idx) => (
              <Circle key={`draft-${idx}`} x={p.x} y={p.y} radius={4} fill={draftColor} />
            ))}

            {/* Calibration points */}
            {calibrationPoints.map((p, idx) => (
              <Circle key={`cal-${idx}`} x={p.x} y={p.y} radius={5} fill="#C62828" />
            ))}
            {calibrationPoints.length === 2 && (
              <KonvaLine points={flatten(calibrationPoints)} stroke="#C62828" strokeWidth={2} dash={[4, 4]} />
            )}
          </Layer>
        </Stage>
      </div>

      {!imageUrl && (
        <p className="text-xs text-neutral-400 mt-2">
          Load a property image above before drawing lines.
        </p>
      )}

      {/* Line list */}
      {lines.length > 0 && (
        <div className="mt-4 space-y-2">
          {lines.map((line) => (
            <div key={line.id} className="flex items-center gap-2 text-sm bg-neutral-50 rounded-lg p-2">
              <span
                className="inline-block w-3 h-3 rounded-full"
                style={{ backgroundColor: line.color }}
              />
              <input
                className="flex-1 bg-transparent border-b border-transparent focus:border-neutral-300 outline-none"
                value={line.label}
                onChange={(e) => updateLine(line.id, { label: e.target.value })}
              />
              <span className="text-neutral-400 text-xs">
                {LINE_TYPE_LABELS[line.type]}
                {line.source === "ai_suggested" ? " · AI" : ""}
              </span>
              <span className="text-neutral-500 text-xs w-16">
                {(line.manualOverrideFeet ?? line.calculatedFeet ?? 0).toFixed(1)} ft
              </span>
              <input
                type="number"
                placeholder="override"
                value={line.manualOverrideFeet ?? ""}
                onChange={(e) =>
                  updateLine(line.id, {
                    manualOverrideFeet: e.target.value === "" ? null : parseFloat(e.target.value),
                  })
                }
                className="w-20 text-xs rounded border border-neutral-200 px-1 py-0.5"
              />
              <button
                type="button"
                onClick={() => deleteLine(line.id)}
                className="text-hlg-red-dark text-xs font-semibold"
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
});

export default DrawingCanvas;
