import { countrySettings, countryUrl, isRemarkableUrl } from "@/lib/countries";
import { Browser, Page, launchBrowser } from "@/lib/browser";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 300;

type ResourceSummary = { url: string; durationMs: number; transferSize: number; type: string; external: boolean; vendor?: string; purpose: string; role: string; impact: "high" | "medium" | "low"; suggestion: string };

type JourneyStep = {
  name: string;
  status: "complete" | "blocked" | "stopped";
  speedLight: "green" | "orange" | "red";
  journeyLight: "green" | "orange" | "red";
  trafficLight: "green" | "orange" | "red";
  issues: string[];
  inefficiencies: string[];
  url: string;
  title: string;
  durationMs: number;
  responseStatus: number | null;
  likelyCause: string;
  loaded: { resourceCount: number; transferSize: number; longTaskCount: number; scriptCount: number; imageCount: number; stylesheetCount: number; externalAssetCount: number; externalDomains: string[]; duplicateResources: { url: string; count: number; transferSize: number; durationMs: number; vendor?: string; purpose: string }[]; slowestResources: ResourceSummary[]; largestResources: ResourceSummary[] };
  note?: string;
  availableActions?: string[];
};


function text(value: string) { return value.replace(/\s+/g, " ").trim(); }

async function dismissOverlays(page: Page) {
  const close = page.getByRole("button", { name: /accept|agree|allow all|close|no thanks|later|got it|ok|godkänn|acceptera|tillåt alla|godkänn alla|samtycke|jag godkänner|senare/i }).first();
  if (await close.isVisible({ timeout: 500 }).catch(() => false)) await close.click().catch(() => undefined);
}

