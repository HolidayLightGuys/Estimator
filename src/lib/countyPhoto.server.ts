// Server-side only. Uses Puppeteer (a real, headless Chromium browser) to
// pull a real front/side elevation photo directly from two county assessor
// GIS systems:
//   - Johnson County, Kansas (ims.jocogov.org)
//   - Jackson County, Missouri (jcgis.jacksongov.org)
// Both were verified working manually against a real property before being
// written — every selector below is a real element ID/class found on the
// live site, not a guess.
//
// IMPORTANT — read before relying on this in production:
// 1. This is browser automation of public government websites, not an
//    official API for either county. Johnson County explicitly offers paid
//    "Data Subscription" / "Data Licensing" programs (see
//    aims.jocogov.org/ProductsAndServices) for anyone who wants durable,
//    sanctioned access — that's the responsible long-term path for real
//    production use, not indefinitely scraping. Jackson County's licensing
//    options weren't checked as of writing.
// 2. Both click through the site's own "I agree to these terms" dialog
//    programmatically every run. Whoever deploys this should actually read
//    those full agreements (only partially reviewed while building this) —
//    automating past a terms dialog doesn't change what was agreed to.
// 3. Each function only covers its own county. Johnson County's function
//    finds nothing outside Johnson County, KS; Jackson County's finds
//    nothing outside Jackson County, MO. Both fall through gracefully
//    (return an empty array) rather than erroring — the normal Street
//    View/aerial path picks up from there.
// 4. Both are slow (launch a real browser — several seconds per call) and
//    need a real server to run on, not serverless/edge — Puppeteer needs
//    to launch an actual Chromium binary.
// 5. Fragile by nature: if either county changes their page, that function
//    breaks until its selectors are updated to match.
// 6. Jackson County's flow has an extra wrinkle: the small "BASIC
//    INFORMATION" popup that appears after clicking a parcel on the map is
//    rendered inside a CLOSED shadow root — a browser feature that makes
//    its contents completely inaccessible to ANY script, Puppeteer
//    included, not just this file's own DOM queries. There is no selector
//    that can reach the "CLICK FOR PROPERTY INFO" button inside it. The
//    only way in is a coordinate-based mouse click at its on-screen pixel
//    position, which is what fetchJacksonCountyPhotos does below — verified
//    stable across repeated tests, but only at the exact viewport size the
//    function sets (1006x533). If Jackson County ever changes that popup's
//    layout or position, this breaks in a way no selector fix can address —
//    only new coordinates found by re-testing manually.

// 7. Neither county tags photos with which angle they show. Confirmed on a
//    real Johnson County property while building this: the "most recent" /
//    "currently selected" photo was a backyard shot, not the front. Both
//    functions below now return EVERY candidate photo they find (not just
//    one) — src/lib/propertyImage.server.ts uses
//    src/lib/aiSuggest.server.ts's selectFrontFacingPhoto() to actually
//    look at the candidates and pick the one that shows the front.

import puppeteer from "puppeteer";

export interface CountyElevationPhoto {
  imageUrl: string;
  /** ISO date (YYYY-MM-DD) parsed from the photo's "Image Date: MM/DD/YYYY" alt text, if present. Only ever populated for Johnson County — Jackson County's photos don't expose a parseable date. */
  imageDate: string | null;
}

/**
 * Best-effort trim of a full "street city, state zip" address down to
 * something closer to what a human would type into either county's search
 * box (both of their own examples are street-only, no city/state/zip).
 * Not guaranteed to produce a clean street-only string — addresses from
 * src/lib/parseWorkizLead.ts don't reliably have a comma between street
 * and city — but cutting off at the state/zip suffix measurably improves
 * match odds without risking cutting real street text. Shared by both
 * fetchJohnsonCountyElevationPhotos and fetchJacksonCountyPhotos below.
 */
function trimForCountySearch(address: string): string {
  return address
    .replace(/,?\s*(kansas|ks)\s*\d{0,5}\s*$/i, "")
    .replace(/,?\s*(missouri|mo)\s*\d{0,5}\s*$/i, "")
    .trim();
}

