// Server-side only. Never import this file from a "use client" component —
// GOOGLE_MAPS_API_KEY (when set) must never reach the browser bundle.

export interface GeocodeResult {
  formattedAddress: string;
  lat: number;
  lng: number;
  /** Which provider actually answered — surfaced so the UI/PDF can be honest about source quality. */
  provider: "google" | "osm";
  /**
   * Just "[house number] [street name]" with no city/state/zip, when the
   * provider's structured address data made this extractable. Needed by
   * src/lib/countyPhoto.server.ts — both county search boxes expect
   * street-only input, and a plain regex trim of the raw typed address
   * can't reliably strip a city name that has no comma separating it from
   * the street (confirmed breaking in production: "2 East Dartmouth Road
   * Kansas City" still had "Kansas City" attached, and never matched).
   * Falls back to undefined if extraction wasn't possible.
   */
  streetOnly?: string;
}

export interface GeocodeError {
  error: string;
}

/**
 * Validates and geocodes a street address.
 *
 * - If GOOGLE_MAPS_API_KEY is set, uses Google's Geocoding API (requires a
 *   Google Cloud project with billing enabled and the Geocoding API turned on).
 * - Otherwise, falls back to OpenStreetMap's free Nominatim service — no
 *   API key, no project, no billing account required at all.
 *
 * Nominatim is a shared public service with a rate limit (roughly 1
 * request/second) and usage policy (https://operations.osmfoundation.org/policies/nominatim/) —
 * fine for an internal tool used by one team, but don't hammer it in a loop.
 */
export async function geocodeAddress(
  address: string
): Promise<GeocodeResult | GeocodeError> {
  if (!address || address.trim().length < 5) {
    return { error: "Address is too short or empty." };
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  return apiKey ? geocodeWithGoogle(address, apiKey) : geocodeWithNominatim(address);
}

async function geocodeWithGoogle(
  address: string,
  apiKey: string
): Promise<GeocodeResult | GeocodeError> {
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("address", address);
  url.searchParams.set("key", apiKey);

  try {
    const res = await fetch(url.toString());
    if (!res.ok) {
      return { error: `Geocoding request failed with status ${res.status}.` };
    }
    const data = await res.json();

    if (data.status !== "OK" || !data.results?.length) {
      return {
        error: `Address could not be validated (status: ${data.status ?? "unknown"}). Please double-check the address.`,
      };
    }

    const result = data.results[0];

    // Google's address_components carry a "types" array — pull just the
    // street number and route (street name) to build a clean street-only
    // string, ignoring locality/city entirely.
    const components: Array<{ long_name: string; types: string[] }> = result.address_components ?? [];
    const streetNumber = components.find((c) => c.types.includes("street_number"))?.long_name;
    const route = components.find((c) => c.types.includes("route"))?.long_name;
    const streetOnly = streetNumber && route ? `${streetNumber} ${route}` : undefined;

    return {
      formattedAddress: result.formatted_address,
      lat: result.geometry.location.lat,
      lng: result.geometry.location.lng,
      provider: "google",
      streetOnly,
    };
  } catch (err) {
    return {
      error: `Geocoding request threw an error: ${
        err instanceof Error ? err.message : "unknown error"
      }`,
    };
  }
}

async function geocodeWithNominatim(
  address: string
): Promise<GeocodeResult | GeocodeError> {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", address);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");
  // addressdetails=1 gives structured components (house_number, road, etc.)
  // — needed to build a clean street-only string for the county scrapers.
  url.searchParams.set("addressdetails", "1");

  try {
    const res = await fetch(url.toString(), {
      headers: {
        // Nominatim's usage policy requires a descriptive User-Agent identifying the app.
        "User-Agent": "holiday-light-guys-estimator/0.1 (internal estimating tool)",
      },
    });
    if (!res.ok) {
      return { error: `Geocoding request failed with status ${res.status}.` };
    }
    const data = await res.json();

    if (!Array.isArray(data) || data.length === 0) {
      return {
        error: "Address could not be validated. Please double-check the address.",
      };
    }

    const result = data[0];
    const addr = result.address ?? {};
    const streetOnly =
      addr.house_number && addr.road ? `${addr.house_number} ${addr.road}` : undefined;

    return {
      formattedAddress: result.display_name,
      lat: parseFloat(result.lat),
      lng: parseFloat(result.lon),
      provider: "osm",
      streetOnly,
    };
  } catch (err) {
    return {
      error: `Geocoding request threw an error: ${
        err instanceof Error ? err.message : "unknown error"
      }`,
    };
  }
}