async function pageSnapshot(page: Page) {
  return page.evaluate(() => {
    const resources = performance.getEntriesByType("resource").map((entry) => {
      const resource = entry as PerformanceResourceTiming;
      const external = new URL(resource.name).origin !== window.location.origin;
      const resourceUrl = resource.name.toLowerCase();
      const vendor = [{ pattern: /tradedoubler/, name: "Tradedoubler" }, { pattern: /datadog|dd-rum/, name: "Datadog" }, { pattern: /google-analytics|googletagmanager|gtag/, name: "Google" }, { pattern: /segment/, name: "Segment" }, { pattern: /hotjar/, name: "Hotjar" }, { pattern: /newrelic|nr-data/, name: "New Relic" }, { pattern: /sentry/, name: "Sentry" }, { pattern: /clarity/, name: "Microsoft Clarity" }, { pattern: /fullstory/, name: "FullStory" }, { pattern: /optimizely/, name: "Optimizely" }, { pattern: /onetrust|trustarc/, name: "OneTrust" }].find((candidate) => candidate.pattern.test(resourceUrl))?.name;
      let purpose = resource.initiatorType || "asset";
      if (/analytics|google-analytics|gtag|segment|adobe-analytics/.test(resourceUrl)) purpose = "analytics";
      else if (/tag-manager|googletagmanager|tealium|ensighten/.test(resourceUrl)) purpose = "tag manager";
      else if (/consent|cookie|onetrust|trustarc/.test(resourceUrl)) purpose = "consent manager";
      else if (/adservice|doubleclick|advert|pixel|facebook|criteo/.test(resourceUrl)) purpose = "advertising / tracking";
      else if (/image|imgix|cloudinary|akamai|cdn-cgi\/image/.test(resourceUrl) || resource.initiatorType === "img") purpose = "image loader";
      else if (/api|graphql|ajax|json/.test(resourceUrl) || resource.initiatorType === "fetch" || resource.initiatorType === "xmlhttprequest") purpose = "API / data request";
      else if (resource.initiatorType === "script") purpose = "application script";
      else if (resource.initiatorType === "css" || resource.initiatorType === "link") purpose = "stylesheet";
      else if (resource.initiatorType === "font") purpose = "web font";
      const role = vendor === "Sentry" ? "Sentry security and error monitoring" : vendor === "Tradedoubler" ? "Tradedoubler affiliate tracking" : vendor === "Datadog" ? "Datadog performance monitoring" : vendor === "Google" ? "Google analytics or tag management" : vendor === "OneTrust" ? "Cookie consent management" : purpose === "image loader" ? "Image load" : purpose === "application script" ? "Website functionality" : purpose === "stylesheet" ? "Page styling" : purpose === "web font" ? "Text font" : purpose === "API / data request" ? "Product or page data request" : purpose === "analytics" ? "Visitor analytics" : purpose === "advertising / tracking" ? "Advertising or marketing tracking" : purpose === "tag manager" ? "Tag management" : purpose;
      const impact: "high" | "medium" | "low" = resource.duration >= 5000 || (resource.transferSize || 0) >= 1_000_000 ? "high" : resource.duration >= 1500 || (resource.transferSize || 0) >= 250_000 ? "medium" : "low";
      let suggestion = "Measure this resource against the critical rendering path and remove it if it is not needed for this journey step.";
      if (purpose === "analytics" || purpose === "advertising / tracking") suggestion = "Load after the page is interactive, consolidate vendors, and avoid blocking the critical rendering path.";
      else if (purpose === "tag manager") suggestion = "Audit tags triggered here and load non-essential tags after consent and user interaction.";
      else if (purpose === "consent manager") suggestion = "Keep the consent bundle small, cache it aggressively, and avoid delaying the primary page content.";
      else if (purpose === "image loader") suggestion = "Use responsive WebP or AVIF variants, correct dimensions, and lazy-load images below the fold.";
      else if (purpose === "API / data request") suggestion = "Reduce the response payload, cache stable data, and parallelize requests that do not depend on one another.";
      else if (purpose === "web font") suggestion = "Subset the font, preload only the required weights, and use font-display: swap.";
      else if (purpose === "stylesheet") suggestion = "Inline only critical styles and remove unused CSS from the initial route.";
      else if (purpose === "application script") suggestion = "Defer non-critical code, split by route or interaction, and remove unused dependencies from the initial bundle.";
      return { url: resource.name, durationMs: Math.round(resource.duration), transferSize: resource.transferSize || 0, type: resource.initiatorType, external, vendor, purpose, role, impact, suggestion };
    });
    const longTasks = performance.getEntriesByType("longtask");
    const duplicateResources = Array.from(resources.reduce((groups, resource) => {
      const group = groups.get(resource.url) || [];
      group.push(resource);
      groups.set(resource.url, group);
      return groups;
    }, new Map<string, typeof resources>()).entries()).filter(([, group]) => group.length > 1).map(([url, group]) => ({ url, count: group.length, transferSize: group.reduce((total, resource) => total + resource.transferSize, 0), durationMs: group.reduce((total, resource) => total + resource.durationMs, 0), vendor: group.find((resource) => resource.vendor)?.vendor, purpose: group.find((resource) => resource.purpose)?.purpose || "resource", role: group.find((resource) => resource.role)?.role || "Unknown resource" })).sort((left, right) => right.transferSize - left.transferSize).slice(0, 20);
    return {
      resourceCount: resources.length,
      transferSize: resources.reduce((total, resource) => total + resource.transferSize, 0),
      longTaskCount: longTasks.length,
      scriptCount: resources.filter((resource) => resource.type === "script").length,
      imageCount: resources.filter((resource) => resource.type === "img").length,
      stylesheetCount: resources.filter((resource) => resource.type === "link" || resource.type === "css").length,
      externalAssetCount: resources.filter((resource) => resource.external).length,
      externalDomains: Array.from(new Set(resources.filter((resource) => resource.external).map((resource) => new URL(resource.url).hostname))).slice(0, 20),
      duplicateResources,
      slowestResources: resources.sort((left, right) => right.durationMs - left.durationMs).slice(0, 5),
      largestResources: [...resources].sort((left, right) => right.transferSize - left.transferSize).slice(0, 5),
    };
  });
}

