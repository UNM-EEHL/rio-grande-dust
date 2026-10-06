/* Shared controls for the scenario tools. */
(function (root) {
  "use strict";

  const TYPES = {
    percent: { btn: "Change the flow", label: "Change in flow at the Central Avenue gauge",
               min: -90, max: 100, step: 1, def: -10, toValue: v => v / 100,
               show: v => (v > 0 ? "+" : "") + v + "%",
               hint: "A proportional change to the flow the Central Avenue gauge in Albuquerque actually recorded on each day of 2015 to 2024. The rest of the river moves in the same proportion." },
    seasonal: { btn: "Dry-season cut", label: "Annual cut, concentrated in July to October",
                min: 2, max: 60, step: 1, def: 30, toValue: v => v / 100,
                show: v => v + "% a year",
                hint: "The same annual loss of water at the Central Avenue gauge in Albuquerque, taken one and a half times as hard in July to October, the way the climate literature expects the loss to fall. The rest of the river moves in the same proportion." },
    add: { btn: "Add water", label: "Water added at the Central Avenue gauge",
           min: 10, max: 500, step: 10, def: 100, toValue: v => v,
           show: v => "+" + v + " cfs",
           hint: "A fixed amount of extra flow at the Central Avenue gauge in Albuquerque, in cubic feet per second (cfs), every day. The rest of the river rises in the same proportion that day." },
    floor: { btn: "Low-flow floor", label: "Minimum flow at the Central Avenue gauge",
             min: 10, max: 300, step: 5, def: 100, toValue: v => v,
             show: v => v + " cfs",
             hint: "Every day the Central Avenue gauge in Albuquerque reads below this flow is raised to it, and the rest of the river rises in the same proportion; days above it are left alone. The 2003 biological opinion required 100 cfs at the Central Avenue gauge in Albuquerque until 2016." },
    reference: { btn: "Versus a dry river", label: "Flow at the Central Avenue gauge in the comparison",
                 min: 1, max: 100, step: 1, def: 1, toValue: v => v,
                 show: v => v + " cfs",
                 hint: "The damages the river as it actually flowed avoids, compared with a river carrying only this much at the Central Avenue gauge in Albuquerque, with the rest of the river in the same proportion. 1 cfs is essentially dry." }
  };

  const PRESETS = [
    { name: "10% less water", type: "percent", v: -10 },
    { name: "Restore the 100 cfs floor", type: "floor", v: 100 },
    { name: "Climate C1: 12% less", type: "percent", v: -12 },
    { name: "Climate C2: 30% less", type: "percent", v: -30 },
    { name: "Climate C3: 50% less", type: "percent", v: -50 },
    { name: "Climate C5: 30%, dry season", type: "seasonal", v: 30 },
    { name: "The river versus a dry river", type: "reference", v: 1 }
  ];

  function describe(sc, raw) {
    switch (sc.type) {
      case "percent": return raw < 0 ? `${-raw}% less water at the Central Avenue gauge in Albuquerque on every day of 2015 to 2024`
                                     : `${raw}% more water at the Central Avenue gauge in Albuquerque on every day of 2015 to 2024`;
      case "seasonal": return `a ${raw}% annual loss of water at the Central Avenue gauge in Albuquerque, concentrated in July to October`;
      case "add": return `${raw} more cubic feet per second (cfs) at the Central Avenue gauge in Albuquerque every day`;
      case "floor": return `a floor of ${raw} cfs at the Central Avenue gauge in Albuquerque`;
      case "reference": return `the river as it actually flowed, compared with a river carrying ${raw} cfs at the Central Avenue gauge in Albuquerque`;
    }
  }

  /* Builds the scenario controls inside `box` and calls onChange(sc, raw, final)
     on every move (final=false) and on release (final=true). */
  function scenarioControls(box, onChange, opts) {
    opts = opts || {};
    let type = opts.type || "percent";
    box.innerHTML = `
      <div class="ctl"><label>Scenario</label>
        <div class="seg" role="group" aria-label="Scenario type">
          ${Object.keys(TYPES).map(k => `<button type="button" data-t="${k}">${TYPES[k].btn}</button>`).join("")}
        </div></div>
      <div class="ctl"><label for="sv"><span id="slab"></span><output id="sout"></output></label>
        <input id="sv" type="range">
        <div class="hint" id="shint"></div></div>
      <div class="ctl"><label>Quick scenarios</label>
        <div class="presets">${PRESETS.map((p, i) => `<button type="button" data-p="${i}">${p.name}</button>`).join("")}</div></div>`;
    const sv = box.querySelector("#sv");
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

  const fmt = {
    deaths: x => (Math.abs(x) >= 10 ? x.toFixed(1) : Math.abs(x) >= 1 ? x.toFixed(2) : x.toFixed(3)),
    money: x => {
      const a = Math.abs(x), s = x < 0 ? "−$" : "$";
      if (a >= 1e9) return s + (a / 1e9).toFixed(2) + " billion";
      if (a >= 1e6) return s + (a / 1e6).toFixed(1) + " million";
      if (a >= 1e3) return s + Math.round(a / 1e3).toLocaleString("en-US") + ",000";
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

  root.RGUI = { TYPES, PRESETS, describe, scenarioControls, debounce, fmt };
})(window);
