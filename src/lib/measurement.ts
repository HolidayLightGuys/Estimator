import type { Point, ScaleCalibration, DrawnLine } from "@/types";

export const MEASUREMENT_DISCLAIMER =
  "Measurement is an estimate and should be verified during installation.";

function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/**
 * Build a scale calibration from two points and a known real-world
 * distance. `meta.source` records how this calibration was established —
 * see the ScaleCalibration type for what each value means — defaulting to
 * "manual" (a human clicked two points and typed a distance) when omitted.
 */
export function createScaleCalibration(
  pointA: Point,
  pointB: Point,
  knownDistanceFeet: number,
  meta?: { source?: ScaleCalibration["source"]; label?: string }
): ScaleCalibration {
  const pixelDistance = distance(pointA, pointB);
  const pixelsPerFoot = knownDistanceFeet > 0 ? pixelDistance / knownDistanceFeet : 0;
  return {
    pointA,
    pointB,
    knownDistanceFeet,
    pixelsPerFoot,
    source: meta?.source ?? "manual",
    label: meta?.label,
  };
}

/**
 * Total pixel length of a multi-point line (sum of segment lengths).
 */
function totalPixelLength(points: Point[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += distance(points[i - 1], points[i]);
  }
  return total;
}

/**
 * Calculates a line's footage from pixel length using the calibrated scale.
 * Returns null if scale has not been calibrated yet (pixelsPerFoot <= 0) —
 * the UI should prompt the user to calibrate or enter footage manually.
 */
export function calculateLineFeet(
  points: Point[],
  calibration: ScaleCalibration | null
): number | null {
  if (!calibration || calibration.pixelsPerFoot <= 0) return null;
  const pixels = totalPixelLength(points);
  return Math.round((pixels / calibration.pixelsPerFoot) * 10) / 10;
}

/**
 * Recalculates calculatedFeet for every line given a (possibly new) scale
 * calibration. Does not touch manualOverrideFeet — overrides always win
 * downstream in pricing (see src/lib/pricing.ts:getBillableFeet).
 */
export function recalculateAllLines(
  lines: DrawnLine[],
  calibration: ScaleCalibration | null
): DrawnLine[] {
  return lines.map((line) => ({
    ...line,
    calculatedFeet: calculateLineFeet(line.points, calibration),
  }));
}

export function sumFeet(lines: DrawnLine[]): number {
  const total = lines.reduce((sum, line) => {
    const feet =
      line.manualOverrideFeet !== null && line.manualOverrideFeet !== undefined
        ? line.manualOverrideFeet
        : line.calculatedFeet ?? 0;
    return sum + feet;
  }, 0);
  return Math.round(total * 10) / 10;
}
