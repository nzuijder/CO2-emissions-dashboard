const Y0 = 1990;
const Y1 = 2024;
const NY = Y1 - Y0 + 1;
const $ = id => document.getElementById(id);

const E = {
  buildGeo,
  iterate,
  markUsed,
  polyStats,
  pathFor
};

const G = E.buildGeo(DATA.topo);
E.markUsed(G);
G.byC = G.countries.map(() => []);
G.parts.forEach(p => G.byC[p.c].push(p));

const C = G.countries;
const nm = C.map(c => c.name);
const D = nm.map(n => DATA.data[n] || null);

const BINS = [
  [2, "#fbe7c3", "under 2"],
  [4, "#f5bc78", "2 to 4"],
  [8, "#ec8650", "4 to 8"],
  [15, "#c9452f", "8 to 15"],
  [1e9, "#7f1220", "over 15"]
];

const col = p => {
  for (const b of BINS) {
    if (p < b[0]) return b[1];
  }
};

const V = yi =>
  Float64Array.from(D.map(d => (d ? Math.max(d.t[yi], 0.3) : 3)));

const NS = "http://www.w3.org/2000/svg";
const svg = $("map");
const paths = [];
const labels = [];

C.forEach((c, i) => {
  const p = document.createElementNS(NS, "path");
  p.dataset.i = i;
  svg.appendChild(p);
  paths.push(p);
});

const lg = $("legend");
lg.innerHTML =
  "<strong>Tonnes CO₂e per person</strong>" +
  BINS.map(
    b => `<div><i style="background:${b[1]}"></i>${b[2]}</div>`
  ).join("") +
  '<div><i style="background:var(--nodata)"></i>no data</div>';

$("ticks").innerHTML = [1990, 1995, 2000, 2005, 2010, 2015, 2020, 2024]
  .map(y => `<span>${y}</span>`)
  .join("");

// World stats
const world = DATA.world;
const pop = [];

for (let y = 0; y < NY; y++) {
  let t = 0;
  let pp = 0;

  D.forEach(d => {
    if (d) {
      t += d.t[y];
      pp += d.t[y] / Math.max(d.p[y], 1e-6);
    }
  });

  pop.push(t / pp);
}

const idx = n => nm.indexOf(n);
const CN = idx("China");
const US = idx("United States of America");

let cross = 0;

for (let y = 0; y < NY; y++) {
  if (D[CN].t[y] > D[US].t[y]) {
    cross = y;
    break;
  }
}

const f1 = x => x.toLocaleString("en", { maximumFractionDigits: 1 });
const f0 = x => Math.round(x).toLocaleString("en");

function lede(y) {
  const o = C
    .map((_, i) => i)
    .filter(i => D[i])
    .sort((a, b) => D[b].t[y] - D[a].t[y])
    .slice(0, 3);

  const w = world[y];
  const sh = o.reduce((s, i) => s + D[i].t[y], 0) / w * 100;
  const hi = D.filter(d => d && d.p[y] > 15).length;

  const n = i =>
    nm[i].replace("United States of America", "the United States");
  const pc = i => f1(D[i].p[y]);

  $("lede").innerHTML =
    `In <b>${Y0 + y}</b> the world emitted ` +
    `<b>${f1(w / 1000)} Gt CO₂e</b>, ± ` +
    `<b>${f1(pop[y])} t per person</b>. ` +
    `${n(o[0])[0].toUpperCase() + n(o[0]).slice(1)}, ` +
    `${n(o[1])} and ${n(o[2])} produced ${f0(sh)}% of it, ` +
    `at ${pc(o[0])}, ${pc(o[1])} and ${pc(o[2])} t per person. ` +
    `${hi} countries emit more than 15 t per person.`;
}

initViews();
renderViews(0);

// Geometry snapshots
const snaps = new Array(NY);
const cur = new Float64Array(G.P.length);
let yi = 0;
let want = 0;
let tween = 0;

const rd = y => {
  paths.forEach((p, i) => p.setAttribute("d", E.pathFor(cur, i, G)));
  drawLabels(y);
};

function drawLabels(y) {
  labels.forEach(l => l.remove());
  labels.length = 0;

  const ar = C.map((_, i) => {
    let b = null;

    G.byC[i].forEach(p => {
      const s = E.polyStats(cur, p.rings[0]);
      if (!b || s.A > b.A) b = s;
    });

    return b;
  });

  const tot = ar.reduce((s, a) => s + (a ? a.A : 0), 0);

  ar
    .map((a, i) => [a, i])
    .filter(([a, i]) => a && D[i] && a.A / tot > 0.011)
    .forEach(([a, i]) => {
      const t = document.createElementNS(NS, "text");

      t.textContent = nm[i]
        .replace("United States of America", "United States")
        .replace("Dem. Rep. Congo", "DR Congo");

      t.setAttribute("x", a.cx);
      t.setAttribute("y", a.cy + 0.012);
      t.setAttribute(
        "font-size",
        Math.max(0.04, Math.min(0.1, Math.sqrt(a.A) * 0.2))
      );

      svg.appendChild(t);
      labels.push(t);
    });
}

