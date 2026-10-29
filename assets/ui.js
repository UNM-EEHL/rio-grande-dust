/* Shared controls for the scenario tools. */
(function (root) {
  "use strict";

  const TYPES = {
    percent: { btn: "Change the flow", label: "Change in flow in every reach",
               min: -90, max: 100, step: 1, def: -10, toValue: v => v / 100,
               show: v => (v > 0 ? "+" : "") + v + "%",
               hint: "A proportional change to the flow each of the four reaches actually carried on every day of 2015 to 2024. The paper's Scenario (2) is 10% less." },
    climate: { btn: "Climate: less water", label: "Loss of water, the same share in every month",
               min: 2, max: 60, step: 1, def: 30, toValue: v => v / 100,
               show: v => v + "% per year",
               hint: "A typical year under a drier climate: the 2015 to 2024 average of each calendar day, with every reach carrying this share less water in every month. The paper's Scenarios (5) to (7) are 12%, 30%, and 50%." },
    seasonal: { btn: "Climate: dry-season loss", label: "Loss of water, concentrated in July to October",
                min: 2, max: 60, step: 1, def: 30, toValue: v => v / 100,
                show: v => v + "% per year",
                hint: "The same annual loss of water in a typical year, taken one and a half times as hard in July to October, the months in which declining base flow leaves the river bed driest, and less hard in the other eight months. The paper's Scenarios (8) and (9) are 12% and 30%." },
    add: { btn: "Add water", label: "Water added to every reach",
           min: 10, max: 500, step: 10, def: 100, toValue: v => v,
           show: v => "+" + v + " cfs",
           hint: "A fixed amount of extra flow, in cubic feet per second (cfs), in each of the four reaches on every day of 2015 to 2024. The paper's Scenario (3) is 100 cfs." },
    floor: { btn: "Low-flow floor", label: "Minimum flow in every reach",
             min: 10, max: 300, step: 5, def: 100, toValue: v => v,
             show: v => v + " cfs",
             hint: "Every day a reach ran below this flow is raised to it; days above it are left alone. The paper's Scenario (4) is 100 cfs, the minimum the 2003 Biological Opinion required at the Central Avenue gauge in Albuquerque, applied to every reach." },
    reference: { btn: "Versus a dry river", label: "Flow in every reach of the comparison river",
                 min: 1, max: 100, step: 1, def: 1, toValue: v => v,
                 show: v => v + " cfs",
                 hint: "What the river as it actually flowed prevents, compared with a river carrying only this much in every reach on every day of 2015 to 2024. The results are negative because they are prevented. The paper's Scenario (1) is 1 cfs, a nearly dry river." }
  };

  /* The paper's nine scenarios, numbered as in its Tables 2 and 3. */
  const PRESETS = [
    { name: "(1) Observed flows instead of 1 cfs", type: "reference", v: 1 },
    { name: "(2) 10% less flow", type: "percent", v: -10 },
    { name: "(3) 100 cfs more flow", type: "add", v: 100 },
    { name: "(4) Flows below 100 cfs raised to 100 cfs", type: "floor", v: 100 },
    { name: "(5) 12% less water, every month", type: "climate", v: 12 },
    { name: "(6) 30% less water, every month", type: "climate", v: 30 },
    { name: "(7) 50% less water, every month", type: "climate", v: 50 },
    { name: "(8) 12% less water, weighted to July-October", type: "seasonal", v: 12 },
    { name: "(9) 30% less water, weighted to July-October", type: "seasonal", v: 30 }
  ];

  function describe(sc, raw) {
    switch (sc.type) {
      case "percent": return raw < 0 ? `${-raw}% less water in every reach on every day of 2015 to 2024`
                                     : `${raw}% more water in every reach on every day of 2015 to 2024`;
      case "climate": return `a typical year with ${raw}% less water in every reach and every month`;
      case "seasonal": return `a typical year with ${raw}% less water in every reach, the loss concentrated in July to October`;
      case "add": return `${raw} more cubic feet per second (cfs) in every reach on every day of 2015 to 2024`;
      case "floor": return `a floor of ${raw} cfs in every reach, raising every reach-day below it`;
      case "reference": return `a river carrying ${raw} cfs in every reach`;
    }
  }
  const isClimate = sc => sc.type === "climate" || sc.type === "seasonal";
  /* the period a result covers, for summaries */
  const period = sc => (isClimate(sc) ? "in a typical year" : "per year over 2015 to 2024");

  /* "This is the paper's Scenario (n)" line, empty otherwise. */
  function paperNote(prow) {
    return prow ? `This is the paper's Scenario (${prow}); the numbers here are those in its Tables 2 and 3.` : "";
  }

  /* Out of the range the river or the paper covers. */
  function extrapolated(sc, raw) {
    return (sc.type === "percent" && raw <= -60) || (isClimate(sc) && raw > 50);
  }

  /* Builds the scenario controls inside `box` and calls onChange(sc, raw, final)
     on every move (final=false) and on release (final=true). */
  function scenarioControls(box, onChange, opts) {
    opts = opts || {};
    let type = opts.type || "percent";
    box.innerHTML = `
      <div class="ctl"><label>The paper's nine scenarios</label>
        <div class="presets">${PRESETS.map((p, i) => `<button type="button" data-p="${i}">${p.name}</button>`).join("")}</div></div>
      <div class="ctl"><label>Or build your own</label>
        <div class="seg" role="group" aria-label="Scenario type">
          ${Object.keys(TYPES).map(k => `<button type="button" data-t="${k}">${TYPES[k].btn}</button>`).join("")}
        </div></div>
      <div class="ctl"><label for="sv"><span id="slab"></span><output id="sout"></output></label>
        <input id="sv" type="range">
        <div class="hint" id="shint"></div></div>`;
    const sv = box.querySelector("#sv");
    function mark() {
      const raw = Number(sv.value);
      box.querySelectorAll(".presets button").forEach(b => {
        const p = PRESETS[Number(b.dataset.p)];
        b.setAttribute("aria-pressed", p.type === type && p.v === raw);
      });
    }
    function setType(t, v) {
      type = t;
      const T = TYPES[t];
      box.querySelectorAll(".seg button").forEach(b => b.setAttribute("aria-pressed", b.dataset.t === t));
      sv.min = T.min; sv.max = T.max; sv.step = T.step; sv.value = (v !== undefined ? v : T.def);
      box.querySelector("#slab").textContent = T.label;
      box.querySelector("#shint").textContent = T.hint;
      fire(true);
    }
    function current() {
      const raw = Number(sv.value);
      return { sc: { type, value: TYPES[type].toValue(raw) }, raw };
    }
    function fire(final) {
      const c = current();
      box.querySelector("#sout").textContent = TYPES[type].show(c.raw);
      mark();
      onChange(c.sc, c.raw, final);
    }
    box.querySelectorAll(".seg button").forEach(b => b.addEventListener("click", () => setType(b.dataset.t)));
    box.querySelectorAll(".presets button").forEach(b => b.addEventListener("click", () => {
      const p = PRESETS[Number(b.dataset.p)];
      setType(p.type, p.v);
    }));
    sv.addEventListener("input", () => fire(false));
    sv.addEventListener("change", () => fire(true));
    setType(type, opts.value);
    return {
      current, TYPES,
      reset() { setType(opts.type || "percent", opts.value); },
      grid() {   /* slider values for the response curve */
        const T = TYPES[type], out = [];
        const steps = 40;
        for (let i = 0; i <= steps; i++) out.push(Math.round((T.min + (T.max - T.min) * i / steps) / T.step) * T.step);
        return { type, raw: Array.from(new Set(out)), toValue: T.toValue, show: T.show };
      }
    };
  }

  function debounce(fn, ms) {
    let id = null;
    return function () { const a = arguments; clearTimeout(id); id = setTimeout(() => fn.apply(null, a), ms); };
  }

  /* Number formats follow the paper's Tables 2 and 3: mortality to two
     decimals in a comparison with a nearly dry river (its Panel A) and to
     three otherwise, PM10 to three decimals, and economic damages in
     millions to two decimals. */
  const fmt = {
    deaths: (x, sc) => x.toFixed(sc ? (sc.type === "reference" ? 2 : 3) : (Math.abs(x) >= 10 ? 2 : 3)),
    money: x => {
      const a = Math.abs(x), s = x < 0 ? "−$" : "$";
      if (a >= 1e9) return s + (a / 1e9).toFixed(2) + " billion";
      if (a >= 5e3) return s + (a / 1e6).toFixed(2) + " million";
      return s + Math.round(a).toLocaleString("en-US");
    },
    moneyShort: x => {
      const a = Math.abs(x), s = x < 0 ? "−$" : "$";
      if (a >= 1e6) return s + (a / 1e6).toFixed(a >= 1e8 ? 0 : 1) + "M";
      if (a >= 1e3) return s + (a / 1e3).toFixed(0) + "K";
      return s + a.toFixed(0);
    },
    signed: (x, d) => (x > 0 ? "+" : x < 0 ? "−" : "") + Math.abs(x).toFixed(d === undefined ? 2 : d),
    minus: s => String(s).replace(/^-/, "−")
  };

  /* The volume of water at the Central Avenue gauge that a scenario adds or
     removes, in acre-feet (AF) per year, from RGModel.water(). */
  function sig3(x) {
    const a = Math.abs(x);
    if (a < 1) return a.toFixed(1);
    const d = Math.pow(10, Math.max(0, Math.floor(Math.log10(a)) - 2));
    return (Math.round(a / d) * d).toLocaleString("en-US");
  }
  const AF_NOTE = "One cfs held for a full day is about 1.98 acre-feet. This is the volume at the Central Avenue gauge alone, one of the four reach gauges the scenarios change; releases upstream would need to be somewhat larger, because some water is lost before it reaches Albuquerque.";
  function waterText(sc, w) {
    const a = w.afYr;
    if (sc.type === "reference")
      return `Water at the Central Avenue gauge in Albuquerque: the river as it actually flowed carried about ${sig3(a)} acre-feet (AF) per year more than the comparison river, over 2015 to 2024.`;
    if (w.climate)
      return `Water at the Central Avenue gauge in Albuquerque: about ${sig3(a)} acre-feet (AF) per year less than in a typical year of 2015 to 2024.`;
    if (Math.abs(a) < 0.05) return "Water at the Central Avenue gauge in Albuquerque: this scenario changes no water at that gauge.";
    return a > 0
      ? `Water needed at the Central Avenue gauge in Albuquerque: about ${sig3(a)} acre-feet (AF) per year more than actually flowed over 2015 to 2024.`
      : `Water removed at the Central Avenue gauge in Albuquerque: about ${sig3(a)} acre-feet (AF) per year less than actually flowed over 2015 to 2024.`;
  }

  /* The source line under a 95% interval. */
  function ciSource(ci) {
    return ci.source === "paper" ? "95% CI, as in the paper" : "95% interval";
  }

  root.RGUI = { TYPES, PRESETS, describe, isClimate, period, paperNote, extrapolated, scenarioControls,
                debounce, fmt, sig3, waterText, AF_NOTE, ciSource };
})(window);
