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
  const issueMap = new Map<string, { section: string; pageUrl: string; text: string; runs: Set<number>; blocked: boolean }>();
  const scriptMap = new Map<string, ScriptFinding>();

  runs.forEach((run, runIndex) => run.steps.forEach((step) => {
    [...step.issues, ...step.inefficiencies, ...(step.note ? [step.note] : [])].forEach((text) => {
      const key = `${step.name}|${step.url}|${text}`;
      const issue = issueMap.get(key) ?? { section: step.name, pageUrl: step.url, text, runs: new Set<number>(), blocked: step.status === "blocked" };
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
  const troublingScripts = scripts.filter((script) => script.impact === "high" || script.impact === "medium" || script.durationMs / script.runNumbers.size >= 500 || script.occurrences > script.runNumbers.size);
  const blocked = issues.find((issue) => issue.blocked);
  const slowest = [...stages].sort((a, b) => b.averageMs - a.averageMs)[0];
  const score = Math.max(0, Math.round(100 * completedRuns / runs.length - repeatedIssues.filter((issue) => issue.blocked).length * 10 - Math.min(25, troublingScripts.length * 2)));
  const decision = blocked ? `Fix ${blocked.section.toLowerCase()} first; it blocked ${blocked.runs.size} of ${runs.length} runs.` : slowest ? `The journey completes. Focus next on ${slowest.name.toLowerCase()}, averaging ${(slowest.averageMs / 1000).toFixed(1)} seconds.` : "No repeatable blocker was found.";
  const sections = stepOrder.map((section) => ({ section, pages: [...new Set(scripts.filter((script) => script.section === section).map((script) => script.pageUrl))].map((pageUrl) => ({ pageUrl, scripts: scripts.filter((script) => script.section === section && script.pageUrl === pageUrl) })) })).filter((section) => section.pages.length);

  return <section className="mt-10 overflow-hidden border border-slate-700 bg-slate-900 shadow-2xl shadow-slate-950/50">
    <div className="border-b border-slate-700 bg-gradient-to-r from-slate-900 via-slate-900 to-sky-950/40 p-5 sm:p-7"><div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between"><div><div className="flex flex-wrap items-center gap-3"><p className="text-xs font-bold tracking-[0.2em] text-sky-400 uppercase">Live executive journey report</p><span className="border border-emerald-700/70 bg-emerald-950/40 px-2 py-1 text-[10px] font-bold tracking-wider text-emerald-200 uppercase">Measured data</span>{isRunning && <span className="text-xs text-amber-300">Run {Math.min(runs.length + 1, expectedRuns)} of {expectedRuns} in progress</span>}</div><h2 className="mt-3 text-2xl font-semibold text-white sm:text-3xl">{completedRuns === runs.length ? "The buying journey completes." : `${runs.length - completedRuns} of ${runs.length} runs encountered a block.`}</h2><p className="mt-3 text-sm leading-6 text-slate-400">Results from {runs.length} identical {market} journey run{runs.length === 1 ? "" : "s"}, grouped by section and page.</p><p className="mt-2 truncate text-xs text-slate-600">{targetUrl}</p></div><div className="border-l-2 border-sky-500 pl-4 lg:max-w-sm"><p className="text-xs font-bold tracking-wider text-sky-300 uppercase">Decision</p><p className="mt-2 text-sm leading-6 text-slate-200">{decision}</p></div></div></div>
    <div className="grid gap-px bg-slate-800 sm:grid-cols-2 lg:grid-cols-5">{[["Journey score", `${score} / 100`], ["Completed", `${completedRuns} of ${runs.length}`], ["Repeated issues", String(repeatedIssues.length)], ["Troubling scripts", String(troublingScripts.length)], ["Confidence", runs.length >= expectedRuns ? "High" : "Building"]].map(([label, value]) => <div key={label} className="bg-slate-950/80 p-5"><p className="text-xs text-slate-500">{label}</p><p className="mt-2 text-2xl font-semibold text-white">{value}</p></div>)}</div>
    <div className="p-5 sm:p-7"><div className="flex items-end justify-between"><div><p className="text-xs font-bold tracking-[0.2em] text-sky-400 uppercase">Journey consistency</p><h3 className="mt-2 text-xl font-semibold text-white">Pass rate and average time by section</h3></div><p className="text-xs text-slate-500">Target: {expectedRuns} runs</p></div>
      <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{stages.map((stage) => <div key={stage.name} className={stage.state === "bad" ? "border border-rose-700 bg-rose-950/30 p-3" : stage.state === "warn" ? "border border-amber-800 bg-amber-950/20 p-3" : "border border-emerald-800 bg-emerald-950/20 p-3"}><p className="text-sm font-semibold text-white">{stage.name}</p><p className="mt-2 text-xs text-slate-300">{stage.complete}/{runs.length} passed · {(stage.averageMs / 1000).toFixed(2)}s average</p></div>)}</div>
      <div className="mt-8 grid gap-6 xl:grid-cols-[0.8fr_1.2fr]"><div><p className="text-xs font-bold tracking-[0.2em] text-amber-300 uppercase">Repeated journey issues</p><h3 className="mt-2 text-xl font-semibold text-white">Patterns seen more than once</h3><div className="mt-4 space-y-2">{repeatedIssues.length === 0 && <p className="border border-slate-700 bg-slate-950/60 p-4 text-sm text-emerald-300">No issue has repeated across the completed runs.</p>}{repeatedIssues.map((issue) => <details key={`${issue.section}-${issue.text}`} className="border border-slate-700 bg-slate-950/60 p-3"><summary className="cursor-pointer list-none"><div className="flex justify-between gap-4"><div><p className="text-sm font-semibold text-slate-200">{issue.section}</p><p className="mt-1 text-xs text-slate-500">{pageName(issue.pageUrl)}</p></div><span className={issue.blocked ? "text-xs font-semibold text-rose-300" : "text-xs font-semibold text-amber-300"}>{issue.runs.size}/{runs.length} runs</span></div></summary><p className="mt-3 border-t border-slate-800 pt-3 text-xs leading-5 text-slate-300">{issue.text}</p></details>)}</div></div>
        <div><p className="text-xs font-bold tracking-[0.2em] text-sky-400 uppercase">Code and script evidence</p><h3 className="mt-2 text-xl font-semibold text-white">Grouped by section and page</h3><p className="mt-2 text-sm text-slate-400">Open a section, then a page, to inspect resources in priority order.</p><div className="mt-4 space-y-3">{sections.map(({ section, pages }) => <details key={section} className="border border-slate-700 bg-slate-950/60 p-4"><summary className="cursor-pointer text-sm font-semibold text-white">{section} <span className="ml-2 text-xs font-normal text-slate-500">{pages.reduce((sum, page) => sum + page.scripts.length, 0)} resources</span></summary><div className="mt-3 space-y-2 border-t border-slate-800 pt-3">{pages.map(({ pageUrl, scripts: pageScripts }) => <details key={pageUrl} className="border border-slate-800 bg-slate-900 p-3"><summary className="cursor-pointer text-xs font-semibold text-sky-300">{pageName(pageUrl)} <span className="ml-2 font-normal text-slate-500">{pageScripts.length} items</span></summary><div className="mt-3 space-y-2">{pageScripts.slice(0, 12).map((script) => <details key={script.url} className="border-l-2 border-slate-700 bg-slate-950 p-3"><summary className="cursor-pointer list-none"><div className="flex flex-col gap-2 sm:flex-row sm:justify-between"><div><p className="break-all text-xs font-semibold text-slate-200">{resourceName(script.url)}</p><p className="mt-1 text-[11px] text-slate-500">{script.role || script.purpose}</p></div><div className="shrink-0 text-right text-[11px]"><p className={script.impact === "high" ? "font-bold text-rose-300" : script.impact === "medium" ? "font-semibold text-amber-300" : "text-slate-400"}>{script.runNumbers.size}/{runs.length} runs · {script.occurrences} loads</p><p className="mt-1 text-slate-500">{(script.durationMs / script.runNumbers.size / 1000).toFixed(2)}s avg · {(script.transferSize / 1024).toFixed(0)} KB</p></div></div></summary><div className="mt-3 border-t border-slate-800 pt-3"><p className="break-all text-[11px] text-slate-500">{script.url}</p><p className="mt-2 text-xs leading-5 text-slate-300">{script.suggestion || "Review whether this resource is needed before the page becomes usable, and load it once where possible."}</p></div></details>)}</div></details>)}</div></details>)}</div></div></div>
      <div className="mt-7 flex flex-col gap-2 border-t border-slate-800 pt-5 text-xs text-slate-500 sm:flex-row sm:justify-between"><p>{repeatedScripts.length} resources repeated across runs or loaded multiple times on one page.</p><p>{market} · Desktop · {runs.length}/{expectedRuns} runs</p></div>
    </div>
  </section>;
}