function likelyCause(snapshot: Awaited<ReturnType<typeof pageSnapshot>>, durationMs: number) {
  if (snapshot.slowestResources[0]?.durationMs >= 2000) return "One request is taking a long time, so the page has to wait before it feels ready.";
  if (snapshot.transferSize >= 3_000_000) return "This page downloads a lot of data before it is ready to use.";
  if (snapshot.longTaskCount >= 5) return "The browser is busy running JavaScript, which can make the page feel slow to use.";
  if (snapshot.resourceCount >= 180) return "This page loads many separate files, giving the browser more work to do.";
  if (durationMs >= 3000) return "This page takes more than 3 seconds to become ready.";
  return "This page loaded without a clear performance problem.";
}

function trafficAssessment(snapshot: Awaited<ReturnType<typeof pageSnapshot>>, durationMs: number, blocked: boolean, regionalPurchasePath: boolean) {
  const issues: string[] = [];
  if (blocked) issues.push("The page did not offer the button or link needed for this step.");
  if (regionalPurchasePath) issues.push("Some customers are sent to another retailer to buy, adding an extra step and a chance to lose the sale.");
  if (durationMs >= 5000) issues.push("Customers wait more than 5 seconds for this page.");
  else if (durationMs >= 3000) issues.push("Customers wait more than 3 seconds for this page.");
  if (snapshot.transferSize >= 8_000_000) issues.push("Customers must download more than 8 MB before this page is ready.");
  else if (snapshot.transferSize >= 3_000_000) issues.push("Customers must download more than 3 MB before this page is ready.");
  if (snapshot.longTaskCount >= 10) issues.push("Heavy JavaScript work can make taps and clicks feel unresponsive.");
  else if (snapshot.longTaskCount >= 5) issues.push("JavaScript work may make taps and clicks feel slow.");
  if (snapshot.resourceCount >= 180) issues.push("This page loads many separate files, increasing the chance of a slow load.");
  const speedLight = durationMs >= 5000 || snapshot.transferSize >= 8_000_000 || snapshot.longTaskCount >= 10 ? "red" : durationMs >= 3000 || snapshot.transferSize >= 3_000_000 || snapshot.longTaskCount >= 5 || snapshot.resourceCount >= 180 ? "orange" : "green";
  const journeyLight = blocked ? "red" : regionalPurchasePath ? "orange" : "green";
  const trafficLight = journeyLight === "red" || speedLight === "red" ? "red" : journeyLight === "orange" || speedLight === "orange" ? "orange" : "green";
  return { speedLight, journeyLight, trafficLight, issues } as const;
}

function repeatableChecks(snapshot: Awaited<ReturnType<typeof pageSnapshot>>, actions: string[], title: string) {
  const inefficiencies: string[] = [];
  const resources = [...snapshot.slowestResources, ...snapshot.largestResources];
  if (snapshot.duplicateResources.length > 0) inefficiencies.push(`${snapshot.duplicateResources.length} resource${snapshot.duplicateResources.length === 1 ? "" : "s"} loaded more than once; open this finding to see which files and how much data they used.`);
  const vendorNames = [...new Set(resources.map((resource) => resource.vendor).filter(Boolean))];
  if (vendorNames.length > 1) inefficiencies.push(`${vendorNames.join(", ")} load on this page; confirm each vendor is needed before the page is usable.`);
  if (snapshot.externalAssetCount >= 20) inefficiencies.push(`${snapshot.externalAssetCount} external resources load; reduce third-party code and keep only what supports this page or journey step.`);
  if (/homepage|products|available products|product selection/i.test(title) && !actions.some((action) => /shop|product|buy|configure|cart|basket|amazon/i.test(action))) inefficiencies.push("No clear next purchase action was detected; make the next step obvious to customers.");
  if (/product selection|configure/i.test(title) && !actions.some((action) => /configure|buy|cart|basket|amazon|add/i.test(action))) inefficiencies.push("No clear purchase or configuration action was detected on the product page.");
  return inefficiencies;
}

