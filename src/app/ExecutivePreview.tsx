type Resource = { url: string; durationMs: number; transferSize: number; type?: string; vendor?: string; purpose: string; role?: string; impact?: "high" | "medium" | "low"; suggestion?: string; count?: number };
type Step = { name: string; status: "complete" | "blocked" | "stopped"; speedLight: "green" | "orange" | "red"; issues: string[]; inefficiencies: string[]; url: string; durationMs: number; note?: string; loaded: { duplicateResources: Resource[]; slowestResources: Resource[]; largestResources: Resource[] } };
type Run = { startUrl: string; steps: Step[] };
type Props = { runs: Run[]; market: string; targetUrl: string; expectedRuns: number; isRunning: boolean };
type ScriptFinding = Resource & { section: string; pageUrl: string; runNumbers: Set<number>; occurrences: number };

function resourceName(value: string) {
  try { const url = new URL(value); return `${url.hostname} · ${url.pathname.split("/").filter(Boolean).at(-1) || url.hostname}`; } catch { return value; }
}
function pageName(value: string) { try { return new URL(value).pathname || "/"; } catch { return value; } }
function severity(resource: ScriptFinding) { return (resource.impact === "high" ? 3 : resource.impact === "medium" ? 2 : 1) * 1_000_000 + resource.runNumbers.size * 100_000 + resource.durationMs; }

function registrableDomain(hostname: string) {
  const parts = hostname.replace(/^www\./, "").split(".");
  return parts.slice(-2).join(".");
}

function resourceIdentity(resource: Resource, pageUrl: string) {
  try {
    const resourceUrl = new URL(resource.url);
    const page = new URL(pageUrl);
    const host = resourceUrl.hostname.replace(/^www\./, "");
    const firstParty = registrableDomain(host) === registrableDomain(page.hostname);
    if (firstParty && /\/metrics(?:[/?]|$)/i.test(resourceUrl.pathname)) return { owner: "reMarkable / first party", purpose: "Site measurement endpoint", explanation: "A reMarkable-owned endpoint that appears to collect site performance or usage measurements. Its presence is normal; repeated or slow calls are what may deserve review." };
    if (firstParty) return { owner: "Website / first party", purpose: resource.role || resource.purpose, explanation: "Code or data served from the same company domain as this page. It is usually part of the website, although first-party ownership does not guarantee it is efficient." };
    if (/amplitude/i.test(host)) return { owner: "Amplitude", purpose: "Product analytics", explanation: "Third-party analytics used to understand how people use the site and move through the journey. It can be useful, but should normally load after consent and avoid delaying the purchase experience." };
    if (/stripe/i.test(host)) return { owner: "Stripe", purpose: "Payment services", explanation: "Third-party payment code. It may be essential near checkout, although loading it on much earlier pages can be reviewed." };
    if (/datadog|dd-rum/i.test(host)) return { owner: "Datadog", purpose: "Performance and error monitoring", explanation: "Third-party monitoring used to diagnose reliability and speed. It is often valuable, but should not delay the customer journey." };
    if (/google-analytics|googletagmanager|doubleclick|googleadservices|google\.com|gstatic\.com/i.test(host)) return { owner: "Google", purpose: resource.role || "Analytics, tag management, advertising, or Google platform code", explanation: "Code operated by Google. It may support analytics, advertising, fonts, maps, or other Google services; the exact hostname and path identify which." };
    if (/sentry/i.test(host)) return { owner: "Sentry", purpose: "Error monitoring", explanation: "Third-party monitoring used to capture software errors. This can be valuable, but it should not delay the purchase journey or load repeatedly without a reason." };
    if (/cloudflare/i.test(host)) return { owner: "Cloudflare", purpose: resource.role || "Delivery, security, or performance", explanation: "Infrastructure code commonly used for delivery, security, bot protection, or performance." };
    if (/facebook|meta|criteo|tradedoubler|adservice/i.test(host)) return { owner: "Marketing partner", purpose: resource.role || "Advertising or attribution", explanation: "Third-party marketing or attribution code. It may be commercially required, but it is usually less critical than product and basket functionality." };
    return { owner: `External: ${host}`, purpose: resource.role || resource.purpose, explanation: "A resource operated on a different company domain. The analyser can identify its owner and cost, but its business necessity must be confirmed by the site team." };
  } catch {
    return { owner: "Owner unknown", purpose: resource.role || resource.purpose, explanation: "The resource address could not be classified reliably." };
  }
}