function paint(y) {
  paths.forEach((p, i) => {
    p.setAttribute("fill", D[i] ? col(D[i].p[y]) : "var(--nodata)");
  });

  lede(y);
  $("year").textContent = Y0 + y;
  $("rng").value = Y0 + y;
}

let yfl = 0;
let vtween = 0;

function tweenViews(y) {
  const y0 = yfl;
  const t0 = performance.now();
  const id = ++vtween;
  const dur = matchMedia("(prefers-reduced-motion:reduce)").matches ? 0 : 550;

  const st = now => {
    if (id !== vtween) return;

    const k = dur ? Math.min(1, (now - t0) / dur) : 1;
    const e =
      k < 0.5
        ? 2 * k * k
        : 1 - Math.pow(-2 * k + 2, 2) / 2;

    yfl = y0 + (y - y0) * e;
    renderViews(yfl);

    if (k < 1) requestAnimationFrame(st);
  };

  requestAnimationFrame(st);
}

function show(y, instant) {
  want = y;
  paint(y);
  tweenViews(y);

  if (!snaps[y]) {
    $("src").dataset.wait = 1;
    return;
  }

  const from = Float64Array.from(cur);
  const to = snaps[y];
  const t0 = performance.now();
  const id = ++tween;
  const dur =
    instant || matchMedia("(prefers-reduced-motion:reduce)").matches
      ? 0
      : 550;

  const step = now => {
    if (id !== tween) return;

    const k = dur ? Math.min(1, (now - t0) / dur) : 1;
    const e =
      k < 0.5
        ? 2 * k * k
        : 1 - Math.pow(-2 * k + 2, 2) / 2;

    for (let i = 0; i < cur.length; i++) {
      cur[i] = from[i] + (to[i] - from[i]) * e;
    }

    rd(y);
    yi = y;

    if (k < 1) requestAnimationFrame(step);
  };

  requestAnimationFrame(step);
}

// Dougenik rubber-sheet cartogram, warm-started year to year,
// computed in small slices so the page stays responsive
let ready = 0;
const status = $("status");

function compute(y, k) {
  const Vy = V(y);
  const n = y ? 3 : 26;

  const go = () => {
    const m = Math.min(k + 4, n);

    for (; k < m; k++) {
      E.iterate(G, Vy);
    }

    if (k < n) {
      setTimeout(go, 0);
      return;
    }

    snaps[y] = Float64Array.from(G.P);
    ready++;

    status.textContent =
      ready < NY
        ? `Shaping the map… ${ready} of ${NY} years ready`
        : "";

    if (y === 0) {
      cur.set(snaps[0]);
      rd(0);
      paint(0);
      yi = 0;
    } else if (y === want) {
      show(y);
    }

    if (y + 1 < NY) {
      setTimeout(() => compute(y + 1, 0), 0);
    }
  };

  go();
}

status.textContent = "Shaping the map…";
setTimeout(() => compute(0, 0), 30);

// Controls
$("rng").addEventListener("input", e => show(+e.target.value - Y0));

let timer = 0;

const stop = () => {
  clearInterval(timer);
  timer = 0;
  $("play").textContent = "▶";
};

$("play").onclick = () => {
  if (timer) return stop();
  if (want >= NY - 1) show(0);

  $("play").textContent = "❚❚";

  timer = setInterval(() => {
    const n = want + 1;

    if (n >= NY) return stop();
    if (snaps[n]) show(n);
  }, 900);
};

[
  [0, "1990"],
  [cross, `${Y0 + cross}: China passes the US`],
  [2020 - Y0, "2020: pandemic dip"],
  [NY - 1, "2024: latest"]
].forEach(([y, t]) => {
  const b = document.createElement("button");
  b.textContent = t;
  b.onclick = () => {
    stop();
    show(y);
  };
  $("ch").appendChild(b);
});

// Tooltip
const tip = $("tip");

document.addEventListener("mousemove", e => {
  const el = e.target.closest && e.target.closest("[data-i]");
  const i = el ? el.dataset.i : undefined;

  if (i === undefined) {
    tip.style.opacity = 0;
    return;
  }

  const d = D[i];
  const y = want;

  tip.innerHTML = d
    ? `<b>${nm[i].replace("United States of America", "United States")}</b> ` +
      `<span>${Y0 + y}</span><br>` +
      `${f0(d.t[y])} Mt CO₂e in total<br>` +
      `<b>${f1(d.p[y])}</b> t per person<br>` +
      `<span>${f1(d.t[y] / world[y] * 100)}% of world emissions</span>`
    : `<b>${nm[i]}</b><br><span>No data in EDGAR</span>`;

  tip.style.opacity = 1;
  tip.style.left = Math.min(e.clientX + 14, innerWidth - 200) + "px";
  tip.style.top = e.clientY + 14 + "px";
});

svg.addEventListener("mouseleave", () => {
  tip.style.opacity = 0;
});