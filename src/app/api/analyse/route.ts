import { countrySettings, countryUrl } from "@/lib/countries";
import { Browser, chromium } from "playwright";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 300;

type PageResult = { url: string; status: number | null; title: string; metaDescription: string; h1: string; canonical: string; internalLinks: number; externalLinks: number };


function normalizeUrl(value: string, baseUrl: URL) {
  try {
    const url = new URL(value, baseUrl);
    url.hash = "";
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString().replace(/\/$/, "") : null;
  } catch { return null; }
}

export async function POST(request: Request) {
  let input: { url?: string; maxPages?: number; country?: string };
  try { input = await request.json(); } catch { return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 }); }
  let startUrl: URL;
  try { startUrl = new URL(countryUrl(input.url || "", input.country || "US")); if (!["http:", "https:"].includes(startUrl.protocol)) throw new Error(); } catch { return NextResponse.json({ error: "Enter a valid http(s) website URL." }, { status: 400 }); }
  const maxPages = Math.min(Math.max(Math.floor(Number(input.maxPages) || 25), 1), 100);
  const settings = countrySettings(input.country || "US");
  const origin = startUrl.hostname;
  const queue = [normalizeUrl(startUrl.toString(), startUrl)!];
  const queued = new Set(queue);
  const pages: PageResult[] = [];
  let browser: Browser | undefined;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ userAgent: "WebQualityAgent/0.1", locale: settings.locale, timezoneId: settings.timezone, extraHTTPHeaders: { "Accept-Language": `${settings.locale},${settings.locale.split("-")[0]};q=0.9` } });
    while (queue.length && pages.length < maxPages) {
      const currentUrl = queue.shift()!;
      let status: number | null = null;
      try {
        const response = await page.goto(currentUrl, { waitUntil: "domcontentloaded", timeout: 15000 });
        status = response?.status() ?? null;
        const data = await page.evaluate((siteOrigin) => {
          const links = Array.from(document.querySelectorAll("a[href]"), (anchor) => (anchor as HTMLAnchorElement).href);
          return { title: document.title.trim(), metaDescription: document.querySelector('meta[name="description"]')?.getAttribute("content")?.trim() || "", h1: document.querySelector("h1")?.textContent?.trim() || "", canonical: document.querySelector('link[rel="canonical"]')?.getAttribute("href") || "", links: links.map((link) => ({ link, internal: new URL(link).hostname === siteOrigin })) };
        }, origin);
        const internal = data.links.filter((link) => link.internal).map((link) => link.link);
        for (const link of internal) {
          const normalized = normalizeUrl(countryUrl(link, input.country || "US"), startUrl);
          if (normalized && !queued.has(normalized) && queue.length + pages.length < maxPages) { queued.add(normalized); queue.push(normalized); }
        }
        pages.push({ url: currentUrl, status, title: data.title, metaDescription: data.metaDescription, h1: data.h1, canonical: data.canonical, internalLinks: internal.length, externalLinks: data.links.length - internal.length });
      } catch { pages.push({ url: currentUrl, status, title: "", metaDescription: "", h1: "", canonical: "", internalLinks: 0, externalLinks: 0 }); }
    }
  } catch (error) {
    if (!browser) {
      console.error("Playwright could not start. Install browser dependencies with `npx playwright install --with-deps chromium`.", error);
      return NextResponse.json({ error: "The crawler browser is unavailable. Run `npx playwright install --with-deps chromium` and try again." }, { status: 503 });
    }
    throw error;
  } finally { await browser?.close(); }
  return NextResponse.json({ pagesScanned: pages.length, brokenLinks: pages.filter((page) => !page.status || page.status >= 400).length, missingTitles: pages.filter((page) => !page.title).length, missingMetaDescriptions: pages.filter((page) => !page.metaDescription).length, missingH1: pages.filter((page) => !page.h1).length, pages });
}