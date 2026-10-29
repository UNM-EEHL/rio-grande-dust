/*
 * Rio Grande river flow tools: the shared model.
 *
 * Every number used here is read from the files in data/, which
 * code/site_data.do writes from the outputs of the paper's replication
 * do-file. This file only applies the paper's chain, its Eqs. (2) to (5),
 * to the scenario a reader sets:
 *
 *   dE_t  = SUM_r  H_rt x ( ln Q_rts - ln Q_rt )        paper Eq. (2)
 *   dC_t  = PM10_t x ( exp( b x dE_t ) - 1 )            paper Eq. (3)
 *   dM_te = Y0_te x ( exp( beta_e x dC_t ) - 1 )        paper Eq. (4)
 *   V_te  = dM_te x VSL                                 paper Eq. (5)
 *
 * Every scenario applies to each reach's own gauge, as in the paper
 * (SI Eqs. S1 to S4). The two climate scenario types apply to the
 * climatological year, the 2015-2024 mean of each calendar day, through
 * SI Eqs. (S5) to (S7), as the paper's Scenarios (5) to (9) do.
 *
 * On the observed record the annual figure is the mean over days with a PM10
 * reading times 365.25, and on the climatological year it is the sum over
 * its 365 days, as in the paper's replication code. A comparison with a
 * reference river is reported as the paper reports its Scenario (1): what
 * the observed flows prevent, with a negative sign.
 *
 * Intervals: for the nine scenarios the paper reports, the paper's own 95%
 * intervals (data/tool_paper.csv). For any other setting, the 2.5th and
 * 97.5th percentiles across the 2,000 joint draws in data/tool_draws.csv.
 * tests/reconcile.mjs checks this file against code/site_data.do.
 */
