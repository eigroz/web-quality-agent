"use client";

import { FormEvent, useState } from "react";
import { countries, countryUrl } from "@/lib/countries";
import ExecutivePreview from "./ExecutivePreview";

type PageResult = {
  url: string;
  status: number | null;
  title: string;
  metaDescription: string;
  h1: string;
  canonical: string;
  internalLinks: number;
  externalLinks: number;
};

type AnalysisResult = {
  pagesScanned: number;
  brokenLinks: number;
  missingTitles: number;
  missingMetaDescriptions: number;
  missingH1: number;
  pages: PageResult[];
};

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
  loaded: { resourceCount: number; transferSize: number; longTaskCount: number; imageCount: number; stylesheetCount: number; scriptCount: number; externalAssetCount: number; externalDomains: string[]; duplicateResources: { url: string; count: number; transferSize: number; durationMs: number; vendor?: string; purpose: string; role: string }[]; slowestResources: { url: string; durationMs: number; transferSize: number; type: string; external: boolean; vendor?: string; purpose: string; role: string; impact: "high" | "medium" | "low"; suggestion: string }[]; largestResources: { url: string; durationMs: number; transferSize: number; type: string; external: boolean; vendor?: string; purpose: string; role: string; impact: "high" | "medium" | "low"; suggestion: string }[] };
  note?: string;
  availableActions?: string[];
};

type JourneyResult = { startUrl: string; stoppedAtPayment: boolean; steps: JourneyStep[] };


const initialMetrics = [
  { label: "Pages scanned", key: "pagesScanned" as const },
  { label: "Broken links", key: "brokenLinks" as const },
  { label: "Missing titles", key: "missingTitles" as const },
  { label: "Missing descriptions", key: "missingMetaDescriptions" as const },
  { label: "Missing H1s", key: "missingH1" as const },
];