async function runStep(page: Page, name: string, action: () => Promise<import("playwright").Response | null>): Promise<JourneyStep> {
  const started = Date.now();
  let responseStatus: number | null = null;
  let note: string | undefined;
  try {
    const response = await action();
    responseStatus = response?.status() ?? null;
    await page.waitForLoadState("domcontentloaded", { timeout: 10000 }).catch(() => undefined);
    await page.waitForTimeout(250);
  } catch (error) {
    note = error instanceof Error ? error.message : "The journey action failed.";
  }
  const durationMs = Date.now() - started;
  const loaded = await pageSnapshot(page).catch(() => ({ resourceCount: 0, transferSize: 0, longTaskCount: 0, scriptCount: 0, imageCount: 0, stylesheetCount: 0, externalAssetCount: 0, externalDomains: [], duplicateResources: [], slowestResources: [], largestResources: [] }));
  const blocked = Boolean(note);
  const regionalPurchasePath = await page.locator("body").evaluate((body) => /to buy[\s\S]{0,120}amazon|does not ship to|available in your country/i.test((body as HTMLElement).innerText)).catch(() => false);
  const commerceStep = /products|available products|product selection|configure|shop/i.test(name);
  const actions = await availableActions(page);
  const assessment = trafficAssessment(loaded, durationMs, blocked, regionalPurchasePath && commerceStep);
  const inefficiencies = repeatableChecks(loaded, actions, name);
  return { name, status: blocked ? "blocked" : "complete", ...assessment, inefficiencies, url: page.url(), title: text(await page.title().catch(() => "")), durationMs, responseStatus, likelyCause: likelyCause(loaded, durationMs), loaded, ...(note ? { note, availableActions: actions } : {}) };
}

