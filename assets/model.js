/*
 * Rio Grande river flow tools: the shared model.
 *
 * Every number used here is read from the files in data/, which the project's
 * replication do-file writes in its Section 17. This file only applies the
 * chain of that do-file's Section 11 to the scenario a reader sets:
 *
 *   dE_t  = SUM_r  H_rt x dlnQ_rt                    (Eq. 34)
 *   dC_t  = PM10_t x ( exp( b_E x dE_t ) - 1 )       (Eq. 28)
 *   dD_te = Y0_te x ( exp( beta_e x dC_t ) - 1 )     (Eq. 29)
 *   V_te  = dD_te x VSL                              (Eq. 30)
 *
 * Annual figures are the mean over days with a PM10 reading times 365.25, the
 * do-file's convention. Intervals use the 2,000 joint draws the do-file wrote,
 * taking the 50th and 1,950th of the sorted results, as the do-file does.
 * tests/reconcile.mjs checks this file against the do-file's own results.
 */
(function (root) {
  "use strict";

  const ENDPOINTS = ["all", "cvd", "resp"];
  const DAYS_PER_YEAR = 365.25;

  function parseCSV(text) {
    const lines = text.replace(/\r/g, "").split("\n").filter(l => l.length);
    const head = lines[0].split(",").map(h => h.replace(/"/g, ""));
    return lines.slice(1).map(line => {
      const cells = line.split(",");
      const row = {};
      head.forEach((h, i) => {
        const v = (cells[i] || "").replace(/"/g, "");
        row[h] = (h === "day" || h === "name" || h === "scen" || h === "type" ||
                  h === "endpoint" || h === "days") ? v : (v === "" ? NaN : Number(v));
      });
      return row;
    });
  }

  function buildModel(dailyRows, paramRows, drawRows) {
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
      pop: Float64Array.from(dailyRows, r => r.pop_exp),
      b100: Uint8Array.from(dailyRows, r => r.b100)
    };
    const valid = Uint8Array.from(D.pm10, v => (Number.isFinite(v) ? 1 : 0));
    const draws = {
      bE: Float64Array.from(drawRows, r => r.bE),
      all: Float64Array.from(drawRows, r => r.b_all),
      cvd: Float64Array.from(drawRows, r => r.b_cvd),
      resp: Float64Array.from(drawRows, r => r.b_resp)
    };
    const beta = { all: P.b_all, cvd: P.b_cvd, resp: P.b_resp };
    const years = Array.from(new Set(D.yr)).sort((a, b) => a - b);
    let popSum = 0;
    for (let t = 0; t < n; t++) popSum += D.pop[t];

    /* The change in the log of one reach's flow under a scenario. A
       proportional change applies to every reach-day; the others need a
       positive flow, and a reach with zero or missing flow contributes zero. */
    function dlnq(sc, q, mo) {
      const v = sc.value;
      switch (sc.type) {
        case "percent": return Math.log(1 + v);
        case "seasonal": return (mo >= 7 && mo <= 10) ? Math.log(1 - 1.5 * v)
                                                      : Math.log(1 - P.k_offseason * v);
        case "add": return q > 0 ? Math.log((q + v) / q) : 0;
        case "floor": return (q > 0 && q < v) ? Math.log(v / q) : 0;
        case "reference": return q > 0 ? Math.log(v) - Math.log(q) : 0;
        default: throw new Error("unknown scenario type " + sc.type);
      }
    }

    /* Eq. (34): the population-weighted change in the downwind exposure term. */
    function exposure(sc) {
      const dE = new Float64Array(n);
      for (let t = 0; t < n; t++) {
        let s = 0;
        for (let r = 0; r < 4; r++) s += D.H[r][t] * dlnq(sc, D.q[r][t], D.mo[t]);
        dE[t] = s;
      }
      return dE;
    }

    function daySet(which) {
      if (which === "bind") return Uint8Array.from(valid, (v, t) => v && D.b100[t] ? 1 : 0);
      return valid;
    }

    /* Central estimates at the point values of every parameter. */
    function central(sc, opts) {
      opts = opts || {};
      const use = daySet(opts.days || "all");
      const dE = exposure(sc);
      const bE = P.bE;
      let m = 0, sumC = 0;
      const sums = { all: 0, cvd: 0, resp: 0 };
      const byYear = {};
      years.forEach(y => { byYear[y] = { all: 0, cvd: 0, resp: 0, dC: 0, days: 0 }; });
      for (let t = 0; t < n; t++) {
        if (!use[t]) continue;
        const dC = D.pm10[t] * (Math.exp(bE * dE[t]) - 1);
        m++; sumC += dC;
        const Y = byYear[D.yr[t]];
        Y.dC += dC; Y.days++;
        for (const e of ENDPOINTS) {
          const d = D.y0[e][t] * (Math.exp(beta[e] * dC) - 1);
          sums[e] += d; Y[e] += d;
        }
      }
      const out = { nDays: m, dCmean: sumC / m, deathsYr: {}, byYear, years };
      for (const e of ENDPOINTS) out.deathsYr[e] = sums[e] / m * DAYS_PER_YEAR;
      years.forEach(y => { byYear[y].dCmean = byYear[y].dC / byYear[y].days; });
      return out;
    }

    function pctl(arr) {
      const s = Float64Array.from(arr).sort();
      const k = s.length;
      return [s[Math.floor(0.025 * k) - 1], s[Math.ceil(0.975 * k) - 1]];
    }

    /* 95% intervals across the do-file's 2,000 joint draws. */
    function intervals(sc, opts) {
      opts = opts || {};
      const use = daySet(opts.days || "all");
      const dE = exposure(sc);
      const idx = [];
      for (let t = 0; t < n; t++) if (use[t]) idx.push(t);
      const m = idx.length;
      const K = draws.bE.length;
      const dCk = new Float64Array(m);
      const res = { dC: new Float64Array(K), all: new Float64Array(K),
                    cvd: new Float64Array(K), resp: new Float64Array(K) };
      for (let k = 0; k < K; k++) {
        const bEk = draws.bE[k];
        let sc0 = 0;
        for (let i = 0; i < m; i++) {
          const t = idx[i];
          const c = D.pm10[t] * (Math.exp(bEk * dE[t]) - 1);
          dCk[i] = c; sc0 += c;
        }
        res.dC[k] = sc0 / m;
        for (const e of ENDPOINTS) {
          const b = draws[e][k], y0 = D.y0[e];
          let s = 0;
          for (let i = 0; i < m; i++) s += y0[idx[i]] * (Math.exp(b * dCk[i]) - 1);
          res[e][k] = s / m * DAYS_PER_YEAR;
        }
      }
      return { dC: pctl(res.dC), all: pctl(res.all), cvd: pctl(res.cvd), resp: pctl(res.resp) };
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
      P, D, draws, years, ENDPOINTS,
      meanPop: popSum / n,
      vsl: { central: P.VSL, low: P.VSL_lo, high: P.VSL_hi },
      dlnq, exposure, central, intervals, onePlace
    };
  }

  async function load(base) {
    base = base || "data/";
    const get = f => fetch(base + f).then(r => {
      if (!r.ok) throw new Error("could not load " + f);
      return r.text();
    });
    const [d, p, w] = await Promise.all([get("tool_daily.csv"), get("tool_params.csv"),
                                         get("tool_draws.csv")]);
    return buildModel(parseCSV(d), parseCSV(p), parseCSV(w));
  }

  const api = { load, buildModel, parseCSV };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.RGModel = api;
})(typeof window !== "undefined" ? window : globalThis);