/**
 * Abbreviates directionals and street types to what both counties' search
 * widgets actually expect — confirmed by direct manual testing against the
 * live sites: "415 East 12th Street" (spelled out, from the geocoder's
 * structured data) returns zero matches, while "415 E 12TH ST" (abbreviated)
 * works. Jackson County's own on-page instructions even say this explicitly:
 * "Street types are in standard abbreviations (e.g. St, Pl, Ave)." Applied
 * to the geocoder's streetOnly value before it's typed into either county's
 * search box.
 */
function abbreviateStreetAddress(street: string): string {
  const directionals: Record<string, string> = {
    north: "N",
    south: "S",
    east: "E",
    west: "W",
    northeast: "NE",
    northwest: "NW",
    southeast: "SE",
    southwest: "SW",
  };
  const streetTypes: Record<string, string> = {
    street: "St",
    road: "Rd",
    avenue: "Ave",
    boulevard: "Blvd",
    drive: "Dr",
    lane: "Ln",
    court: "Ct",
    place: "Pl",
    circle: "Cir",
    parkway: "Pkwy",
    highway: "Hwy",
    terrace: "Ter",
    trail: "Trl",
    way: "Way",
  };

  return street
    .split(/\s+/)
    .map((word) => {
      const lower = word.toLowerCase();
      if (directionals[lower]) return directionals[lower];
      if (streetTypes[lower]) return streetTypes[lower];
      return word;
    })
    .join(" ");
}

export async function fetchJohnsonCountyElevationPhotos(
  address: string,
  /**
   * A clean "[house number] [street]" string from the geocoder's structured
   * address data (see src/lib/geocode.ts), if available. Preferred over the
   * regex-trimmed fallback below, since that trim can't reliably strip a
   * city name with no comma separating it from the street.
   */
  streetOnly?: string
): Promise<CountyElevationPhoto[]> {
  const log = (msg: string) => console.log(`[johnsonCountyPhoto] ${msg}`);
  const searchText = abbreviateStreetAddress(streetOnly || trimForCountySearch(address));
  if (!searchText) {
    log(`skipped — trimmed search text was empty for address: "${address}"`);
    return [];
  }
  log(`starting for address "${address}" -> search text "${searchText}"`);

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      // Required for Puppeteer's Chromium to launch inside most Linux
      // containers (Railway, Docker, etc.) — the default sandbox needs
      // kernel permissions those environments don't grant. Without these,
      // launch() throws immediately and this whole function silently
      // returns null, which looks identical to "county not found" from the
      // caller's side. Not needed on Windows/Mac, which is why this worked
      // locally the whole time but failed once deployed.
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    });
    const page = await browser.newPage();
    await page.setDefaultTimeout(20000);

    await page.goto("https://ims.jocogov.org/locationservices/", { waitUntil: "domcontentloaded" });
    log("page loaded");

    // Accept the site's terms dialog if it appears. See file header note #2
    // — this doesn't change what was actually agreed to, just automates
    // clicking through it.
    try {
      await page.waitForSelector("#btnDisclaimerYes", { timeout: 12000 });
      await page.click("#btnDisclaimerYes");
      log("accepted disclaimer dialog");
    } catch {
      log("no disclaimer dialog appeared (already accepted this session, or page structure changed)");
    }

    await page.waitForSelector("#tbSearchID", { timeout: 15000 });
    await page.click("#tbSearchID");
    await page.type("#tbSearchID", searchText, { delay: 40 });
    log("typed search text into #tbSearchID");

    // jQuery UI autocomplete — wait for the suggestion list to populate.
    await page.waitForSelector(".ui-autocomplete li", { timeout: 15000 });
    log("autocomplete suggestions appeared");

    // The first item is a non-clickable category header ("Address") in
    // this site's categorized autocomplete — skip it and click the first
    // real suggestion.
    const clickedSuggestion = await page.evaluate(() => {
      const items = Array.from(document.querySelectorAll(".ui-autocomplete li"));
      const first = items.find((li) => {
        const text = li.textContent?.trim();
        return text && text !== "Address";
      });
      if (first) {
        (first as HTMLElement).click();
        return true;
      }
      return false;
    });

    if (!clickedSuggestion) {
      log("no clickable suggestion found in the autocomplete list — address likely not in Johnson County");
      await browser.close();
      return [];
    }
    log("clicked first suggestion");

    // Wait for the results page's front-elevation-photo iframe to appear.
    await page.waitForSelector("#ifrFrontElev", { timeout: 15000 });
    log("#ifrFrontElev iframe appeared");
    // Give the iframe's own content a moment to finish loading images.
    await new Promise((resolve) => setTimeout(resolve, 3500));

    const results = await page.evaluate(() => {
      const frame = document.getElementById("ifrFrontElev") as HTMLIFrameElement | null;
      if (!frame || !frame.contentDocument) return [];

      const imgs = Array.from(frame.contentDocument.querySelectorAll("img")).filter((img) =>
        img.src.includes("/docs/appr/pics/")
      );

      // Dedupe by src — the site renders each photo twice (a thumbnail
      // "img" copy and, for one of them, an "imgSelected" copy of the same
      // underlying image).
      const seen = new Set<string>();
      const out: { imageUrl: string; imageDate: string | null }[] = [];
      for (const img of imgs) {
        if (seen.has(img.src)) continue;
        seen.add(img.src);
        const dateMatch = img.alt.match(/(\d{2})\/(\d{2})\/(\d{4})/);
        const imageDate = dateMatch ? `${dateMatch[3]}-${dateMatch[1]}-${dateMatch[2]}` : null;
        out.push({ imageUrl: img.src, imageDate });
      }
      // Most recent first — an arbitrary but reasonable default ordering;
      // the caller may re-pick based on which one actually shows the front.
      out.sort((a, b) => (b.imageDate ?? "").localeCompare(a.imageDate ?? ""));
      return out;
    });

    await browser.close();
    log(results.length > 0 ? `success — found ${results.length} candidate photo(s)` : "no photo images found inside the iframe");
    return results;
  } catch (err) {
    log(`FAILED with error: ${err instanceof Error ? err.message : String(err)}`);
    if (browser) {
      await browser.close().catch(() => {});
    }
    return [];
  }
}

