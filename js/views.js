// Linked views: population x per-person chart and a balanced
// two-rankings panel.
const YMAX = 40;
const SHORT = {
  "United States of America": "US",
  "Dem. Rep. Congo": "DR Congo"
};

const sn = n => SHORT[n] || n;

const VW = {
  hl: null,
  lab: {},
  rect: []
};

const lerp = (a, y) => {
  const f = Math.floor(y);
  const c = Math.min(a.length - 1, f + 1);

  return a[f] + (a[c] - a[f]) * (y - f);
};

const fmt = (x, d = 1) =>
  x.toLocaleString("en", { maximumFractionDigits: d });

const pct = x =>
  (x >= 0 ? "+" : "−") + fmt(Math.abs(x) * 100, 0) + "%";

const mk = (tag, attrs, parent) => {
  const e = document.createElementNS("http://www.w3.org/2000/svg", tag);

  for (const k in attrs) {
    e.setAttribute(k, attrs[k]);
  }

  if (parent) parent.appendChild(e);
  return e;
};

function initViews() {
  VW.ix = [];

  D.forEach((d, i) => {
    if (d) VW.ix.push(i);
  });

  // Population in millions = total (Mt) / per person (t)
  VW.pop = VW.ix.map(i =>
    D[i].t.map((t, y) => t / Math.max(D[i].p[y], 1e-6))
  );

  VW.tp = Array.from({ length: NY }, (_, y) =>
    VW.pop.reduce((s, a) => s + a[y], 0)
  );

  VW.tt = Array.from({ length: NY }, (_, y) =>
    VW.ix.reduce((s, i) => s + D[i].t[y], 0)
  );

  const m = $("mek");
  const W = 900;
  const H = 340;
  const L = 46;
  const T = 18;
  const B = 32;
  const ih = H - T - B;

  mk("g", { id: "mgrid" }, m);

  const bars = mk("g", {}, m);
  const labs = mk("g", { id: "mlab" }, m);

  mk("line", { id: "mavg", class: "avg" }, m);
  mk("text", { id: "mavgt", class: "avgt" }, m);

  [0, 10, 20, 30, 40].forEach(v => {
    const y = T + ih - v / YMAX * ih;

    mk(
      "line",
      { x1: L, x2: W - 10, y1: y, y2: y, class: "gl" },
      $("mgrid")
    );

    const t = mk(
      "text",
      { x: L - 6, y: y + 4, class: "ax", "text-anchor": "end" },
      $("mgrid")
    );

    t.textContent = v + (v === 40 ? "+" : "");
  });

  mk("g", { id: "mx" }, m);

  mk("text", { x: L, y: H - 4, class: "axt" }, m).textContent =
    "Cumulative population (billions)";

  mk('text',{
  x:12,                                   // 12px from the left edge of the chart
  y:T+ih/2,                               // vertical middle of the plot area
  class:'axt',                            // same small grey style as the x-axis label
  'text-anchor':'middle',                 // centre the text on that point
  transform:`rotate(-90 12 ${T+ih/2})`    // turn it to read bottom-to-top, rotating around its own position
    },m).textContent='Emissions per person (tonnes)';

  VW.ix.forEach((i, k) => {
    VW.rect[k] = mk("rect", { "data-i": i }, bars);
  });

  VW.ix.forEach((i, k) => {
    if (D[i].t[NY - 1] / world[NY - 1] > 0.012) {
      const t = mk("text", { class: "bl" }, labs);
      t.textContent = sn(nm[i]);
      VW.lab[k] = t;
    }
  });

  document.addEventListener("mouseover", e => {
    const el = e.target.closest && e.target.closest("[data-i]");
    setHl(el ? el.dataset.i : null);
  });
}

function setHl(i) {
  if (i === VW.hl) return;

  VW.hl = i;
  document.body.classList.toggle("hl", i !== null);

  document.querySelectorAll("[data-i].on").forEach(e => {
    e.classList.remove("on");
  });

  if (i !== null) {
    document.querySelectorAll(`[data-i="${i}"]`).forEach(e => {
      e.classList.add("on");
    });
  }
}

function renderViews(yf) {
  VW.yf = yf;
  renderMek(yf);
  renderBal(Math.round(yf));
}