function resourceAssessment(resource: ScriptFinding, totalRuns: number) {
  const averageMs = resource.durationMs / Math.max(1, resource.runNumbers.size);
  const repeatedOnPage = resource.occurrences > resource.runNumbers.size;
  const description = `${resource.purpose} ${resource.role ?? ""}`.toLowerCase();
  const essential = /website functionality|product or page data|consent|security|error monitoring/.test(description);
  const optional = /analytics|advertising|tracking|tag management|affiliate/.test(description);
  const serious = resource.impact === "high" || averageMs >= 1500 || resource.transferSize >= 1_000_000;
  const notable = resource.impact === "medium" || averageMs >= 500 || resource.transferSize >= 250_000 || repeatedOnPage;
  const level = serious ? "investigate" : notable ? "watch" : "expected";
  const label = level === "investigate" ? "Investigate" : level === "watch" ? "Watch" : "Expected";
  const observation = repeatedOnPage
    ? `Loaded ${resource.occurrences} times across ${resource.runNumbers.size} run${resource.runNumbers.size === 1 ? "" : "s"}; repeated loading may be avoidable.`
    : `Appeared in ${resource.runNumbers.size} of the ${totalRuns} measured run${totalRuns === 1 ? "" : "s"}, averaging ${(averageMs / 1000).toFixed(2)} seconds.`;
  const why = optional
    ? "This supports measurement or marketing rather than the purchase itself. If it loads too early, it can compete with product and basket code."
    : essential
      ? "This may support a necessary part of the journey. Its cost matters when it delays a visible page or customer action."
      : "The analyser can measure its cost, but cannot prove from the file alone whether it caused a customer-facing delay.";
  const mitigation = optional
    ? "It may be justified for consented analytics, attribution, or campaign reporting, especially when loaded after the page becomes usable."
    : essential
      ? "It may be entirely appropriate if the page, basket, consent flow, or error reporting depends on it and it is cached or loaded only once."
      : "It may be shared, cached, or required by the platform. Confirm its owner and purpose before changing it.";
  const next = repeatedOnPage
    ? "Ask the owning team whether one load can serve the whole page and whether every trigger is intentional."
    : optional
      ? "Check whether it can wait until consent or until after the main purchase action is ready."
      : "Confirm whether it is needed at this exact step, then use a browser trace before deciding to remove or delay it.";
  return { level, label, observation, why, mitigation, next };
}

function issueExplanation(issue: { text: string; blocked: boolean }) {
  if (issue.blocked) return { meaning: "The automated customer could not continue at this point.", importance: "A repeated block can prevent sales, so this needs journey-owner review first.", caveat: "Confirm with a recording or manual reproduction: consent prompts, regional content, or test timing can sometimes hide a valid control." };
  if (/resource.*loaded more than once|duplicate/i.test(issue.text)) return { meaning: "The same file was requested repeatedly during this step.", importance: "Extra requests can waste data and browser time, particularly on slower devices.", caveat: "Retries, chunked loading, cache revalidation, or deliberately separate page contexts can make repetition valid." };
  if (/external|vendor|third-party/i.test(issue.text)) return { meaning: "Several services outside the main website participated in this step.", importance: "Each external service adds a dependency that can slow down or fail independently.", caveat: "Payment, consent, fraud prevention, analytics, and support services may be necessary. Review timing and ownership before removal." };
  if (/no clear.*action|purchase action/i.test(issue.text)) return { meaning: "The analyser could not identify an obvious next purchase control.", importance: "Customers may hesitate or abandon if the next step is unclear.", caveat: "The control may be revealed after a selection, inside a component, or worded differently. Validate the page visually." };
  return { meaning: "This pattern appeared consistently enough to be worth reviewing.", importance: "Repeated evidence is more useful than a one-off result, but it does not prove customer harm by itself.", caveat: "Compare it with real-user data and a browser recording before prioritising engineering work." };
}

