// Server-side only — shared by src/app/api/property-image/route.ts (manual
// "Load Property" button) AND src/services/workiz.ts (automated webhook
// intake), so both paths behave identically.
//
// Fetches BOTH a street-level photo (for display/export) and a top-down
// aerial image (for exact scale) from a single geocode lookup. The aerial
// image's scale is mathematically derivable from its known zoom level and
// geography — never a guess. The street-level photo has no such thing
// (a flat photo has no depth information), which is exactly why we also
// fetch the aerial one: src/lib/aiSuggest.server.ts uses it to find a real
// feature visible in both photos and import the aerial's exact scale into
// the street-view photo via that match.

import { geocodeAddress } from "@/lib/geocode";
import { fetchJohnsonCountyElevationPhotos, fetchJacksonCountyPhotos } from "@/lib/countyPhoto.server";
import { selectFrontFacingPhoto } from "@/lib/aiSuggest.server";
import type { AerialImageInfo, PropertyImagesResult, StreetViewImageInfo } from "@/types";

const IMAGE_WIDTH_PX = 640;
const IMAGE_HEIGHT_PX = 400;
const METERS_TO_FEET = 3.28084;

export async function fetchPropertyImages(address: string): Promise<PropertyImagesResult> {
  const traceId = Math.random().toString(36).slice(2, 8);
  const log = (message: string) => console.log(`[propertyImage:${traceId}] ${message}`);
  log(`started for address "${address}"`);
  const geo = await geocodeAddress(address);
  if ("error" in geo) {
    log(`geocoding failed: ${geo.error}`);
    return { available: false, error: geo.error, streetView: null, aerial: null };
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;

  const aerial: AerialImageInfo = apiKey
    ? buildGoogleAerial(geo.lat, geo.lng, apiKey)
    : buildFreeAerial(geo.lat, geo.lng);

  // Prefer a real county assessor elevation photo when one can be found —
  // see src/lib/countyPhoto.server.ts for what this covers (Johnson County,
  // KS and Jackson County, MO, so far) and its real caveats, including a
  // closed-shadow-root workaround for Jackson County that's more fragile
  // than the rest. Falls through to Google Street View when nothing is
  // found (any other county, or either scraper hitting an error) — this is
  // intentionally silent-and-graceful, not an error condition.
  //
  // Only worth attempting the matching scraper for addresses that look like
  // they're in that state — both scrapers are single-county specific, and
  // running one against an address from the wrong state would just burn
  // 10+ seconds hitting timeouts before falling through anyway. This is a
  // cheap heuristic, not a guarantee — an address in the right state but
  // the wrong county still hits that same timeout cost once, then falls
  // through normally.
  //
  // "Kansas City" is a real bug trap here: it's a MISSOURI city whose name
  // contains the literal word "Kansas" — a naive /\bkansas\b/ check on the
  // full address string false-matches it, misrouting Missouri addresses to
  // the Kansas scraper (confirmed happening in production logs). Fix:
  // prefer matching the state token that comes right after the address's
  // last comma (the actual state field in "Street City, State Zip"), which
  // "Kansas City" never satisfies since it sits before that comma, not
  // after it. Only fall back to a whole-string check if no comma segment
  // matched either state — and even then, check Missouri first specifically
  // because of this same false-positive risk.
  const lastCommaSegment = address.slice(address.lastIndexOf(",") + 1);
  const looksLikeMissouri =
    /\b(missouri|mo)\b/i.test(lastCommaSegment) || /\b(missouri|mo)\b/i.test(address);
  const looksLikeKansas =
    !looksLikeMissouri &&
    (/\b(kansas|ks)\b/i.test(lastCommaSegment) || /\b(kansas|ks)\b/i.test(address));
  log(`looksLikeKansas=${looksLikeKansas}, looksLikeMissouri=${looksLikeMissouri}`);

  let streetView: StreetViewImageInfo | null = null;

  let candidates: { imageUrl: string; imageDate: string | null }[] = [];
  log(`streetOnly from geocoder: ${geo.streetOnly ?? "(not available — falling back to regex trim)"}`);

  if (looksLikeKansas) {
    candidates = await fetchJohnsonCountyElevationPhotos(address, geo.streetOnly).catch((err) => {
      log(`Johnson County scraper threw: ${err instanceof Error ? err.message : String(err)}`);
      return [];
    });
  } else if (looksLikeMissouri) {
    candidates = await fetchJacksonCountyPhotos(address, geo.streetOnly).catch((err) => {
      log(`Jackson County scraper threw: ${err instanceof Error ? err.message : String(err)}`);
      return [];
    });
  } else {
    log("address did not look Kansas- or Missouri-based — skipping county scraper entirely, going straight to Google/aerial");
  }

  let countyPhoto: { imageUrl: string; imageDate: string | null } | null = null;
  if (candidates.length > 0) {
    log(`${candidates.length} county photo candidate(s) found — asking AI which one shows the front`);
    countyPhoto = await selectFrontFacingPhoto(candidates, traceId).catch((err) => {
      log(`selectFrontFacingPhoto threw: ${err instanceof Error ? err.message : String(err)}`);
      return candidates[0] ?? null;
    });
  }

  console.log(`[propertyImage] after county selection: ${countyPhoto ? "county photo selected" : "no county photo selected"}`);
  if (countyPhoto) {
    log(`returning county assessor photo${countyPhoto.imageDate ? ` dated ${countyPhoto.imageDate}` : ""}`);
    streetView = {
      imageUrl: countyPhoto.imageUrl,
      source: "county_assessor",
      imageDate: countyPhoto.imageDate,
    };
  } else if (apiKey) {
    log("no county photo selected — attempting Google Street View");
    streetView = await tryBuildStreetView(geo.lat, geo.lng, apiKey);
  }

  log(`completed with ${streetView?.source ?? "no"} street-level photo`);

  return {
    available: true,
    formattedAddress: geo.formattedAddress,
    lat: geo.lat,
    lng: geo.lng,
    streetView,
    aerial,
  };
}

async function tryBuildStreetView(
  lat: number,
  lng: number,
  apiKey: string
): Promise<StreetViewImageInfo | null> {
  const metadataUrl = new URL("https://maps.googleapis.com/maps/api/streetview/metadata");
  metadataUrl.searchParams.set("location", `${lat},${lng}`);
  metadataUrl.searchParams.set("key", apiKey);

  try {
    const metaRes = await fetch(metadataUrl.toString());
    const meta = await metaRes.json();
    if (meta.status !== "OK") return null;
  } catch {
    return null;
  }

  const streetViewUrl = new URL("https://maps.googleapis.com/maps/api/streetview");
  streetViewUrl.searchParams.set("size", `${IMAGE_WIDTH_PX}x${IMAGE_HEIGHT_PX}`);
  streetViewUrl.searchParams.set("location", `${lat},${lng}`);
  streetViewUrl.searchParams.set("fov", "80");
  streetViewUrl.searchParams.set("key", apiKey);

  return { imageUrl: streetViewUrl.toString(), source: "google_street_view" };
}

/**
 * Google Static Maps images use the standard Web Mercator tile resolution:
 * metersPerPixel = 156543.03392 * cos(latitude) / 2^zoom
 * (valid at the default `scale=1`). Holds uniformly in both directions near
 * the map's center, so one value works for both x and y at this zoom.
 */
function buildGoogleAerial(lat: number, lng: number, apiKey: string): AerialImageInfo {
  const zoom = 20;
  const staticMapUrl = new URL("https://maps.googleapis.com/maps/api/staticmap");
  staticMapUrl.searchParams.set("center", `${lat},${lng}`);
  staticMapUrl.searchParams.set("zoom", String(zoom));
  staticMapUrl.searchParams.set("size", `${IMAGE_WIDTH_PX}x${IMAGE_HEIGHT_PX}`);
  staticMapUrl.searchParams.set("maptype", "satellite");
  staticMapUrl.searchParams.set("key", apiKey);

  const metersPerPixel = (156543.03392 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, zoom);
  const feetPerPixel = metersPerPixel * METERS_TO_FEET;
  const pixelsPerFoot = 1 / feetPerPixel;
  const referenceFeet = IMAGE_WIDTH_PX * feetPerPixel;

  return {
    imageUrl: staticMapUrl.toString(),
    source: "static_map",
    pixelsPerFoot,
    referenceFeet,
  };
}

/**
 * Free, keyless aerial image from Esri's public World Imagery service.
 * Bounding box aspect ratio matches the image's aspect ratio (640:400) so
 * ground distance-per-pixel is identical in both directions.
 */
function buildFreeAerial(lat: number, lng: number): AerialImageInfo {
  const groundWidthMeters = 60;
  const groundHeightMeters = groundWidthMeters * (IMAGE_HEIGHT_PX / IMAGE_WIDTH_PX);

  const metersPerDegreeLat = 110_540;
  const metersPerDegreeLng = 111_320 * Math.cos((lat * Math.PI) / 180);

  const halfLatDelta = groundHeightMeters / 2 / metersPerDegreeLat;
  const halfLngDelta = groundWidthMeters / 2 / metersPerDegreeLng;

  const bbox = [
    lng - halfLngDelta,
    lat - halfLatDelta,
    lng + halfLngDelta,
    lat + halfLatDelta,
  ].join(",");

  const url = new URL(
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export"
  );
  url.searchParams.set("bbox", bbox);
  url.searchParams.set("bboxSR", "4326");
  url.searchParams.set("imageSR", "4326");
  url.searchParams.set("size", `${IMAGE_WIDTH_PX},${IMAGE_HEIGHT_PX}`);
  url.searchParams.set("format", "png");
  url.searchParams.set("transparent", "false");
  url.searchParams.set("f", "image");

  const referenceFeet = groundWidthMeters * METERS_TO_FEET;
  const pixelsPerFoot = IMAGE_WIDTH_PX / referenceFeet;

  return {
    imageUrl: url.toString(),
    source: "satellite_free",
    pixelsPerFoot,
    referenceFeet,
  };
}
