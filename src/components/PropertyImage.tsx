"use client";

import { useState } from "react";
import type { PropertyImagesResult } from "@/types";

export interface LoadedPropertyImage {
  /** What gets shown on canvas and exported — the real photo when available. */
  imageUrl: string;
  /** True if imageUrl is actually the aerial image (no Street View photo was available). */
  imageIsAerial: boolean;
  /** Always the aerial image URL, even when it's not what's displayed — used for AI scale cross-referencing. */
  aerialImageUrl: string;
  aerialPixelsPerFoot: number;
  aerialReferenceFeet: number;
}

export default function PropertyImage({
  address,
  onImageLoaded,
}: {
  address: string;
  onImageLoaded: (loaded: LoadedPropertyImage) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PropertyImagesResult | null>(null);
  const [usedAerialAsDisplay, setUsedAerialAsDisplay] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLoadProperty = async () => {
    if (!address.trim()) {
      setError("Enter an address first.");
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/property-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address }),
      });
      const data: PropertyImagesResult & { error?: string } = await res.json();

      if (!res.ok || !data.available || !data.aerial) {
        setError(data.error || "No property image available for this address.");
        setResult(data);
        return;
      }

      setResult(data);

      const imageIsAerial = !data.streetView;
      setUsedAerialAsDisplay(imageIsAerial);

      onImageLoaded({
        imageUrl: data.streetView?.imageUrl ?? data.aerial.imageUrl,
        imageIsAerial,
        aerialImageUrl: data.aerial.imageUrl,
        aerialPixelsPerFoot: data.aerial.pixelsPerFoot,
        aerialReferenceFeet: data.aerial.referenceFeet,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load property image.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="hlg-card p-5">
      <div className="flex items-center justify-between mb-2">
        <h2 className="font-semibold text-hlg-charcoal">Property Image</h2>
        <button
          type="button"
          onClick={handleLoadProperty}
          disabled={loading}
          className="px-4 py-2 rounded-lg bg-hlg-red text-white text-sm font-semibold hover:bg-hlg-red-dark transition-colors disabled:opacity-50"
        >
          {loading ? "Loading…" : "Load Property"}
        </button>
      </div>

      <p className="text-xs text-neutral-400 mb-2">
        Loads the best real photo available for the address (a county assessor photo when
        one exists, otherwise Google Street View), plus an aerial image behind the scenes to
        work out exact scale — the two get matched up automatically for measurement.
      </p>

      {error && (
        <p className="text-sm text-hlg-red-dark bg-red-50 rounded-lg p-2 mt-2">{error}</p>
      )}

      {result?.available && (
        <p className="text-xs text-neutral-400 mt-2">
          {usedAerialAsDisplay
            ? "No street-level photo available here — showing the aerial view instead, with exact scale."
            : result.streetView?.source === "county_assessor"
              ? `County assessor photo loaded${result.streetView.imageDate ? ` (taken ${result.streetView.imageDate})` : ""} — scale will be matched from the aerial reference automatically.`
              : "Google Street View photo loaded — scale will be matched from the aerial reference automatically."}
          {result.formattedAddress ? ` — ${result.formattedAddress}` : ""}
        </p>
      )}

      {!result && !error && (
        <p className="text-xs text-neutral-400 mt-2">
          Enter an address above, then click Load Property.
        </p>
      )}
    </div>
  );
}
