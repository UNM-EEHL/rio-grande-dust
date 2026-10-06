/* Small SVG charts for the tools, in the project's figure style: quiet serif
   type, two blues and a gray, gridlines on the value axis only, a dashed zero
   line, and every highlighted value labeled. */
(function (root) {
  "use strict";
  const NS = "http://www.w3.org/2000/svg";
  const C = { dark: "#1A4E8A", light: "#8FBEEA", sens: "#6B6B66", track: "#E6E6E4",
              ink: "#1C1A1B", muted: "#5B5658", grid: "#EDEDEA", zero: "#9A9A94",
              accent: "#7B1E2E" };

  function el(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function text(parent, x, y, s, attrs) {
    const t = el("text", Object.assign({ x, y, "font-family": "Lora, Georgia, serif",
      "font-size": 12, fill: C.ink }, attrs || {}), parent);
    t.textContent = s;
    return t;
  }
  function niceTicks(lo, hi, n) {
    if (!(hi > lo)) { hi = lo + 1; }
    const span = hi - lo, step0 = span / (n || 5);
    const mag = Math.pow(10, Math.floor(Math.log10(step0)));
    const err = step0 / mag;
    const step = (err >= 7.5 ? 10 : err >= 3.5 ? 5 : err >= 1.5 ? 2 : 1) * mag;
    const t0 = Math.floor(lo / step) * step, out = [];
    for (let v = t0; v <= hi + step * 0.5; v += step) out.push(+v.toFixed(10));
    return out;
  }

  /* opts: x[], y[], lo[], hi[] (optional band), xlabel, ylabel, fmtX, fmtY,
     marker {x, y, label}, logX */
  function line(container, opts) {
    container.innerHTML = "";
    const W = 720, H = 340, m = { l: 66, r: 20, t: 18, b: 52 };
    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img",
                            "aria-label": opts.aria || "chart" }, container);
    const xs = opts.x, ys = opts.y;
    const fx = opts.logX ? v => Math.log10(v) : v => v;
    const xmin = Math.min(...xs.map(fx)), xmax = Math.max(...xs.map(fx));
    let ylo = Math.min(...ys, ...(opts.lo || ys), 0), yhi = Math.max(...ys, ...(opts.hi || ys), 0);
    const yt = niceTicks(ylo, yhi, 5);
    ylo = Math.min(ylo, yt[0]); yhi = Math.max(yhi, yt[yt.length - 1]);
    const X = v => m.l + (fx(v) - xmin) / (xmax - xmin || 1) * (W - m.l - m.r);
    const Y = v => H - m.b - (v - ylo) / (yhi - ylo || 1) * (H - m.t - m.b);
    yt.forEach(v => {
      el("line", { x1: m.l, x2: W - m.r, y1: Y(v), y2: Y(v), stroke: C.grid, "stroke-width": 1 }, svg);
      text(svg, m.l - 8, Y(v) + 4, (opts.fmtY || String)(v), { "text-anchor": "end", fill: C.muted });
    });
    el("line", { x1: m.l, x2: W - m.r, y1: Y(0), y2: Y(0), stroke: C.zero, "stroke-width": 1,
                 "stroke-dasharray": "4 4" }, svg);
    let xt = opts.xticks;
    if (!xt) xt = opts.logX ? [1, 3, 10, 30, 100, 300, 1000, 3000].filter(v => fx(v) >= xmin - 1e-9 && fx(v) <= xmax + 1e-9)
                            : niceTicks(Math.min(...xs), Math.max(...xs), 6).filter(v => v >= Math.min(...xs) - 1e-9 && v <= Math.max(...xs) + 1e-9);
    xt.forEach(v => {
      el("line", { x1: X(v), x2: X(v), y1: H - m.b, y2: H - m.b + 5, stroke: C.ink }, svg);
      text(svg, X(v), H - m.b + 19, (opts.fmtX || String)(v), { "text-anchor": "middle", fill: C.muted });
    });
    el("line", { x1: m.l, x2: W - m.r, y1: H - m.b, y2: H - m.b, stroke: C.ink, "stroke-width": 0.8 }, svg);
    if (opts.lo && opts.hi) {
      let d = "";
      xs.forEach((v, i) => { d += (i ? "L" : "M") + X(v) + "," + Y(opts.hi[i]); });
      for (let i = xs.length - 1; i >= 0; i--) d += "L" + X(xs[i]) + "," + Y(opts.lo[i]);
      el("path", { d: d + "Z", fill: C.light, "fill-opacity": 0.45, stroke: "none" }, svg);
    }
    let d = "";
    xs.forEach((v, i) => { d += (i ? "L" : "M") + X(v) + "," + Y(ys[i]); });
    el("path", { d, fill: "none", stroke: C.dark, "stroke-width": 2.6, "stroke-linejoin": "round" }, svg);
    if (opts.marker) {
      const mk = opts.marker;
      el("circle", { cx: X(mk.x), cy: Y(mk.y), r: 6.5, fill: C.accent, stroke: "#fff", "stroke-width": 2 }, svg);
      const right = X(mk.x) > W * 0.7;
      text(svg, X(mk.x) + (right ? -10 : 10), Y(mk.y) - 10, mk.label,
           { "text-anchor": right ? "end" : "start", "font-weight": 700, fill: C.accent });
    }
    text(svg, (m.l + W - m.r) / 2, H - 8, opts.xlabel || "", { "text-anchor": "middle", "font-size": 13 });
    const yl = text(svg, 16, (m.t + H - m.b) / 2, opts.ylabel || "", { "text-anchor": "middle", "font-size": 13 });
    yl.setAttribute("transform", `rotate(-90 16 ${(m.t + H - m.b) / 2})`);
    return svg;
  }

  /* opts: labels[], values[], fmt, ylabel, highlight index (optional) */
  function bars(container, opts) {
    container.innerHTML = "";
    const W = 720, H = 300, m = { l: 66, r: 16, t: 26, b: 40 };
    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img",
                            "aria-label": opts.aria || "chart" }, container);
    const v = opts.values;
    let lo = Math.min(0, ...v), hi = Math.max(0, ...v);
    const yt = niceTicks(lo, hi, 5);
    lo = Math.min(lo, yt[0]); hi = Math.max(hi, yt[yt.length - 1]);
    const Y = x => H - m.b - (x - lo) / (hi - lo || 1) * (H - m.t - m.b);
    yt.forEach(t => {
      el("line", { x1: m.l, x2: W - m.r, y1: Y(t), y2: Y(t), stroke: C.grid }, svg);
      text(svg, m.l - 8, Y(t) + 4, (opts.fmtAxis || opts.fmt || String)(t), { "text-anchor": "end", fill: C.muted });
    });
    const n = v.length, slot = (W - m.l - m.r) / n, bw = slot * 0.62;
    v.forEach((x, i) => {
      const x0 = m.l + slot * i + (slot - bw) / 2;
      const y1 = Y(Math.max(0, x)), y2 = Y(Math.min(0, x));
      el("rect", { x: x0, y: y1, width: bw, height: Math.max(1, y2 - y1), fill: C.dark, rx: 2 }, svg);
      text(svg, x0 + bw / 2, (x >= 0 ? y1 - 6 : y2 + 14), (opts.fmt || String)(x),
           { "text-anchor": "middle", "font-size": 11, fill: C.ink });
      text(svg, x0 + bw / 2, H - m.b + 18, opts.labels[i], { "text-anchor": "middle", fill: C.muted });
    });
    el("line", { x1: m.l, x2: W - m.r, y1: Y(0), y2: Y(0), stroke: C.ink, "stroke-width": 0.8 }, svg);
    const yl = text(svg, 16, (m.t + H - m.b) / 2, opts.ylabel || "", { "text-anchor": "middle", "font-size": 13 });
    yl.setAttribute("transform", `rotate(-90 16 ${(m.t + H - m.b) / 2})`);
    return svg;
  }

  root.RGCharts = { line, bars, colors: C };
})(window);
