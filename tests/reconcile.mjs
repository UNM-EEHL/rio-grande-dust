// Checks the browser model against Stata and against the paper.
// Run from the repository root:  node tests/reconcile.mjs
// 1. Every scenario in data/tool_checks.csv was computed in Stata by
//    code/site_data.do from the same inputs; the browser code must reproduce
//    its central estimate and its 95% interval across the joint draws.
// 2. The paper's nine scenarios: the browser's central estimates must equal
//    the paper's Tables 2 and 3 (data/tool_paper.csv), and the intervals the
//    pages show for them must be the paper's.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { buildModel, parseCSV, PAPER } = require("../assets/model.js");

const read = f => parseCSV(readFileSync(new URL("../data/" + f, import.meta.url), "utf8"));
const M = buildModel(read("tool_daily.csv"), read("tool_params.csv"), read("tool_draws.csv"),
                     read("tool_climyear.csv"), read("tool_paper.csv"));
const checks = read("tool_checks.csv");
const paper = read("tool_paper.csv");

const rel = (a, b) => Math.abs(a - b) / Math.max(Math.abs(b), 1e-12);
let worst = 0, n = 0, fails = 0;
const test = (tag, js, st) => {
  const d = rel(js, st); worst = Math.max(worst, d); n++;
  if (d > 1e-9) { fails++; console.log("FAIL", tag, js, st, d); }
};
const cache = new Map();
const get = sc => {
  const key = sc.type + "|" + sc.value;
  if (!cache.has(key)) cache.set(key, { cen: M.central(sc), ci: M.drawIntervals(sc), shown: M.intervals(sc) });
  return cache.get(key);
};
for (const c of checks) {
  if (c.type === "day") { test("day_half", M.onePlace(1, 0.5, 24).pct, c.dC_mean); continue; }
  const { cen, ci } = get({ type: c.type, value: c.value });
  const tag = c.scen + " " + c.endpoint;
  test(tag + " dC_mean", cen.dCmean, c.dC_mean);
  test(tag + " deaths_yr", cen.deathsYr[c.endpoint], c.deaths_yr);
  test(tag + " d_lo", ci[c.endpoint][0], c.d_lo);
  test(tag + " d_hi", ci[c.endpoint][1], c.d_hi);
  test(tag + " dollars_yr", cen.deathsYr[c.endpoint] * M.vsl.central, c.dollars_yr);
}
const n1 = n;
for (const r of paper) {
  const p = PAPER.find(x => x.prow === r.prow);
  const { cen, shown } = get({ type: p.type, value: p.value });
  const tag = "paper (" + r.prow + ") " + r.endpoint;
  test(tag + " PM10", cen.dCmean, r.dC_mean);
  test(tag + " mortality", cen.deathsYr[r.endpoint], r.deaths_yr);
  test(tag + " damages", cen.deathsYr[r.endpoint] * M.vsl.central / 1e6, r.m_dollars_yr);
  test(tag + " CI low", shown[r.endpoint][0], r.d_lo);
  test(tag + " CI high", shown[r.endpoint][1], r.d_hi);
  test(tag + " damages CI low", shown[r.endpoint][0] * M.vsl.central / 1e6, r.m_v_lo);
  test(tag + " damages CI high", shown[r.endpoint][1] * M.vsl.central / 1e6, r.m_v_hi);
}
console.log(`${n1} comparisons against Stata and ${n - n1} against the paper's Tables 2 and 3,` +
            ` largest relative difference ${worst.toExponential(2)}, failures ${fails}`);
process.exit(fails ? 1 : 0);