/**
 * Jackson County, Missouri (jcgis.jacksongov.org/parcelviewer). Same overall
 * idea as fetchJohnsonCountyElevationPhotos above, but this county's site
 * requires two coordinate-based clicks instead of pure selectors — see file
 * header note #6 for exactly why (a closed shadow root blocks any other
 * approach to that one popup).
 */
export async function fetchJacksonCountyPhotos(
  address: string,
  streetOnly?: string
): Promise<CountyElevationPhoto[]> {
  const log = (msg: string) => console.log(`[jacksonCountyPhoto] ${msg}`);
  const searchText = abbreviateStreetAddress(streetOnly || trimForCountySearch(address));
  if (!searchText) {
    log(`skipped — trimmed search text was empty for address: "${address}"`);
    return [];
  }
  log(`starting for address "${address}" -> search text "${searchText}"`);

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      // Required for Puppeteer's Chromium to launch inside most Linux
      // containers (Railway, Docker, etc.) — the default sandbox needs
      // kernel permissions those environments don't grant. Without these,
      // launch() throws immediately and this whole function silently
      // returns null, which looks identical to "county not found" from the
      // caller's side. Not needed on Windows/Mac, which is why this worked
      // locally the whole time but failed once deployed.
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    });
    const page = await browser.newPage();
    // Fixed viewport — the two coordinate-based clicks below were verified
    // stable only at this exact size. Changing this without re-verifying
    // those coordinates will break the flow.
    await page.setViewport({ width: 1006, height: 533 });
    await page.setDefaultTimeout(20000);

    await page.goto("https://jcgis.jacksongov.org/parcelviewer/", { waitUntil: "domcontentloaded" });
    log("page loaded");

    try {
      await page.waitForSelector("#btnAgree", { timeout: 12000 });
      await page.click("#btnAgree");
      log("accepted disclaimer dialog");
    } catch {
      log("no disclaimer dialog appeared (already accepted this session, or page structure changed)");
    }

    await page.waitForSelector("#searchDiv-input", { timeout: 15000 });
    await page.click("#searchDiv-input");
    // This Esri search widget only responds to real keystroke events —
    // page.type sends those. Setting .value directly does NOT trigger its
    // suggestion list (confirmed while building this).
    await page.type("#searchDiv-input", searchText, { delay: 60 });
    log("typed search text into #searchDiv-input");

    await page.waitForSelector("li.esri-menu__list-item[role=option]", { timeout: 15000 });
    log("autocomplete suggestions appeared");
    const clickedSuggestion = await page.evaluate(() => {
      function findDeep(root: Document | ShadowRoot, sel: string): Element | null {
        for (const el of root.querySelectorAll(sel)) return el;
        for (const el of root.querySelectorAll("*")) {
          if (el.shadowRoot) {
            const found = findDeep(el.shadowRoot, sel);
            if (found) return found;
          }
        }
        return null;
      }
      const item = findDeep(document, "li.esri-menu__list-item[role=option]");
      if (item) {
        (item as HTMLElement).click();
        return true;
      }
      return false;
    });

    if (!clickedSuggestion) {
      log("no clickable suggestion found in the autocomplete list — address likely not in Jackson County");
      await browser.close();
      return [];
    }
    log("clicked first suggestion");

    // Wait for the map to finish zooming/panning to the selected parcel,
    // then click its center. See file header note #6 — this and the click
    // below are coordinate-based because the resulting popup lives inside
    // a closed shadow root with no selector-based way in.
    await new Promise((resolve) => setTimeout(resolve, 4000));
    await page.mouse.click(503, 266);
    log("clicked map center (attempting to open BASIC INFORMATION popup)");

    // "CLICK FOR PROPERTY INFO" inside that same closed-shadow-root popup —
    // same coordinate-click necessity.
    await new Promise((resolve) => setTimeout(resolve, 3000));
    await page.mouse.click(300, 437);
    log("clicked CLICK FOR PROPERTY INFO coordinate");

    // The detail panel that opens after that click is NOT in a closed
    // shadow root, so a real selector works again from here.
    await page.waitForSelector("#photostab", { timeout: 15000 });
    log("#photostab tab appeared");
    await page.click("#photostab");
    await new Promise((resolve) => setTimeout(resolve, 3500));

    const imageUrls = await page.evaluate(() => {
      function allImgsDeep(root: Document | ShadowRoot, out: HTMLImageElement[]) {
        root.querySelectorAll("img").forEach((img) => out.push(img as HTMLImageElement));
        root.querySelectorAll("*").forEach((el) => {
          if (el.shadowRoot) allImgsDeep(el.shadowRoot, out);
        });
      }
      const out: HTMLImageElement[] = [];
      allImgsDeep(document, out);
      const photos = out.filter((img) => img.className.includes("photo") && img.naturalWidth > 100);
      const seen = new Set<string>();
      const urls: string[] = [];
      for (const img of photos) {
        if (seen.has(img.src)) continue;
        seen.add(img.src);
        urls.push(img.src);
      }
      return urls;
    });

    await browser.close();
    log(imageUrls.length > 0 ? `success — found ${imageUrls.length} candidate photo(s)` : "no photo images found in the Photos tab");
    // Jackson County's photos don't expose a parseable date anywhere in the DOM.
    return imageUrls.map((imageUrl) => ({ imageUrl, imageDate: null }));
  } catch (err) {
    log(`FAILED with error: ${err instanceof Error ? err.message : String(err)}`);
    if (browser) {
      await browser.close().catch(() => {});
    }
    return [];
  }
}