function renderMek(yf) {
  const W = 900;
  const H = 340;
  const L = 46;
  const R = 10;
  const T = 18;
  const B = 32;
  const iw = W - L - R;
  const ih = H - T - B;
  const tp = lerp(VW.tp, yf);

  const it = VW.ix
    .map((i, k) => ({
      i,
      k,
      pop: lerp(VW.pop[k], yf),
      pc: lerp(D[i].p, yf)
    }))
    .sort((a, b) => b.pc - a.pc);

  let x = L;

  it.forEach(o => {
    const w = o.pop / tp * iw;
    const h = Math.min(o.pc, YMAX) / YMAX * ih;
    const r = VW.rect[o.k];
    const yt = T + ih - h;

    r.setAttribute("x", x.toFixed(2));
    r.setAttribute("y", yt.toFixed(2));
    r.setAttribute("width", Math.max(w, 0.3).toFixed(2));
    r.setAttribute("height", h.toFixed(2));
    r.setAttribute("fill", col(o.pc));

    const t = VW.lab[o.k];

    if (t) {
      if (w < 9) {
        t.style.display = "none";
      } else {
        t.style.display = "";
        const cx = x + w / 2;

        if (w < 46) {
          t.setAttribute("x", cx + 3.5);
          t.setAttribute("y", yt - 5);
          t.setAttribute(
            "transform",
            `rotate(-90 ${cx + 3.5} ${yt - 5})`
          );
          t.setAttribute("text-anchor", "start");
        } else {
          t.removeAttribute("transform");
          t.setAttribute("x", cx);
          t.setAttribute("y", yt - 5);
          t.setAttribute("text-anchor", "middle");
        }
      }
    }

    x += w;
  });

  const g = $("mx");
  g.innerHTML = "";

  for (let b = 0; b <= Math.floor(tp / 1000); b++) {
    const xx = L + b * 1000 / tp * iw;

    mk(
      "line",
      {
        x1: xx,
        x2: xx,
        y1: T + ih,
        y2: T + ih + 5,
        class: "gl"
      },
      g
    );

    mk(
      "text",
      {
        x: xx,
        y: T + ih + 18,
        class: "ax",
        "text-anchor": "middle"
      },
      g
    ).textContent = b;
  }
}

function renderBal(y) {
  if (VW.balY === y) return;
  VW.balY = y;

  const a = VW.ix.map((i, k) => ({
    i,
    t: D[i].t[y],
    p: D[i].p[y],
    pop: VW.pop[k][y]
  }));

  const byT = [...a].sort((x, z) => z.t - x.t);
  const byP = a.filter(o => o.pop >= 10).sort((x, z) => z.p - x.p);
  const byPop = [...a].sort((x, z) => z.pop - x.pop);

  const card = (h, sub, rows) =>
    `<div class="card">` +
    `<h4>${h}</h4>` +
    `<p class="cap">${sub}</p>` +
    rows
      .map(
        r =>
          `<div class="cr" data-i="${r[0]}">` +
          `<span>${sn(nm[r[0]])}</span>` +
          `<b>${r[1]}</b>` +
          `<span class="mu">${r[2]}</span>` +
          "</div>"
      )
      .join("") +
    "</div>";

  $("cards").innerHTML =
    card(
      "Largest total emissions",
      "The usual headline: who emits the most.",
      byT.slice(0, 5).map(o => [
        o.i,
        fmt(o.t / 1000) + " Gt",
        fmt(o.t / VW.tt[y] * 100, 0) + "% of world"
      ])
    ) +
    card(
      "Highest emissions per person",
      "Countries with at least 10 million people.",
      byP.slice(0, 5).map(o => [o.i, fmt(o.p) + " t", "per person"])
    ) +
    card(
      "Most people",
      "Where the world’s population lives, and what each person emits.",
      byPop.slice(0, 5).map(o => [
        o.i,
        fmt(o.pop / VW.tp[y] * 100, 0) + "%",
        fmt(o.p) + " t per person"
      ])
    );

  const s1 = new Set(byT.slice(0, 10).map(o => o.i));
  const both = byP
    .slice(0, 10)
    .filter(o => s1.has(o.i))
    .map(o => sn(nm[o.i]));

  const g = q => q[y] / q[0] - 1;
  const pcw = VW.tt.map((t, k) => t / VW.tp[k]);

  if (VW.hl !== null) {
    const e = document.querySelector(`#cards [data-i="${VW.hl}"]`);
    if (e) e.classList.add("on");
  }
}