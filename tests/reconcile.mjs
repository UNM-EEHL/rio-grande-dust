// Checks the browser model against the replication do-file's own results.
// Run from the repository root:  node tests/reconcile.mjs
// Every scenario in data/tool_checks.csv was computed in Stata (Section 17 of
// the replication do-file) with the same inputs; the browser code must
// reproduce the central estimate and the 95% interval of each one.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { buildModel, parseCSV } = require("../assets/model.js");

const read = f => parseCSV(readFileSync(new URL("../data/" + f, import.meta.url), "utf8"));
const M = buildModel(read("tool_daily.csv"), read("tool_params.csv"), read("tool_draws.csv"));
const checks = read("tool_checks.csv");

const TYPE = { percent: "percent", seasonal: "seasonal", add: "add", floor: "floor", reference: "reference" };
const rel = (a, b) => Math.abs(a - b) / Math.max(Math.abs(b), 1e-12);
let worst = 0, n = 0, fails = 0;
const cache = new Map();
for (const c of checks) {
  if (c.type === "day") {
    const r = M.onePlace(1, 0.5, 24);   // flow halved, 24 hours downwind
    const d = rel(r.pct, c.dC_mean);
    worst = Math.max(worst, d); n++;
    if (d > 1e-9) { fails++; console.log("FAIL", c.scen, r.pct, c.dC_mean); }
    continue;
  }
  const sc = { type: TYPE[c.type], value: c.value };
  const key = c.scen + "|" + c.days;
  if (!cache.has(key)) cache.set(key, { cen: M.central(sc, { days: c.days }), ci: M.intervals(sc, { days: c.days }) });
  const { cen, ci } = cache.get(key);
  const pairs = [["dC_mean", cen.dCmean, c.dC_mean], ["deaths_yr", cen.deathsYr[c.endpoint], c.deaths_yr],
                 ["d_lo", ci[c.endpoint][0], c.d_lo], ["d_hi", ci[c.endpoint][1], c.d_hi],
                 ["dollars_yr", cen.deathsYr[c.endpoint] * M.vsl.central, c.dollars_yr]];
  for (const [what, js, st] of pairs) {
    const d = rel(js, st); worst = Math.max(worst, d); n++;
    if (d > 1e-9) { fails++; console.log("FAIL", c.scen, c.endpoint, c.days, what, js, st, d); }
  }
}
console.log(`${n} comparisons against Stata, largest relative difference ${worst.toExponential(2)}, failures ${fails}`);
process.exit(fails ? 1 : 0);
