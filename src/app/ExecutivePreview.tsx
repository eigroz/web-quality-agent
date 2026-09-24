type ExecutivePreviewProps = {
  market: string;
  targetUrl: string;
};

const stages = [
  { name: "Homepage", result: "3/3 passed", state: "good" },
  { name: "Product range", result: "3/3 passed", state: "good" },
  { name: "Product page", result: "3/3 passed", state: "good" },
  { name: "Configure", result: "3/3 passed", state: "good" },
  { name: "Cart", result: "1/3 passed", state: "bad" },
  { name: "Checkout", result: "1/3 reached", state: "muted" },
] as const;

const inefficiencies = [
  { title: "Product configuration is slow", repeat: "3 of 3 runs", measure: "6.8s median" },
  { title: "Analytics bundle loads twice", repeat: "3 of 3 runs", measure: "410 KB repeated" },
  { title: "Three redirects before the product range", repeat: "3 of 3 runs", measure: "+1.4s" },
  { title: "Product page is heavier than expected", repeat: "2 of 3 runs", measure: "5.4 MB" },
] as const;

function stageClasses(state: (typeof stages)[number]["state"]) {
  if (state === "good") return "border-emerald-800/80 bg-emerald-950/30 text-emerald-300";
  if (state === "bad") return "border-rose-700 bg-rose-950/40 text-rose-200";
  return "border-slate-700 bg-slate-900 text-slate-400";
}

export default function ExecutivePreview({ market, targetUrl }: ExecutivePreviewProps) {
  return (
    <section className="mt-10 overflow-hidden border border-slate-700 bg-slate-900 shadow-2xl shadow-slate-950/50">
      <div className="border-b border-slate-700 bg-gradient-to-r from-slate-900 via-slate-900 to-sky-950/40 p-5 sm:p-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-xs font-bold tracking-[0.2em] text-sky-400 uppercase">Executive journey preview</p>
              <span className="border border-amber-700/70 bg-amber-950/40 px-2 py-1 text-[10px] font-bold tracking-wider text-amber-200 uppercase">Illustrative data</span>
            </div>
            <h2 className="mt-3 text-2xl font-semibold text-white sm:text-3xl">The buying journey is unreliable at cart.</h2>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">Three identical runs separate a repeatable customer blocker from slower steps that create friction. This preview follows the selected {market} journey.</p>
            <p className="mt-2 max-w-3xl truncate text-xs text-slate-600">{targetUrl}</p>
          </div>
          <div className="border-l-2 border-rose-500 pl-4 lg:max-w-sm">
            <p className="text-xs font-bold tracking-wider text-rose-300 uppercase">Decision</p>
            <p className="mt-2 text-sm leading-6 text-slate-200">Restore reliable cart progression before investing in performance optimisation.</p>
          </div>
        </div>
      </div>

      <div className="grid gap-px bg-slate-800 sm:grid-cols-2 lg:grid-cols-5">
        {[
          ["Journey score", "54 / 100", "Needs attention"],
          ["Completed", "1 of 3", "Two runs blocked"],
          ["Blockers", "1", "Conversion risk"],
          ["Inefficiencies", "4", "Cost and delay"],
          ["Confidence", "High", "Repeated 3 times"],
        ].map(([label, value, note]) => (
          <div key={label} className="bg-slate-950/80 p-5">
            <p className="text-xs font-medium text-slate-500">{label}</p>
            <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
            <p className="mt-1 text-xs text-slate-500">{note}</p>
          </div>
        ))}
      </div>

      <div className="p-5 sm:p-7">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div><p className="text-xs font-bold tracking-[0.2em] text-sky-400 uppercase">Journey funnel</p><h3 className="mt-2 text-xl font-semibold text-white">Where customers lose momentum</h3></div>
          <p className="text-xs text-slate-500">Same route · same market · 3 runs</p>
        </div>
        <div className="mt-5 grid gap-2 md:grid-cols-6">
          {stages.map((stage, index) => (
            <div key={stage.name} className={`relative border p-3 ${stageClasses(stage.state)}`}>
              <p className="text-[10px] font-bold tracking-wider uppercase opacity-70">Step {index + 1}</p>
              <p className="mt-2 text-sm font-semibold">{stage.name}</p>
              <p className="mt-1 text-xs opacity-80">{stage.result}</p>
            </div>
          ))}
        </div>

        <div className="mt-7 grid gap-5 xl:grid-cols-[1.25fr_1fr]">
          <div>
            <div className="flex items-center justify-between"><div><p className="text-xs font-bold tracking-[0.2em] text-rose-400 uppercase">Blocking conversion</p><h3 className="mt-2 text-xl font-semibold text-white">One issue needs immediate action</h3></div><span className="bg-rose-500 px-2.5 py-1 text-xs font-bold text-white">P1</span></div>
            <details open className="mt-4 border border-rose-800/80 bg-rose-950/20 p-4">
              <summary className="cursor-pointer list-none">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><p className="font-semibold text-white">Add to cart does not progress the journey</p><p className="mt-2 text-sm text-slate-400">The action failed in two consecutive runs, after a successful product configuration.</p></div><span className="shrink-0 text-sm font-semibold text-rose-300">2 of 3 runs</span></div>
              </summary>
              <div className="mt-5 grid gap-4 border-t border-rose-900/70 pt-5 text-sm md:grid-cols-2">
                <div><p className="text-xs font-bold tracking-wider text-slate-500 uppercase">Customer impact</p><p className="mt-2 leading-6 text-slate-300">Customers can choose a product but cannot reliably begin checkout. Paid traffic may reach the product and still produce no order.</p></div>
                <div><p className="text-xs font-bold tracking-wider text-slate-500 uppercase">Observed evidence</p><p className="mt-2 leading-6 text-slate-300">The button accepted the click, but the cart count and URL did not change within 10 seconds.</p></div>
                <div><p className="text-xs font-bold tracking-wider text-slate-500 uppercase">Expected</p><p className="mt-2 leading-6 text-slate-300">A cart confirmation or checkout transition after one click.</p></div>
                <div><p className="text-xs font-bold tracking-wider text-slate-500 uppercase">Recommended owner</p><p className="mt-2 leading-6 text-slate-300">Ecommerce platform team · reproduce with the captured route and inspect cart API errors.</p></div>
              </div>
            </details>
          </div>

          <div>
            <p className="text-xs font-bold tracking-[0.2em] text-amber-300 uppercase">Creating friction</p>
            <h3 className="mt-2 text-xl font-semibold text-white">Four recurring inefficiencies</h3>
            <div className="mt-4 space-y-2">
              {inefficiencies.map((item) => (
                <details key={item.title} className="border border-slate-700 bg-slate-950/60 p-3">
                  <summary className="cursor-pointer list-none"><div className="flex items-start justify-between gap-4"><div><p className="text-sm font-semibold text-slate-200">{item.title}</p><p className="mt-1 text-xs text-slate-500">{item.repeat}</p></div><span className="shrink-0 text-xs font-semibold text-amber-300">{item.measure}</span></div></summary>
                  <p className="mt-3 border-t border-slate-800 pt-3 text-xs leading-5 text-slate-400">Open the live finding to see the affected requests, timestamps, likely cause, and the action recommended for the delivery team.</p>
                </details>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-7 flex flex-col gap-3 border-t border-slate-800 pt-5 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <p>This sample shows the proposed report structure. Live run history will replace these figures.</p>
          <p className="text-slate-400">Last 3 runs · Desktop · {market}</p>
        </div>
      </div>
    </section>
  );
}