(function (root) {
  "use strict";

  const ENDPOINTS = ["all", "cvd", "resp"];
  const DAYS_PER_YEAR = 365.25;
  const CLIMATE = { climate: true, seasonal: true };
  const AF_PER_CFS_DAY = 1.98347;

  function parseCSV(text) {
    const lines = text.replace(/\r/g, "").split("\n").filter(l => l.length);
    const head = lines[0].split(",").map(h => h.replace(/"/g, ""));
    return lines.slice(1).map(line => {
      const cells = line.split(",");
      const row = {};
      head.forEach((h, i) => {
        const v = (cells[i] || "").replace(/"/g, "");
        row[h] = (h === "day" || h === "name" || h === "scen" || h === "type" ||
                  h === "endpoint") ? v : (v === "" ? NaN : Number(v));
      });
      return row;
    });
  }

  /* The paper's nine scenarios, as the tools express them. */
  const PAPER = [
    { prow: 1, type: "reference", value: 1 },
    { prow: 2, type: "percent", value: -0.10 },
    { prow: 3, type: "add", value: 100 },
    { prow: 4, type: "floor", value: 100 },
    { prow: 5, type: "climate", value: 0.12 },
    { prow: 6, type: "climate", value: 0.30 },
    { prow: 7, type: "climate", value: 0.50 },
    { prow: 8, type: "seasonal", value: 0.12 },
    { prow: 9, type: "seasonal", value: 0.30 }
  ];
  function paperRow(sc) {
    const p = PAPER.find(r => r.type === sc.type && Math.abs(r.value - sc.value) < 1e-9);
    return p ? p.prow : 0;
  }

  function buildModel(dailyRows, paramRows, drawRows, climRows, paperRows) {
    const P = {};
    paramRows.forEach(r => { P[r.name] = r.value; });
    const n = dailyRows.length;
    const D = {
      n,
      day: dailyRows.map(r => r.day),
      yr: Int16Array.from(dailyRows, r => r.yr),
      mo: Int8Array.from(dailyRows, r => r.mo),
      H: [1, 2, 3, 4].map(k => Float64Array.from(dailyRows, r => r["H" + k])),
      q: [1, 2, 3, 4].map(k => Float64Array.from(dailyRows, r => r["q" + k])),
      pm10: Float64Array.from(dailyRows, r => r.pm10),
      y0: {
        all: Float64Array.from(dailyRows, r => r.y0_all),
        cvd: Float64Array.from(dailyRows, r => r.y0_cvd),
        resp: Float64Array.from(dailyRows, r => r.y0_resp)
      },
      pop: Float64Array.from(dailyRows, r => r.pop_exp)
    };
    const C = {
      n: climRows.length,
      dy: Int16Array.from(climRows, r => r.dy),
      mo: Int8Array.from(climRows, r => r.mo),
      H: Float64Array.from(climRows, r => r.H),
      pm10: Float64Array.from(climRows, r => r.pm10),
      y0: {
        all: Float64Array.from(climRows, r => r.y0_all),
        cvd: Float64Array.from(climRows, r => r.y0_cvd),
        resp: Float64Array.from(climRows, r => r.y0_resp)
      },
      qc: Float64Array.from(climRows, r => r.q_central)
    };
    const draws = {
      bE: Float64Array.from(drawRows, r => r.bE),
      all: Float64Array.from(drawRows, r => r.b_all),
      cvd: Float64Array.from(drawRows, r => r.b_cvd),
      resp: Float64Array.from(drawRows, r => r.b_resp)
    };
    const paper = {};
    paperRows.forEach(r => { (paper[r.prow] = paper[r.prow] || {})[r.endpoint] = r; });
    const beta = { all: P.b_all, cvd: P.b_cvd, resp: P.b_resp };
    const years = Array.from(new Set(D.yr)).sort((a, b) => a - b);
    let popSum = 0;
    for (let t = 0; t < n; t++) popSum += D.pop[t];

    /* The change in the log of one reach's flow, SI Eqs. (S1) to (S4). A
       flow-dependent scenario needs a positive flow on the reach; a reach-day
       without one contributes nothing, as in the paper. */
    function dlnq(sc, q) {
      const v = sc.value;
      switch (sc.type) {
        case "percent": return Math.log(1 + v);
        case "add": return q > 0 ? Math.log((q + v) / q) : 0;
        case "floor": return (q > 0 && q < v) ? Math.log(v / q) : 0;
        case "reference": return q > 0 ? Math.log(v) - Math.log(q) : 0;
        default: throw new Error("unknown scenario type " + sc.type);
      }
    }
    /* SI Eq. (S7), with the dry-season shape of SI Eq. (S5). */
    function cut(sc, mo) {
      if (sc.type === "climate") return sc.value;
      return (mo >= 7 && mo <= 10) ? 1.5 * sc.value : P.k_offseason * sc.value;
    }

    /* Paper Eq. (2), population-weighted: one value per day of the series
       the scenario uses. */
    function exposure(sc) {
      if (CLIMATE[sc.type]) {
        const dE = new Float64Array(C.n);
        for (let t = 0; t < C.n; t++) dE[t] = C.H[t] * Math.log(1 - cut(sc, C.mo[t]));
        return dE;
      }
      const dE = new Float64Array(n);
      for (let t = 0; t < n; t++) {
        let s = 0;
        for (let r = 0; r < 4; r++) s += D.H[r][t] * dlnq(sc, D.q[r][t]);
        dE[t] = s;
      }
      return dE;
    }

    /* The series a scenario runs on, its valid days, and how a day's mean
       change is turned into an annual figure. */
    function base(sc) {
      const idx = [];
      if (CLIMATE[sc.type]) {
        for (let t = 0; t < C.n; t++) idx.push(t);
        return { S: C, idx, annual: m => m * C.n, climate: true };
      }
      for (let t = 0; t < n; t++) if (Number.isFinite(D.pm10[t])) idx.push(t);
      return { S: D, idx, annual: m => m * DAYS_PER_YEAR, climate: false };
    }
    const sign = sc => (sc.type === "reference" ? -1 : 1);

    /* Water at the Central Avenue gauge in Albuquerque: the scenario's flow
       at the gauge minus the flow it carried, converted at 1.98347 acre-feet
       (AF) per cubic foot per second held for one day, per year. On the
       observed record this is averaged over 2015 to 2024; on the
       climatological year it is the sum over its 365 days. Volume at the
       gauge only; releases upstream would have to be larger. */
    function scenarioQ(sc, q, mo) {
      const v = sc.value;
      switch (sc.type) {
        case "percent": return q * (1 + v);
        case "add": return Math.max(q + v, 0);
        case "floor": return Math.max(q, v);
        case "reference": return v;
        case "climate": case "seasonal": return q * (1 - cut(sc, mo));
        default: throw new Error("unknown scenario type " + sc.type);
      }
    }
    function water(sc) {
      let s = 0;
      if (CLIMATE[sc.type]) {
        for (let t = 0; t < C.n; t++) s += scenarioQ(sc, C.qc[t], C.mo[t]) - C.qc[t];
        return { afYr: s * AF_PER_CFS_DAY, climate: true };
      }
      for (let t = 0; t < n; t++) s += scenarioQ(sc, D.q[2][t], D.mo[t]) - D.q[2][t];
      return { afYr: s * AF_PER_CFS_DAY / (n / DAYS_PER_YEAR), climate: false };
    }

    /* Central estimates at the point values of every parameter.
       byYear (observed record only): each year's total, as in the paper's
       Figure 5.
       byMonth: on the climatological year, each month's total; on the
       observed record, each calendar month's average total per year. */
    function central(sc) {
      const B = base(sc), S = B.S, sg = sign(sc);
      const dE = exposure(sc), bE = P.bE;
      let sumC = 0;
      const sums = { all: 0, cvd: 0, resp: 0 };
      const byYear = {}, byMonth = {};
      if (!B.climate) years.forEach(y => { byYear[y] = { all: 0, cvd: 0, resp: 0, dC: 0, days: 0 }; });
      for (let k = 1; k <= 12; k++) byMonth[k] = { all: 0, cvd: 0, resp: 0, dC: 0, days: 0 };
      for (const t of B.idx) {
        const dC = S.pm10[t] * (Math.exp(bE * dE[t]) - 1);
        sumC += dC;
        const Mo = byMonth[S.mo[t]];
        Mo.dC += dC; Mo.days++;
        const Y = B.climate ? null : byYear[D.yr[t]];
        if (Y) { Y.dC += dC; Y.days++; }
        for (const e of ENDPOINTS) {
          const d = S.y0[e][t] * (Math.exp(beta[e] * dC) - 1);
          sums[e] += d; Mo[e] += d; if (Y) Y[e] += d;
        }
      }
      const m = B.idx.length;
      const out = { nDays: m, climate: B.climate, dCmean: sg * sumC / m, deathsYr: {}, byYear, byMonth,
                    years: B.climate ? [] : years, prow: paperRow(sc) };
      for (const e of ENDPOINTS) out.deathsYr[e] = sg * B.annual(sums[e] / m);
      if (!B.climate) years.forEach(y => { const Y = byYear[y];
        Y.dCmean = sg * Y.dC / Y.days;
        for (const e of ENDPOINTS) Y[e] = sg * Y[e]; });
      const f = B.climate ? 1 : 1 / years.length;   /* observed: the month's average total per year */
      for (let k = 1; k <= 12; k++) { const Mo = byMonth[k];
        Mo.dCmean = sg * Mo.dC / Mo.days;
        for (const e of ENDPOINTS) Mo[e] = sg * Mo[e] * f; }
      return out;
    }

    function pctl(arr) {
      const s = Float64Array.from(arr).sort();
      const k = s.length;
      return [s[Math.floor(0.025 * k) - 1], s[Math.ceil(0.975 * k) - 1]];
    }

    /* 95% intervals across the 2,000 joint draws, for the change in PM10 and
       each cause of mortality. */
    function drawIntervals(sc) {
      const B = base(sc), S = B.S, sg = sign(sc);
      const dE = exposure(sc), idx = B.idx, m = idx.length;
      const K = draws.bE.length;
      const dCk = new Float64Array(m);
      const res = { dC: new Float64Array(K), all: new Float64Array(K),
                    cvd: new Float64Array(K), resp: new Float64Array(K) };
      for (let k = 0; k < K; k++) {
        const bEk = draws.bE[k];
        let s0 = 0;
        for (let i = 0; i < m; i++) {
          const c = S.pm10[idx[i]] * (Math.exp(bEk * dE[idx[i]]) - 1);
          dCk[i] = c; s0 += c;
        }
        res.dC[k] = s0 / m;
        for (const e of ENDPOINTS) {
          const b = draws[e][k], y0 = S.y0[e];
          let s = 0;
          for (let i = 0; i < m; i++) s += y0[idx[i]] * (Math.exp(b * dCk[i]) - 1);
          res[e][k] = B.annual(s / m);
        }
      }
      /* percentiles of the rise a reference river would bring, then signed
         as prevented with the ends swapped, as the paper does */
      const P2 = a => { const q = pctl(a); return sg > 0 ? q : [-q[1], -q[0]]; };
      return { dC: P2(res.dC), all: P2(res.all), cvd: P2(res.cvd), resp: P2(res.resp) };
    }

    /* The intervals a page shows: the paper's own for its nine scenarios,
       the joint draws otherwise. The paper reports no interval on the change
       in PM10, so that one always comes from the joint draws. */
    function intervals(sc, opts) {
      const ci = drawIntervals(sc);
      const pr = paperRow(sc);
      if (pr && !(opts && opts.drawsOnly)) {
        for (const e of ENDPOINTS) ci[e] = [paper[pr][e].d_lo, paper[pr][e].d_hi];
        ci.source = "paper";
      } else ci.source = "draws";
      return ci;
    }

    /* One monitor, one day: the % change in PM10 when the wind blows from a
       reach for `hours` hours and that reach's flow moves from qNow to qNew. */
    function onePlace(qNow, qNew, hours) {
      const x = hours * Math.log(qNew / qNow);
      const pct = 100 * (Math.exp(P.bE * x) - 1);
      const K = draws.bE.length, s = new Float64Array(K);
      for (let k = 0; k < K; k++) s[k] = 100 * (Math.exp(draws.bE[k] * x) - 1);
      return { pct, ci: pctl(s) };
    }

    return {
      P, D, C, draws, years, ENDPOINTS, PAPER, paper, paperRow,
      meanPop: popSum / n,
      vsl: { central: P.VSL, low: P.VSL_lo, high: P.VSL_hi },
      exposure, central, intervals, drawIntervals, onePlace, water, AF_PER_CFS_DAY
    };
  }

  async function load(base) {
    base = base || "data/";
    const get = f => fetch(base + f).then(r => {
      if (!r.ok) throw new Error("could not load " + f);
      return r.text();
    });
    const files = ["tool_daily.csv", "tool_params.csv", "tool_draws.csv", "tool_climyear.csv", "tool_paper.csv"];
    const t = await Promise.all(files.map(get));
    return buildModel(...t.map(parseCSV));
  }

  const api = { load, buildModel, parseCSV, PAPER };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.RGModel = api;
})(typeof window !== "undefined" ? window : globalThis);