export default function ExecutivePreview({ runs, market, targetUrl, expectedRuns, isRunning }: Props) {
  if (runs.length === 0) return null;
  const stepOrder = [...new Set(runs.flatMap((run) => run.steps.map((step) => step.name)))];
  const stages = stepOrder.map((name) => {
    const samples = runs.flatMap((run) => run.steps.filter((step) => step.name === name));
    const complete = samples.filter((step) => step.status === "complete").length;
    const averageMs = samples.reduce((sum, step) => sum + step.durationMs, 0) / Math.max(1, samples.length);
    const state = samples.some((step) => step.status === "blocked" || step.speedLight === "red") ? "bad" : samples.some((step) => step.speedLight === "orange") ? "warn" : "good";
    return { name, complete, averageMs, state };
  });
  const completedRuns = runs.filter((run) => run.steps.length > 0 && run.steps.every((step) => step.status === "complete")).length;
  const issueMap = new Map<string, { section: string; pageUrl: string; text: string; runs: Set<number>; blocked: boolean; resources: Map<string, Resource> }>();
  const scriptMap = new Map<string, ScriptFinding>();

  runs.forEach((run, runIndex) => run.steps.forEach((step) => {
    [...step.issues, ...step.inefficiencies, ...(step.note ? [step.note] : [])].forEach((text) => {
      const key = `${step.name}|${step.url}|${text}`;
      const issue = issueMap.get(key) ?? { section: step.name, pageUrl: step.url, text, runs: new Set<number>(), blocked: step.status === "blocked", resources: new Map<string, Resource>() };
      if (/resource.*loaded more than once|duplicate/i.test(text)) step.loaded.duplicateResources.forEach((resource) => issue.resources.set(resource.url, resource));
      issue.runs.add(runIndex + 1); issue.blocked ||= step.status === "blocked"; issueMap.set(key, issue);
    });
    const resources = new Map<string, Resource>();
    [...step.loaded.slowestResources, ...step.loaded.largestResources].forEach((resource) => {
      if (resource.type === "script" || /script|analytics|tracking|tag manager|monitoring/i.test(`${resource.type} ${resource.purpose} ${resource.role ?? ""}`)) resources.set(resource.url, resource);
    });
    step.loaded.duplicateResources.forEach((resource) => {
      if (!/image|font|stylesheet|video/i.test(`${resource.purpose} ${resource.role ?? ""}`)) resources.set(resource.url, { ...resources.get(resource.url), ...resource });
    });
    resources.forEach((resource) => {
      const key = `${step.name}|${step.url}|${resource.url}`;
      const current = scriptMap.get(key);
      if (current) { current.runNumbers.add(runIndex + 1); current.occurrences += resource.count ?? 1; current.durationMs += resource.durationMs; current.transferSize += resource.transferSize; if (resource.impact === "high" || (resource.impact === "medium" && current.impact === "low")) current.impact = resource.impact; }
      else scriptMap.set(key, { ...resource, section: step.name, pageUrl: step.url, runNumbers: new Set([runIndex + 1]), occurrences: resource.count ?? 1 });
    });
  }));

  const issues = [...issueMap.values()].sort((a, b) => Number(b.blocked) - Number(a.blocked) || b.runs.size - a.runs.size);
  const scripts = [...scriptMap.values()].sort((a, b) => severity(b) - severity(a));
  const repeatedIssues = issues.filter((issue) => issue.runs.size >= 2);
  const repeatedScripts = scripts.filter((script) => script.runNumbers.size >= 2 || script.occurrences > script.runNumbers.size);
  const troublingScripts = scripts.filter((script) => resourceAssessment(script, runs.length).level === "investigate");
  const watchScripts = scripts.filter((script) => resourceAssessment(script, runs.length).level === "watch");
  const blocked = issues.find((issue) => issue.blocked);
  const slowest = [...stages].sort((a, b) => b.averageMs - a.averageMs)[0];
  const score = Math.max(0, Math.round(100 * completedRuns / runs.length - repeatedIssues.filter((issue) => issue.blocked).length * 10 - Math.min(25, troublingScripts.length * 2)));
  const decision = blocked ? `Fix ${blocked.section.toLowerCase()} first; it blocked ${blocked.runs.size} of ${runs.length} runs.` : slowest ? `The journey completes. Focus next on ${slowest.name.toLowerCase()}, averaging ${(slowest.averageMs / 1000).toFixed(1)} seconds.` : "No repeatable blocker was found.";
  const sections = stepOrder.map((section) => ({ section, pages: [...new Set(scripts.filter((script) => script.section === section).map((script) => script.pageUrl))].map((pageUrl) => ({ pageUrl, scripts: scripts.filter((script) => script.section === section && script.pageUrl === pageUrl) })) })).filter((section) => section.pages.length);

  return <section className="mt-10 overflow-hidden border border-slate-700 bg-slate-900 shadow-2xl shadow-slate-950/50">
    <div className="border-b border-slate-700 bg-gradient-to-r from-slate-900 via-slate-900 to-sky-950/40 p-5 sm:p-7"><div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between"><div><div className="flex flex-wrap items-center gap-3"><p className="text-xs font-bold tracking-[0.2em] text-sky-400 uppercase">Live executive journey report</p><span className="border border-emerald-700/70 bg-emerald-950/40 px-2 py-1 text-[10px] font-bold tracking-wider text-emerald-200 uppercase">Measured data</span>{isRunning && <span className="text-xs text-amber-300">Run {Math.min(runs.length + 1, expectedRuns)} of {expectedRuns} in progress</span>}</div><h2 className="mt-3 text-2xl font-semibold text-white sm:text-3xl">{completedRuns === runs.length ? "The buying journey completes." : `${runs.length - completedRuns} of ${runs.length} runs encountered a block.`}</h2><p className="mt-3 text-sm leading-6 text-slate-400">Results from {runs.length} identical {market} journey run{runs.length === 1 ? "" : "s"}, grouped by section and page.</p><p className="mt-2 truncate text-xs text-slate-600">{targetUrl}</p></div><div className="border-l-2 border-sky-500 pl-4 lg:max-w-sm"><p className="text-xs font-bold tracking-wider text-sky-300 uppercase">Decision</p><p className="mt-2 text-sm leading-6 text-slate-200">{decision}</p></div></div></div>
    <div className="grid gap-px bg-slate-800 sm:grid-cols-2 lg:grid-cols-5">{[["Journey score", `${score} / 100`], ["Completed", `${completedRuns} of ${runs.length}`], ["Repeated issues", String(repeatedIssues.length)], ["Needs investigation", String(troublingScripts.length)], ["Confidence", runs.length >= expectedRuns ? "High" : "Building"]].map(([label, value]) => <div key={label} className="bg-slate-950/80 p-5"><p className="text-xs text-slate-500">{label}</p><p className="mt-2 text-2xl font-semibold text-white">{value}</p></div>)}</div>
    <div className="p-5 sm:p-7"><div className="flex items-end justify-between"><div><p className="text-xs font-bold tracking-[0.2em] text-sky-400 uppercase">Journey consistency</p><h3 className="mt-2 text-xl font-semibold text-white">Pass rate and average time by section</h3></div><p className="text-xs text-slate-500">Target: {expectedRuns} runs</p></div>
      <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{stages.map((stage) => <div key={stage.name} className={stage.state === "bad" ? "border border-rose-700 bg-rose-950/30 p-3" : stage.state === "warn" ? "border border-amber-800 bg-amber-950/20 p-3" : "border border-emerald-800 bg-emerald-950/20 p-3"}><p className="text-sm font-semibold text-white">{stage.name}</p><p className="mt-2 text-xs text-slate-300">{stage.complete}/{runs.length} passed · {(stage.averageMs / 1000).toFixed(2)}s average</p></div>)}</div>
      <div className="mt-8 grid gap-6 xl:grid-cols-[0.8fr_1.2fr]"><div><p className="text-xs font-bold tracking-[0.2em] text-amber-300 uppercase">Repeated journey issues</p><h3 className="mt-2 text-xl font-semibold text-white">Patterns seen more than once</h3><p className="mt-2 text-sm leading-6 text-slate-400">A repeated observation deserves attention, but it is not automatically a fault. Open a pattern to see why it matters and what could reasonably explain it.</p><div className="mt-4 space-y-2">{repeatedIssues.length === 0 && <p className="border border-slate-700 bg-slate-950/60 p-4 text-sm text-emerald-300">No issue has repeated across the completed runs.</p>}{repeatedIssues.map((issue) => { const explanation = issueExplanation(issue); const evidence = [...issue.resources.values()]; return <details key={`${issue.section}-${issue.text}`} className="border border-slate-700 bg-slate-950/60 p-3"><summary className="cursor-pointer list-none"><div className="flex justify-between gap-4"><div><p className="text-sm font-semibold text-slate-200">{issue.section}</p><p className="mt-1 text-xs text-slate-500">{pageName(issue.pageUrl)}</p></div><span className={issue.blocked ? "text-xs font-semibold text-rose-300" : "text-xs font-semibold text-amber-300"}>{issue.blocked ? "Journey block" : "Review"} · {issue.runs.size}/{runs.length} runs</span></div></summary><div className="mt-3 space-y-3 border-t border-slate-800 pt-3 text-xs leading-5"><p className="text-slate-300"><span className="font-semibold text-white">What we saw:</span> {issue.text.replace(/; open this finding[^.]*\.?/i, ".")}</p><p className="text-slate-300"><span className="font-semibold text-white">What it means:</span> {explanation.meaning}</p><p className="text-slate-300"><span className="font-semibold text-white">Why it matters:</span> {explanation.importance}</p><p className="border-l-2 border-slate-600 pl-3 text-slate-400"><span className="font-semibold text-slate-200">Possible valid explanation:</span> {explanation.caveat}</p>{evidence.length > 0 && <div><p className="font-semibold text-white">Files involved</p><div className="mt-2 space-y-2">{evidence.map((resource) => { const identity = resourceIdentity(resource, issue.pageUrl); return <a key={resource.url} href={resource.url} target="_blank" rel="noreferrer" className="block border border-slate-800 bg-slate-900 p-3 hover:border-sky-700"><span className="font-semibold text-sky-300">{identity.owner}</span><span className="ml-2 text-slate-500">{resource.count ?? 1} loads · {(resource.transferSize / 1024).toFixed(0)} KB</span><span className="mt-1 block text-slate-300">{identity.purpose}</span><span className="mt-1 block text-slate-500">{identity.explanation}</span><span className="mt-2 block break-all text-[10px] text-slate-600">{resource.url}</span></a>})}</div></div>}</div></details>})}</div></div>
        <div><p className="text-xs font-bold tracking-[0.2em] text-sky-400 uppercase">Code and script evidence</p><h3 className="mt-2 text-xl font-semibold text-white">What deserves action, grouped by journey step</h3><p className="mt-2 text-sm leading-6 text-slate-400">These are measured files, not proof of bad code. “Investigate” means the cost crossed a material threshold; “Watch” means it may become a problem; “Expected” means no clear concern was measured.</p><div className="mt-3 flex flex-wrap gap-2 text-[11px]"><span className="border border-rose-800 bg-rose-950/30 px-2 py-1 text-rose-200">Investigate {troublingScripts.length}</span><span className="border border-amber-800 bg-amber-950/20 px-2 py-1 text-amber-200">Watch {watchScripts.length}</span><span className="border border-emerald-800 bg-emerald-950/20 px-2 py-1 text-emerald-200">Expected {scripts.length - troublingScripts.length - watchScripts.length}</span></div><div className="mt-4 space-y-3">{sections.map(({ section, pages }) => <details key={section} className="border border-slate-700 bg-slate-950/60 p-4"><summary className="cursor-pointer text-sm font-semibold text-white">{section} <span className="ml-2 text-xs font-normal text-slate-500">{pages.reduce((sum, page) => sum + page.scripts.length, 0)} measured resources</span></summary><div className="mt-3 space-y-2 border-t border-slate-800 pt-3">{pages.map(({ pageUrl, scripts: pageScripts }) => <details key={pageUrl} className="border border-slate-800 bg-slate-900 p-3"><summary className="cursor-pointer text-xs font-semibold text-sky-300">{pageName(pageUrl)} <span className="ml-2 font-normal text-slate-500">{pageScripts.length} items</span></summary><div className="mt-3 space-y-2">{pageScripts.slice(0, 12).map((script) => { const assessment = resourceAssessment(script, runs.length); const identity = resourceIdentity(script, pageUrl); return <details key={script.url} className={assessment.level === "investigate" ? "border-l-2 border-rose-600 bg-slate-950 p-3" : assessment.level === "watch" ? "border-l-2 border-amber-600 bg-slate-950 p-3" : "border-l-2 border-emerald-700 bg-slate-950 p-3"}><summary className="cursor-pointer list-none"><div className="flex flex-col gap-2 sm:flex-row sm:justify-between"><div><div className="flex flex-wrap items-center gap-2"><span className={assessment.level === "investigate" ? "bg-rose-950 px-2 py-0.5 text-[10px] font-bold uppercase text-rose-200" : assessment.level === "watch" ? "bg-amber-950 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-200" : "bg-emerald-950 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-200"}>{assessment.label}</span><p className="break-all text-xs font-semibold text-slate-200">{resourceName(script.url)}</p></div><p className="mt-1 text-[11px] text-slate-500">{identity.owner} · {identity.purpose}</p></div><div className="shrink-0 text-right text-[11px]"><p className="text-slate-300">{script.runNumbers.size}/{runs.length} runs · {script.occurrences} loads</p><p className="mt-1 text-slate-500">{(script.durationMs / script.runNumbers.size / 1000).toFixed(2)}s avg · {(script.transferSize / 1024).toFixed(0)} KB</p></div></div></summary><div className="mt-3 space-y-3 border-t border-slate-800 pt-3 text-xs leading-5"><p className="text-slate-300"><span className="font-semibold text-white">Who owns it:</span> {identity.owner}. {identity.explanation}</p><p className="text-slate-300"><span className="font-semibold text-white">What we saw:</span> {assessment.observation}</p><p className="text-slate-300"><span className="font-semibold text-white">Why it matters:</span> {assessment.why}</p><p className="border-l-2 border-slate-600 pl-3 text-slate-400"><span className="font-semibold text-slate-200">When it may be acceptable:</span> {assessment.mitigation}</p><p className="text-sky-200"><span className="font-semibold">What to check next:</span> {assessment.next}</p><details><summary className="cursor-pointer text-[11px] text-slate-500">Technical evidence</summary><a href={script.url} target="_blank" rel="noreferrer" className="mt-2 block break-all text-[11px] text-sky-500 hover:text-sky-300">Open the exact resource: {script.url}</a><p className="mt-2 text-slate-400">{script.suggestion || "Review whether this resource is needed before the page becomes usable, and load it once where possible."}</p></details></div></details>})}</div></details>)}</div></details>)}</div></div></div>
      <div className="mt-7 flex flex-col gap-2 border-t border-slate-800 pt-5 text-xs text-slate-500 sm:flex-row sm:justify-between"><p>{repeatedScripts.length} resources repeated across runs or loaded multiple times on one page.</p><p>{market} · Desktop · {runs.length}/{expectedRuns} runs</p></div>
    </div>
  </section>;
}