export default function Home() {
  const [url, setUrl] = useState("https://remarkable.com/us/");
  const [country, setCountry] = useState("US");
  const [maxPages, setMaxPages] = useState(25);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [journey, setJourney] = useState<JourneyResult | null>(null);
  const [journeyRuns, setJourneyRuns] = useState<JourneyResult[]>([]);
  const [journeyRunProgress, setJourneyRunProgress] = useState(0);
  const [journeyError, setJourneyError] = useState("");
  const [journeyLoading, setJourneyLoading] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState("");

  async function analyseSite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const response = await fetch("/api/analyse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: countryUrl(url, country), maxPages, country }),
      });
      const data = await response.json() as AnalysisResult & { error?: string };
      if (!response.ok) throw new Error(data.error || "Analysis failed");
      setResult(data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Analysis failed");
    } finally {
      setLoading(false);
    }
  }

  async function analyseJourney(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setJourneyLoading(true);
    setJourneyError("");
    setJourney(null);
    setJourneyRuns([]);
    try {
      const runs: JourneyResult[] = [];
      const failures: string[] = [];
      for (let runNumber = 1; runNumber <= 3; runNumber += 1) {
        setJourneyRunProgress(runNumber);
        let completed = false;
        let lastError = `Run ${runNumber} failed`;
        for (let attempt = 1; attempt <= 2 && !completed; attempt += 1) {
          try {
            const response = await fetch("/api/journey", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: countryUrl(url, country), country }) });
            const raw = await response.text();
            let data: JourneyResult & { error?: string };
            try { data = JSON.parse(raw) as JourneyResult & { error?: string }; } catch { throw new Error("The hosted browser returned an incomplete response"); }
            if (!response.ok) throw new Error(data.error || `Journey run ${runNumber} failed`);
            runs.push(data);
            setJourneyRuns([...runs]);
            setJourney(data);
            completed = true;
          } catch (caught) {
            lastError = caught instanceof Error ? caught.message : `Run ${runNumber} failed`;
            if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 21000));
          }
        }
        if (!completed) failures.push(`Run ${runNumber}: ${lastError}`);
      }
      if (failures.length) setJourneyError(`${runs.length} of 3 runs completed. ${failures.join(" ")}`);
    } catch (caught) {
      setJourneyError(caught instanceof Error ? caught.message : "Journey analysis failed");
    } finally {
      setJourneyRunProgress(0);
      setJourneyLoading(false);
    }
  }

  async function downloadReport() {
    if (!journey) return;
    setPdfLoading(true);
    setPdfError("");
    try {
      const response = await fetch("/api/journey/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: `Journey quality report: ${new URL(journey.startUrl).hostname}`, overview: overviewMessage, speedSummary: speedMessage, recommendations, steps: journey.steps }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(data.error || "The PDF report could not be created.");
      }
      const blob = await response.blob();
      const downloadUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = "journey-quality-report.pdf";
      link.click();
      URL.revokeObjectURL(downloadUrl);
    } catch (caught) {
      setPdfError(caught instanceof Error ? caught.message : "The PDF report could not be created.");
    } finally {
      setPdfLoading(false);
    }
  }

  const redSteps = journey?.steps.filter((step) => step.trafficLight === "red").length ?? 0;
  const orangeSteps = journey?.steps.filter((step) => step.trafficLight === "orange").length ?? 0;
  const greenSteps = journey?.steps.filter((step) => step.trafficLight === "green").length ?? 0;
  const redSpeedSteps = journey?.steps.filter((step) => step.speedLight === "red").length ?? 0;
  const orangeSpeedSteps = journey?.steps.filter((step) => step.speedLight === "orange").length ?? 0;
  const redJourneySteps = journey?.steps.filter((step) => step.journeyLight === "red").length ?? 0;
  const orangeJourneySteps = journey?.steps.filter((step) => step.journeyLight === "orange").length ?? 0;
  const overviewMessage = redJourneySteps > 0 ? "Red journey issue: a required action is blocked, so customers may not complete the purchase path." : orangeJourneySteps > 0 ? "Orange journey issue: customers may be sent elsewhere to buy, adding an extra step." : "The purchase journey completed without a technical or journey block.";
  const speedMessage = redSpeedSteps > 0 ? "Red speed issue: one or more pages are very slow to load." : orangeSpeedSteps > 0 ? "Orange speed issue: one or more pages need performance improvements." : "Green speed: no major loading problem was measured.";
  const recommendations = journey ? (() => {
    const items: { title: string; action: string; reason: string }[] = [];
    const blockedStep = journey.steps.find((step) => step.journeyLight === "red");
    const regionalStep = journey.steps.find((step) => step.issues.some((issue) => issue.includes("another retailer")));
    const slowStep = journey.steps.find((step) => step.speedLight !== "green");
    const heavyStep = journey.steps.find((step) => step.loaded.resourceCount >= 180);
    const namedVendor = journey.steps.flatMap((step) => [...step.loaded.slowestResources, ...step.loaded.largestResources]).find((resource) => resource.vendor);
    if (blockedStep) items.push({ title: `Fix the blocked ${blockedStep.name.toLowerCase()} step`, action: "Make the required button or link visible and clickable in the tested region and device layout.", reason: "A blocked step can stop customers from completing the journey." });
    if (regionalStep) items.push({ title: "Explain when customers are sent to Amazon", action: "Before the purchase click, say clearly: ‘In some countries, you will complete your purchase on Amazon or another retailer.’ Link directly to that retailer.", reason: "Otherwise customers may expect checkout on this site, get redirected, and leave because the next step is unexpected." });
    if (slowStep) items.push({ title: `Improve ${slowStep.name.toLowerCase()} load time`, action: "Start with the slowest resources on this step and defer anything that is not needed for the first screen.", reason: "Faster pages reduce waiting and improve the chance that customers continue." });
    if (heavyStep) items.push({ title: "Reduce the number of files loaded", action: "Remove unused scripts and delay non-essential tags until after the page is usable.", reason: "A page with many requests gives the browser more work and creates more opportunities for delay." });
    if (namedVendor) items.push({ title: `Review ${namedVendor.vendor} on the critical path`, action: `Check whether ${namedVendor.vendor} is needed before the page becomes interactive; defer or remove it if it is not essential.`, reason: "Third-party code can slow the site and is outside the team’s direct control." });
    if (items.length < 5) items.push({ title: "Repeat the journey on key markets and devices", action: "Run this test for the main countries, mobile, and desktop before making release decisions.", reason: "Speed and purchase options can change by country, device, and customer context." });
    return items.slice(0, 5);
  })() : [];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-950/90">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5 lg:px-10">
          <div className="flex items-center gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-400 font-black text-slate-950">W</div><span className="text-sm font-bold tracking-[0.18em] text-slate-200 uppercase">Web Quality Agent</span></div>
          <span className="text-xs font-medium tracking-widest text-slate-500 uppercase">Single-site audit / v0.1</span>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-12 lg:px-10 lg:py-16">
        <section className="max-w-3xl"><p className="mb-4 text-xs font-bold tracking-[0.24em] text-sky-400 uppercase">Technical site intelligence</p><h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">Make every page count.</h1><p className="mt-5 max-w-2xl text-lg leading-8 text-slate-400">Crawl a website, surface structural gaps, and turn raw page data into a clear quality baseline.</p></section>
        <label className="mt-10 block"><span className="mb-2 block text-xs font-semibold tracking-wider text-slate-400 uppercase">Website URL</span><input value={url} onChange={(event) => setUrl(event.target.value)} onBlur={() => { try { setUrl(countryUrl(url, country)); } catch { /* Validation runs when analysis starts. */ } }} type="url" required placeholder="https://www.example.com" className="h-12 w-full border border-slate-700 bg-slate-950 px-4 text-sm text-white outline-none transition focus:border-sky-400" /></label>
        <label className="mt-5 block"><span className="mb-2 block text-xs font-semibold tracking-wider text-slate-400 uppercase">Test country</span><select value={country} onChange={(event) => { const nextCountry = event.target.value; setCountry(nextCountry); try { setUrl(countryUrl(url, nextCountry)); } catch { /* Allow the user to finish entering a URL. */ } }} className="h-12 w-full border border-slate-700 bg-slate-950 px-4 text-sm text-white outline-none transition focus:border-sky-400">{countries.map((option) => <option key={option.code} value={option.code}>{option.name} ({option.code})</option>)}</select>{countries.find((option) => option.code === country)?.disableWebshop && <span className="mt-2 block text-xs text-amber-300">The supplied reMarkable configuration marks this country’s webshop as unavailable. You can still test its regional page.</span>}<span className="mt-2 block text-xs leading-5 text-slate-500">Updates the reMarkable URL to the selected country and keeps the page path. Browser language and timezone also follow the selection; the crawler&apos;s IP address stays the same.</span></label>
        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <form onSubmit={analyseSite} className="border border-slate-800 bg-slate-900 p-5 shadow-2xl shadow-slate-950/40 sm:p-6"><p className="text-xs font-bold tracking-[0.2em] text-sky-400 uppercase">Site analysis</p><h2 className="mt-2 text-xl font-semibold text-white">Check the site structure</h2><p className="mt-2 text-sm leading-6 text-slate-400">Crawl pages and find missing titles, headings, descriptions, and broken links.</p><label className="mt-5 block"><span className="mb-2 block text-xs font-semibold tracking-wider text-slate-400 uppercase">Maximum pages</span><input value={maxPages} onChange={(event) => setMaxPages(Number(event.target.value))} type="number" min="1" max="100" required className="h-12 w-full border border-slate-700 bg-slate-950 px-4 text-sm text-white outline-none transition focus:border-sky-400" /></label><button type="submit" disabled={loading} className="mt-4 flex h-12 w-full items-center justify-center gap-2 bg-sky-400 px-6 text-sm font-bold text-slate-950 transition hover:bg-sky-300 disabled:cursor-wait disabled:opacity-60">{loading ? "Analysing..." : "Analyse site"}{!loading && <span aria-hidden="true">-&gt;</span>}</button>{error && <p className="mt-4 border-l-2 border-rose-400 bg-rose-950/30 px-3 py-2 text-sm text-rose-200">{error}</p>}</form>
          <form onSubmit={analyseJourney} className="border border-sky-900/70 bg-slate-900/70 p-5 sm:p-6"><p className="text-xs font-bold tracking-[0.2em] text-sky-400 uppercase">Journey test</p><h2 className="mt-2 text-xl font-semibold text-white">Test the buying journey</h2><p className="mt-2 text-sm leading-6 text-slate-400">Follow the homepage, shop, products, configuration, cart, and checkout path three times to reveal recurring problems.</p><button type="submit" disabled={journeyLoading} className="mt-5 flex h-12 w-full items-center justify-center gap-2 bg-sky-400 px-6 text-sm font-bold text-slate-950 transition hover:bg-sky-300 disabled:cursor-wait disabled:opacity-60">{journeyLoading ? `Running journey ${journeyRunProgress} of 3...` : "Run 3 journey tests"}{!journeyLoading && <span aria-hidden="true">-&gt;</span>}</button>{journeyError && <p className="mt-4 border-l-2 border-rose-400 bg-rose-950/30 px-3 py-2 text-sm text-rose-200">{journeyError}</p>}</form>
        </div>
        <ExecutivePreview runs={journeyRuns} market={countries.find((option) => option.code === country)?.name ?? country} targetUrl={url} expectedRuns={3} isRunning={journeyLoading} />
        {journey && <div className="mt-8 border border-slate-800 bg-slate-900 p-5"><div className="flex flex-col gap-5"><div><p className="text-xs font-bold tracking-[0.2em] text-sky-400 uppercase">Journey overview</p><p className="mt-2 text-sm text-slate-200">{overviewMessage}</p><p className="mt-2 text-sm text-slate-400">{speedMessage}</p></div><div className="grid gap-3 text-xs font-semibold sm:grid-cols-2"><div className="border border-slate-800 bg-slate-950 p-3"><p className="text-slate-400 uppercase">Overall</p><p className="mt-2"><span className="text-emerald-400">Green {greenSteps}</span><span className="ml-4 text-amber-300">Orange {orangeSteps}</span><span className="ml-4 text-rose-400">Red {redSteps}</span></p></div><div className="border border-slate-800 bg-slate-950 p-3"><p className="text-slate-400 uppercase">What needs attention</p><p className="mt-2 text-slate-300">Speed: {redSpeedSteps + orangeSpeedSteps} step{redSpeedSteps + orangeSpeedSteps === 1 ? "" : "s"}. Journey: {redJourneySteps + orangeJourneySteps} step{redJourneySteps + orangeJourneySteps === 1 ? "" : "s"}.</p></div></div></div></div>}
        {journey && <section className="mt-5 border border-slate-800 bg-slate-900 p-5"><p className="text-xs font-bold tracking-[0.2em] text-sky-400 uppercase">Top 5 recommended improvements</p><p className="mt-2 text-sm text-slate-400">A practical starting list for the team, ordered by likely impact on customers and conversion.</p><div className="mt-5 grid gap-3 lg:grid-cols-2">{recommendations.map((recommendation, index) => <div key={recommendation.title} className="border border-slate-800 bg-slate-950 p-4"><div className="flex gap-3"><span className="text-sm font-bold text-sky-400">{String(index + 1).padStart(2, "0")}</span><div><h3 className="text-sm font-semibold text-white">{recommendation.title}</h3><p className="mt-2 text-sm text-slate-300"><span className="font-semibold text-sky-300">Do:</span> {recommendation.action}</p><p className="mt-2 text-xs leading-5 text-slate-500"><span className="font-semibold text-slate-400">Why it matters:</span> {recommendation.reason}</p></div></div></div>)}</div></section>}
        {journey && <section className="mt-14"><div className="mb-5 flex items-end justify-between border-b border-slate-800 pb-4"><div><p className="text-xs font-bold tracking-[0.2em] text-sky-400 uppercase">Journey findings</p><h2 className="mt-2 text-2xl font-semibold text-white">Choke points, slowest first</h2></div><span className="text-xs text-slate-500">{journey.stoppedAtPayment ? "Stopped before payment" : journey.steps.at(-1)?.status === "blocked" ? "Journey stopped early" : "Journey complete"}</span></div><div className="space-y-3">{journey.steps.map((step, index) => <details key={`${step.name}-${step.url}`} open={index === 0} className="group border border-slate-800 bg-slate-900 p-5"><summary className="cursor-pointer list-none"><div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between"><div><div className="flex items-center gap-3"><span className="text-xs font-bold text-sky-400">{String(index + 1).padStart(2, "0")}</span><h3 className="font-semibold text-white">{step.name}</h3><span className={step.trafficLight === "green" ? "text-emerald-400" : step.trafficLight === "orange" ? "text-amber-300" : "text-rose-400"}>{step.trafficLight}</span><span className={step.status === "complete" ? "text-slate-400" : "text-rose-400"}>{step.status}</span></div><p className="mt-3 break-all text-xs text-slate-500">{step.url}</p></div><p className="text-2xl font-semibold text-white">{(step.durationMs / 1000).toFixed(2)}s</p></div><p className="mt-4 text-sm text-slate-300">{step.likelyCause}</p>{step.issues.length > 0 && <p className="mt-3 text-xs text-amber-200">Issues to fix: {step.issues.join(" ")}</p>}</summary><div className="mt-5 border-t border-slate-800 pt-4"><div className="grid gap-3 text-xs text-slate-400 sm:grid-cols-2 lg:grid-cols-4"><span>{step.loaded.resourceCount} total resources</span><span>{step.loaded.scriptCount} scripts</span><span>{step.loaded.imageCount} images</span><span>{step.loaded.stylesheetCount} stylesheets</span><span>{step.loaded.externalAssetCount} external assets</span><span>{(step.loaded.transferSize / 1024 / 1024).toFixed(2)} MB transferred</span><span>{step.loaded.longTaskCount} long tasks</span>{step.responseStatus && <span>HTTP {step.responseStatus}</span>}</div>{step.loaded.externalDomains.length > 0 && <p className="mt-4 text-xs text-slate-500">External domains: {step.loaded.externalDomains.join(", ")}</p>}<div className="mt-5 grid gap-5 lg:grid-cols-2"><div><h4 className="text-xs font-bold tracking-wider text-slate-400 uppercase">Slowest resources</h4><div className="mt-2 space-y-2">{step.loaded.slowestResources.map((resource, resourceIndex) => <div key={`${resource.url}-slow-${resourceIndex}`} className="border border-slate-800 bg-slate-950 p-3 text-xs"><a href={resource.url} target="_blank" rel="noreferrer" className="block hover:text-sky-200"><span className="font-semibold text-sky-300">{resource.type || "Resource"} {resourceIndex + 1}: {resource.vendor ? `${resource.vendor} / ` : ""}{resource.purpose}</span><span className={resource.impact === "high" ? "ml-2 font-bold text-rose-400" : "ml-2 text-slate-400"}>{resource.impact} impact / {(resource.durationMs / 1000).toFixed(2)}s</span><span className="mt-1 block truncate text-slate-500">{resource.url}</span></a><p className="mt-3 border-l-2 border-sky-500/60 pl-3 text-slate-300"><span className="font-semibold text-sky-300">Suggestion:</span> {resource.suggestion}</p></div>)}</div></div><div><h4 className="text-xs font-bold tracking-wider text-slate-400 uppercase">Largest transfers</h4><div className="mt-2 space-y-2">{step.loaded.largestResources.map((resource, resourceIndex) => <div key={`${resource.url}-large-${resourceIndex}`} className="border border-slate-800 bg-slate-950 p-3 text-xs"><a href={resource.url} target="_blank" rel="noreferrer" className="block hover:text-sky-200"><span className="font-semibold text-sky-300">Asset {resourceIndex + 1}: {resource.vendor ? `${resource.vendor} / ` : ""}{resource.purpose}</span><span className={resource.impact === "high" ? "ml-2 font-bold text-rose-400" : "ml-2 text-slate-400"}>{resource.impact} impact / {(resource.transferSize / 1024 / 1024).toFixed(2)} MB</span><span className="mt-1 block truncate text-slate-500">{resource.url}</span></a><p className="mt-3 border-l-2 border-sky-500/60 pl-3 text-slate-300"><span className="font-semibold text-sky-300">Suggestion:</span> {resource.suggestion}</p></div>)}</div></div></div>{step.note && <p className="mt-5 text-sm text-rose-300">{step.note}</p>}{step.availableActions && <p className="mt-3 text-xs text-slate-500">Visible actions at block: {step.availableActions.join(" | ") || "none"}</p>}</div></details>)}</div></section>}
        <section className="mt-14"><div className="mb-5 flex items-end justify-between border-b border-slate-800 pb-4"><div><p className="text-xs font-bold tracking-[0.2em] text-sky-400 uppercase">Overview</p><h2 className="mt-2 text-2xl font-semibold text-white">Site health</h2></div>{result && <span className="text-xs text-slate-500">Live crawl complete</span>}</div><div className="grid gap-px overflow-hidden border border-slate-800 bg-slate-800 sm:grid-cols-2 lg:grid-cols-5">{initialMetrics.map((metric) => <div key={metric.key} className="bg-slate-900 p-5"><p className="text-xs font-medium text-slate-500">{metric.label}</p><p className="mt-3 text-3xl font-semibold tracking-tight text-white">{result?.[metric.key] ?? "-"}</p></div>)}</div></section>
        <section className="mt-14"><div className="mb-5 flex items-end justify-between border-b border-slate-800 pb-4"><div><p className="text-xs font-bold tracking-[0.2em] text-sky-400 uppercase">Page inventory</p><h2 className="mt-2 text-2xl font-semibold text-white">Crawl results</h2></div><span className="text-xs text-slate-500">{result ? `${result.pages.length} pages` : "Awaiting analysis"}</span></div><div className="overflow-x-auto border border-slate-800 bg-slate-900"><table className="w-full min-w-[760px] text-left text-sm"><thead className="border-b border-slate-800 bg-slate-900 text-xs font-semibold tracking-wider text-slate-500 uppercase"><tr><th className="px-5 py-4">URL</th><th className="px-5 py-4">Status</th><th className="px-5 py-4">Title</th><th className="px-5 py-4">H1</th><th className="px-5 py-4">Internal links</th></tr></thead><tbody className="divide-y divide-slate-800">{result?.pages.map((page) => <tr key={page.url} className="text-slate-300"><td className="max-w-xs truncate px-5 py-4 text-sky-300">{page.url}</td><td className="px-5 py-4"><span className={page.status && page.status < 400 ? "text-emerald-400" : "text-rose-400"}>{page.status ?? "ERR"}</span></td><td className="max-w-xs truncate px-5 py-4">{page.title || <span className="text-rose-400">Missing</span>}</td><td className="max-w-xs truncate px-5 py-4">{page.h1 || <span className="text-rose-400">Missing</span>}</td><td className="px-5 py-4">{page.internalLinks}</td></tr>)}</tbody></table>{!result && <div className="px-6 py-16 text-center"><p className="text-sm font-medium text-slate-300">No crawl data yet</p><p className="mt-2 text-sm text-slate-500">Enter a URL above to inspect its page structure.</p></div>}{result?.pages.length === 0 && <div className="px-6 py-16 text-center text-sm text-slate-500">No pages could be scanned.</div>}</div></section>
        <section className="mt-14 border-t border-slate-800 pt-8"><p className="text-xs font-bold tracking-[0.2em] text-slate-500 uppercase">Coming next</p><div className="mt-4 flex flex-wrap gap-3">{["Journey analysis", "Core Web Vitals", "Lighthouse", "Accessibility", "Technology detection", "AI recommendations", "Site comparison"].map((item) => <span key={item} className="border border-slate-800 px-3 py-2 text-xs text-slate-500">{item}</span>)}</div></section>
        {journey && <section className="mt-14 border-t border-slate-800 pt-8"><p className="text-xs font-bold tracking-[0.2em] text-sky-400 uppercase">Share this report</p><p className="mt-2 text-sm text-slate-400">Download the journey overview, recommendations, ratings, and issues as a PDF.</p><button type="button" onClick={downloadReport} disabled={pdfLoading} className="mt-4 flex h-11 items-center gap-2 bg-sky-400 px-5 text-sm font-bold text-slate-950 transition hover:bg-sky-300 disabled:cursor-wait disabled:opacity-60">{pdfLoading ? "Creating PDF..." : "Download PDF report"}<span aria-hidden="true">-&gt;</span></button>{pdfError && <p className="mt-3 border-l-2 border-rose-400 bg-rose-950/30 px-3 py-2 text-sm text-rose-200">{pdfError}</p>}</section>}
      </main>
    </div>
  );
}