async function matchingLinks(page: Page, pattern: RegExp, kind: "shop" | "category" | "product") {
  const links = await page.locator("a[href]").evaluateAll((anchors, expression) => anchors.map((anchor) => ({ href: (anchor as HTMLAnchorElement).href, label: (anchor as HTMLAnchorElement).innerText.replace(/\s+/g, " ").trim() })).filter((link) => new URL(link.href).hostname === window.location.hostname && new RegExp(expression as string, "i").test(`${link.label} ${link.href}`)), pattern.source);
  const excluded = /reasons-to-buy|support|service|contact|manual|accessor|spare-part|registration|store-locator/i;
  const categoryPath = /kitchen|laundry|washing|dishwasher|refrigerator|cooking|vitvaror|tvätt|tork|diskmaskin|kyl|frys|matlagning/i;
  const categoryEnd = /\/(kitchen|laundry|washing-machines|dishwashers|refrigerators|microwaves|ovens|oven|dishwasher|washing-machine|dryer|fridge-freezer|microwave|pyrolytic-oven|front-load-washing-machines|tvättmaskiner|diskmaskiner|kylskåp|mikrovågsugnar)\/?$/i;
  const currentPath = new URL(page.url()).pathname;
  return links.sort((left, right) => {
    const score = (link: { href: string; label: string }) => {
      const path = new URL(link.href).pathname;
      let value = 0;
      if (excluded.test(path)) value -= 1000;
      if (kind === "product" && path === currentPath) value -= 1000;
      if (kind === "shop" && /shop|store|products|appliances|buy/i.test(`${link.label} ${path}`)) value += 120;
      if (categoryPath.test(path)) value += kind === "category" ? 100 : 30;
      if (kind === "category" && /laundry|washing|tvätt|tork/i.test(path)) value += 40;
      if (kind === "product") {
        if (/\/(shop\/all|products?)\//i.test(path)) value += 120;
        if (/type-folio|marker|cable|accessor|folio/i.test(path)) value -= 500;
        if (/\/shop\/all\//i.test(path)) value += 100;
        if (path.split("/").filter(Boolean).length >= 4) value += 20;
        if (categoryEnd.test(path)) value -= 100;
      }
      if (link.label.length > 8) value += 2;
      return value;
    };
    return score(right) - score(left);
  }).map((link) => link.href);
}

async function matchingLink(page: Page, pattern: RegExp, kind: "shop" | "category" | "product") {
  return (await matchingLinks(page, pattern, kind))[0];
}

async function findSellableProduct(page: Page, pattern: RegExp) {
  const cardCandidates = await page.locator('[data-webid="plp-product-card"]').evaluateAll((cards) => cards.map((card) => (card.closest("a") || card.querySelector("a"))?.getAttribute("href")).filter((href): href is string => Boolean(href)));
  const rankedCandidates = await matchingLinks(page, pattern, "product");
  const candidates = [...new Set([...cardCandidates, ...rankedCandidates])]
    .filter((href) => !(/remarkable\.com/i.test(page.url()) && /remarkable-(?:1|2)(?:[/?]|$)/i.test(href)))
    .slice(0, 8);
  const candidate = candidates[0];
  if (!candidate) return undefined;
  const productUrl = new URL(candidate, page.url());
  productUrl.searchParams.set("d2cSellable", "true");
  return productUrl.toString();
}

async function availableActions(page: Page) {
  return page.locator("button, a, [role='button'], input[type='submit'], [data-testid]").evaluateAll((elements) => elements.map((element) => (element as HTMLElement).innerText || element.getAttribute("aria-label") || element.getAttribute("title") || (element as HTMLInputElement).value || "").map((label) => label.replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, 30));
}

async function clickText(page: Page, pattern: RegExp) {
  const candidates = page.locator("button, a, [role='button'], input[type='submit'], [data-testid], [class*='cart'], [class*='basket'], [class*='checkout']");
  const index = await candidates.evaluateAll((elements, expression) => elements.findIndex((element) => {
    const style = window.getComputedStyle(element);
    const rectangle = element.getBoundingClientRect();
    const visible = style.display !== "none" && style.visibility !== "hidden" && rectangle.width > 0 && rectangle.height > 0;
    const label = (element as HTMLElement).innerText || element.getAttribute("aria-label") || element.getAttribute("title") || (element as HTMLInputElement).value || "";
    return visible && new RegExp(expression as string, "i").test(label.replace(/\s+/g, " ").trim());
  }), pattern.source);
  if (index >= 0) { await candidates.nth(index).evaluate((element) => (element as HTMLElement).click()); return; }
  const actions = await availableActions(page);
  throw new Error(`Could not find an action matching ${pattern}. Visible actions: ${actions.join(" | ") || "none"}.`);
}

async function openCart(page: Page) {
  const bundleClose = page.getByRole("button", { name: /lägg till en produkt och få rabatt.*stäng/i }).first();
  if (await bundleClose.isVisible({ timeout: 500 }).catch(() => false)) await bundleClose.click().catch(() => undefined);
  const miniBasket = page.locator('[data-webid="mini-basket-shopping-carts"]').first();
  if (await miniBasket.count() && await miniBasket.isVisible().catch(() => false)) {
    await miniBasket.click({ timeout: 3000 });
    return;
  }
  await clickText(page, /^(?!.*(?:lägg i|add to|buy now)).*(cart|basket|varukorg|kundvagn|gå till kassan)/);
}

async function openCheckout(page: Page) {
  const candidates = page.locator("button, a, [role='button'], input[type='submit'], [data-testid], [class*='checkout']");
  const index = await candidates.evaluateAll((elements) => elements.findIndex((element) => {
    const style = window.getComputedStyle(element);
    const rectangle = element.getBoundingClientRect();
    const webId = element.getAttribute("data-webid");
    const label = (element as HTMLElement).innerText || element.getAttribute("aria-label") || element.getAttribute("title") || (element as HTMLInputElement).value || "";
    return webId !== "mini-basket-shopping-carts" && style.display !== "none" && style.visibility !== "hidden" && rectangle.width > 0 && rectangle.height > 0 && /checkout|kassa|gå till kassan|till kassan|fortsätt till kassan/i.test(label.replace(/\s+/g, " ").trim());
  }));
  if (index >= 0) { await candidates.nth(index).click({ timeout: 3000 }); return; }
  await clickText(page, /checkout|kassa|gå till kassan|till kassan|fortsätt till kassan/);
}

async function addProductToCart(page: Page) {
  await dismissOverlays(page);
  const electroluxButton = page.locator('[data-webid="add-to-cart"]:visible').first();
  if (await electroluxButton.waitFor({ state: "visible", timeout: 5000 }).then(() => true).catch(() => false)) {
    await electroluxButton.click({ timeout: 3000, noWaitAfter: true });
    return;
  }
  await clickText(page, /add to (cart|basket)|buy now|lägg i varukorg|lägg i kundvagn/);
}

async function configureProduct(page: Page) {
  await dismissOverlays(page);
  await clickText(page, /configure|customi[sz]e|choose your|select options|start configuring|kom igång/);
}

async function chooseRemarkableOptions(page: Page) {
  const bundle = page.getByRole("radio", { name: /best value|sleeve folio bundle|type folio bundle/i }).first();
  if (await bundle.isVisible({ timeout: 3000 }).catch(() => false)) {
    await bundle.evaluate((element) => (element as HTMLInputElement).click());
    await page.waitForTimeout(250);
  }
}

async function addRemarkableProductToCart(page: Page) {
  await addProductToCart(page);
  await page.getByRole("link", { name: /checkout/i }).first().waitFor({ state: "visible", timeout: 10000 });
}

export async function POST(request: Request) {
  let input: { url?: string; country?: string };
  try { input = await request.json(); } catch { return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 }); }
  let startUrl: URL;
  try { startUrl = new URL(countryUrl(input.url || "", input.country || "US")); if (!/^https?:$/.test(startUrl.protocol)) throw new Error(); } catch { return NextResponse.json({ error: "Enter a valid http(s) website URL." }, { status: 400 }); }
  const settings = countrySettings(input.country || "US");

  let browser: Browser | undefined;
  try {
    browser = await launchBrowser();
    const page = await browser.newPage({ userAgent: "WebQualityAgent/0.1", locale: settings.locale, timezoneId: settings.timezone, extraHTTPHeaders: { "Accept-Language": `${settings.locale},${settings.locale.split("-")[0]};q=0.9` } });
    const steps: JourneyStep[] = [];
    const isRemarkable = isRemarkableUrl(startUrl);
    const isProductsStart = /^\/(?:[a-z]{2}\/)?products\/?$/i.test(startUrl.pathname);
    const homepageUrl = isRemarkable && isProductsStart ? countryUrl(`${startUrl.origin}/`, input.country || "US") : startUrl.toString();
    steps.push(await runStep(page, "Homepage", async () => { const response = await page.goto(homepageUrl, { waitUntil: "domcontentloaded", timeout: 20000 }); await dismissOverlays(page); return response; }));
    const currentPath = new URL(page.url()).pathname;
    const shopUrl = /\/(products|shop)(?:\/|$)/i.test(currentPath) ? page.url() : await matchingLink(page, /shop|store|products|appliances|buy|handla|produkter|butik/, "shop");
    if (!shopUrl) throw new Error("No shop link was found on the homepage.");
    if (!isRemarkable || !isProductsStart) {
      steps.push(await runStep(page, "Shop", async () => { const response = await page.goto(isRemarkable ? shopUrl : countryUrl(shopUrl, input.country || "US"), { waitUntil: "domcontentloaded", timeout: 20000 }); await dismissOverlays(page); return response; }));
    }
    const shopPath = new URL(page.url()).pathname;
    const productListingUrl = /\/(products|shop)(?:\/|$)/i.test(shopPath) ? page.url() : await matchingLink(page, /laundry|kitchen|washing|dishwasher|refrigerator|cooking|vitvaror|tvätt|tork|diskmaskin|kyl|frys|matlagning|paper|tablet|accessor|product|shop/, "category");
    if (!productListingUrl) throw new Error("No product listing was found in the shop.");
    const sellableProductListingUrl = new URL(productListingUrl);
    sellableProductListingUrl.searchParams.set("d2cSellable", "true");
    steps.push(await runStep(page, "Available products", async () => { const response = await page.goto(isRemarkable ? sellableProductListingUrl.toString() : countryUrl(sellableProductListingUrl.toString(), input.country || "US"), { waitUntil: "domcontentloaded", timeout: 20000 }); await dismissOverlays(page); return response; }));
    await page.waitForTimeout(1000);
    const productUrl = await findSellableProduct(page, /.+/);
    if (!productUrl) {
      const anchorCount = await page.locator("a[href]").count();
      throw new Error(`No sellable product was found on ${page.url()} (${anchorCount} links inspected). The category may require a region, consent, or client-side product selection before product URLs are exposed.`);
    }
    steps.push(await runStep(page, "Product selection", async () => { const response = await page.goto(isRemarkable ? productUrl : countryUrl(productUrl, input.country || "US"), { waitUntil: "domcontentloaded", timeout: 20000 }); await dismissOverlays(page); return response; }));
    steps.push(await runStep(page, isRemarkable ? "Configure product" : "Add product to cart", async () => { if (isRemarkable) await configureProduct(page); else await addProductToCart(page); return null; }));
    if (steps[steps.length - 1].status === "blocked") return NextResponse.json({ startUrl: startUrl.toString(), stoppedAtPayment: false, steps });
    if (isRemarkable) {
      steps.push(await runStep(page, "Choose bundle and add-ons", async () => { await chooseRemarkableOptions(page); return null; }));
      if (steps[steps.length - 1].status === "blocked") return NextResponse.json({ startUrl: startUrl.toString(), stoppedAtPayment: false, steps });
      steps.push(await runStep(page, "Add product to cart", async () => { await addRemarkableProductToCart(page); return null; }));
      if (steps[steps.length - 1].status === "blocked") return NextResponse.json({ startUrl: startUrl.toString(), stoppedAtPayment: false, steps });
      steps.push(await runStep(page, "Checkout", async () => { await openCheckout(page); return null; }));
      return NextResponse.json({ startUrl: startUrl.toString(), stoppedAtPayment: false, steps });
    }
    steps.push(await runStep(page, "Open cart", async () => { await openCart(page); return null; }));
    if (steps[steps.length - 1].status === "blocked") return NextResponse.json({ startUrl: startUrl.toString(), stoppedAtPayment: false, steps });
    steps.push(await runStep(page, "Checkout", async () => { await openCheckout(page); return null; }));

    let stoppedAtPayment = false;
    for (let index = 0; index < 5; index += 1) {
      const isPayment = await page.getByText(/payment|card number|credit card|paypal/i).first().isVisible({ timeout: 500 }).catch(() => false);
      if (isPayment) { stoppedAtPayment = true; break; }
      const next = page.getByRole("button", { name: /continue|proceed|next|review order/ }).first();
      if (!(await next.isVisible({ timeout: 1000 }).catch(() => false))) break;
      steps.push(await runStep(page, `Checkout step ${index + 1}`, async () => { await next.click(); return null; }));
    }
    return NextResponse.json({ startUrl: startUrl.toString(), stoppedAtPayment, steps });
  } catch (error) {
    if (!browser) return NextResponse.json({ error: "The hosted browser could not start. Cloudflare may be at its run limit; completed runs remain available. Try again shortly." }, { status: 503 });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Journey analysis failed." }, { status: 422 });
  } finally { await browser?.close(); }
}

