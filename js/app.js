// First and last years in the dataset, inclusive.
const Y0 = 1990;
const Y1 = 2024;
const NY = Y1 - Y0 + 1; // Number of years.

// Shorthand for finding an element by its HTML id.
const $ = id => document.getElementById(id);

// Collect the geographic helper functions in one object.
const E = {
  buildGeo,
  iterate,
  markUsed,
  polyStats,
  pathFor
};

// Build the map geometry from the TopoJSON data.
const G = E.buildGeo(DATA.topo);

// Record which coordinate points are actually used by country boundaries.
// The cartogram iteration uses this list to avoid updating unused points.
E.markUsed(G);

// Group polygon parts by country so each country's SVG path
// can be generated separately.
G.byC = G.countries.map(() => []);
G.parts.forEach(p => G.byC[p.c].push(p));

// Country metadata, names, and emissions data in matching order.
const C = G.countries;
const nm = C.map(c => c.name);
const D = nm.map(n => DATA.data[n] || null); // Null when no country data is available.

// Emissions-per-person colour bands: upper limit, colour, and legend text.
const BINS = [
  [2, "#fbe7c3", "under 2"],
  [4, "#f5bc78", "2 to 4"],
  [8, "#ec8650", "4 to 8"],
  [15, "#c9452f", "8 to 15"],
  [1e9, "#7f1220", "over 15"]
];

// Return the colour for a per-person emissions value.
const col = p => {
  for (const b of BINS) {
    if (p < b[0]) return b[1];
  }
};

// Build the target value for each country for year index `yi`.
// Countries with data use total emissions, with a minimum of 0.3.
// Countries without data receive a fallback value of 3.
const V = yi =>
  Float64Array.from(D.map(d => (d ? Math.max(d.t[yi], 0.3) : 3)));

const NS = "http://www.w3.org/2000/svg"; // SVG namespace.
const svg = $("map"); // The SVG element that contains the map.
const paths = []; // Country SVG paths, in country-index order.
const labels = []; // Country-name SVG text elements currently on the map.

// Create one SVG path for each country.
// The data-i attribute links map features to their country index.
C.forEach((c, i) => {
  const p = document.createElementNS(NS, "path");
  p.dataset.i = i;
  svg.appendChild(p);
  paths.push(p);
});

// Build the legend from the colour bands and add the no-data swatch.
const lg = $("legend");
lg.innerHTML =
  "<strong>Tonnes CO₂e per person</strong>" +
  BINS.map(
    b => `<div><i style="background:${b[1]}"></i>${b[2]}</div>`
  ).join("") +
  '<div><i style="background:var(--nodata)"></i>no data</div>';

// Add labels to the timeline for selected years.
$("ticks").innerHTML = [1990, 1995, 2000, 2005, 2010, 2015, 2020, 2024]
  .map(y => `<span>${y}</span>`)
  .join("");

// World and population-related statistics.
const world = DATA.world; // World total emissions by year.
const pop = []; // Estimated population represented by the country dataset, by year.

for (let y = 0; y < NY; y++) {
  let t = 0;  // Sum of country emissions in the dataset for this year.
  let pp = 0; // Sum of estimated country populations for this year.

  D.forEach(d => {
    if (d) {
      t += d.t[y];

      // Estimate a country's population as total emissions divided by
      // emissions per person. The small denominator floor avoids division by zero.
      pp += d.t[y] / Math.max(d.p[y], 1e-6);
    }
  });

  // Estimate average world emissions per person as world emissions
  // divided by the population represented by countries with data.
  pop.push(t / pp);
}

// Find the indices of China and the United States in the country list.
const idx = n => nm.indexOf(n);
const CN = idx("China");
const US = idx("United States of America");

// Find the first year in which China's total emissions exceed those
// of the United States. The value is a year index, not a calendar year.
let cross = 0;

for (let y = 0; y < NY; y++) {
  if (D[CN].t[y] > D[US].t[y]) {
    cross = y;
    break;
  }
}

// Number-formatting helpers: one decimal place, or a rounded whole number.
const f1 = x => x.toLocaleString("en", { maximumFractionDigits: 1 });
const f0 = x => Math.round(x).toLocaleString("en");

function lede(y) {
  // Find the three countries with the highest total emissions in year `y`.
  const o = C
    .map((_, i) => i)
    .filter(i => D[i])
    .sort((a, b) => D[b].t[y] - D[a].t[y])
    .slice(0, 3);

  const w = world[y]; // World emissions for this year.

  // Combined share of world emissions from the top three countries.
  const sh = o.reduce((s, i) => s + D[i].t[y], 0) / w * 100;

  // Count countries with per-person emissions above 15 tonnes.
  const hi = D.filter(d => d && d.p[y] > 15).length;

  // Format country names and per-person emissions for the text.
  const n = i =>
    nm[i].replace("United States of America", "the United States");
  const pc = i => f1(D[i].p[y]);

  // Update the introductory text with statistics for the selected year.
  $("lede").innerHTML =
    `In <b>${Y0 + y}</b> the world emitted ` +
    `<b>${f1(w / 1000)} Gt CO₂e</b>, ± ` +
    `<b>${f1(pop[y])} t per person</b>. ` +
    `${n(o[0])[0].toUpperCase() + n(o[0]).slice(1)}, ` +
    `${n(o[1])} and ${n(o[2])} produced ${f0(sh)}% of it, ` +
    `at ${pc(o[0])}, ${pc(o[1])} and ${pc(o[2])} t per person. ` +
    `${hi} countries emit more than 15 t per person.`;
}

// Set up and render the linked charts described in the earlier code.
initViews();
renderViews(0);

// Store one cartogram coordinate snapshot for every year.
const snaps = new Array(NY);

// Working coordinates used to draw and animate the map.
const cur = new Float64Array(G.P.length);

let yi = 0;   // Year index associated with the currently drawn geometry.
let want = 0; // Year index the user has selected.
let tween = 0; // Incremented to cancel an in-progress geometry animation.

const rd = y => {
  // Update every country's SVG path from the current coordinates.
  paths.forEach((p, i) => p.setAttribute("d", E.pathFor(cur, i, G)));

  // Redraw labels at their updated locations.
  drawLabels(y);
};

function drawLabels(y) {
  // Remove old country labels before creating labels for the new geometry.
  labels.forEach(l => l.remove());
  labels.length = 0;

  // For each country, find the largest polygon part and calculate its
  // area and centroid. The argument `y` is not used inside this function.
  const ar = C.map((_, i) => {
    let b = null;

    G.byC[i].forEach(p => {
      const s = E.polyStats(cur, p.rings[0]);
      if (!b || s.A > b.A) b = s;
    });

    return b;
  });

  // Sum the areas of the selected largest parts.
  const tot = ar.reduce((s, a) => s + (a ? a.A : 0), 0);

  // Add labels for countries that have data and whose selected polygon
  // part occupies more than 1.1% of this summed area.
  ar
    .map((a, i) => [a, i])
    .filter(([a, i]) => a && D[i] && a.A / tot > 0.011)
    .forEach(([a, i]) => {
      const t = document.createElementNS(NS, "text");

      // Shorten selected country names for display.
      t.textContent = nm[i]
        .replace("United States of America", "United States")
        .replace("Dem. Rep. Congo", "DR Congo");

      // Place the label near the polygon's centroid.
      t.setAttribute("x", a.cx);
      t.setAttribute("y", a.cy + 0.012);

      // Scale label size with polygon area, within minimum and maximum limits.
      t.setAttribute(
        "font-size",
        Math.max(0.04, Math.min(0.1, Math.sqrt(a.A) * 0.2))
      );

      svg.appendChild(t);
      labels.push(t);
    });
}

function paint(y) {
  // Colour countries by their per-person emissions for year `y`.
  // Countries without data receive the configured no-data colour.
  paths.forEach((p, i) => {
    p.setAttribute("fill", D[i] ? col(D[i].p[y]) : "var(--nodata)");
  });

  // Refresh the introductory text, displayed year, and slider value.
  lede(y);
  $("year").textContent = Y0 + y;
  $("rng").value = Y0 + y;
}

// State for animating the linked charts as the selected year changes.
let yfl = 0;    // Current fractional year used by the linked charts.
let vtween = 0; // Incremented to cancel an earlier linked-chart animation.

function tweenViews(y) {
  const y0 = yfl; // Starting fractional year.
  const t0 = performance.now(); // Animation start time.
  const id = ++vtween; // Token identifying this animation.
  const dur = matchMedia("(prefers-reduced-motion:reduce)").matches ? 0 : 550;

  const st = now => {
    // Stop if another animation has started since this one.
    if (id !== vtween) return;

    // Progress from 0 to 1, or immediately to 1 when animation is disabled.
    const k = dur ? Math.min(1, (now - t0) / dur) : 1;

    // Ease in and out so the interpolation starts and ends smoothly.
    const e =
      k < 0.5
        ? 2 * k * k
        : 1 - Math.pow(-2 * k + 2, 2) / 2;

    // Move the linked charts gradually between the two year indices.
    yfl = y0 + (y - y0) * e;
    renderViews(yfl);

    // Continue animating until the target year is reached.
    if (k < 1) requestAnimationFrame(st);
  };

  requestAnimationFrame(st);
}

function show(y, instant) {
  want = y; // Record the year requested by the user.

  // Update the map colours/text and animate the linked charts.
  paint(y);
  tweenViews(y);

  // If this year's cartogram has not been computed yet, mark the source
  // element as waiting and leave the current map geometry in place.
  if (!snaps[y]) {
    $("src").dataset.wait = 1;
    return;
  }

  // Save current coordinates and get the target year's coordinates.
  const from = Float64Array.from(cur);
  const to = snaps[y];
  const t0 = performance.now();
  const id = ++tween; // Token used to cancel any previous map animation.

  // Skip geometry animation if requested or if reduced motion is preferred.
  const dur =
    instant || matchMedia("(prefers-reduced-motion:reduce)").matches
      ? 0
      : 550;

  const step = now => {
    // Stop if another geometry animation has started.
    if (id !== tween) return;

    const k = dur ? Math.min(1, (now - t0) / dur) : 1;

    // Use the same ease-in/ease-out curve as the linked-chart animation.
    const e =
      k < 0.5
        ? 2 * k * k
        : 1 - Math.pow(-2 * k + 2, 2) / 2;

    // Interpolate every coordinate between the current and target snapshots.
    for (let i = 0; i < cur.length; i++) {
      cur[i] = from[i] + (to[i] - from[i]) * e;
    }

    // Redraw the map and record the year used for its geometry.
    rd(y);
    yi = y;

    if (k < 1) requestAnimationFrame(step);
  };

  requestAnimationFrame(step);
}

// Compute the Dougenik rubber-sheet cartogram one year at a time.
// Each year's computation starts from the previous year's geometry,
// and is divided into small batches to keep the page responsive.
let ready = 0; // Number of years whose geometry has been computed.
const status = $("status"); // Element used to display computation progress.

function compute(y, k) {
  const Vy = V(y); // Target country values for this year.

  // Use more iterations for the initial map; fewer for later years,
  // which start from the previous year's already-adjusted geometry.
  const n = y ? 3 : 26;

  const go = () => {
    // Run at most four iterations in this batch.
    const m = Math.min(k + 4, n);

    for (; k < m; k++) {
      E.iterate(G, Vy); // Adjust the geometry toward this year's target values.
    }

    // Yield to the browser before continuing if more iterations remain.
    if (k < n) {
      setTimeout(go, 0);
      return;
    }

    // Save a copy of the final geometry for this year.
    snaps[y] = Float64Array.from(G.P);
    ready++;

    // Update or clear the progress message.
    status.textContent =
      ready < NY
        ? `Shaping the map… ${ready} of ${NY} years ready`
        : "";

    if (y === 0) {
      // Initialize the displayed map from the first year's snapshot.
      cur.set(snaps[0]);
      rd(0);
      paint(0);
      yi = 0;
    } else if (y === want) {
      // If this newly computed year is the one the user is waiting for,
      // show it now.
      show(y);
    }

    // Start computing the next year after yielding to the browser.
    if (y + 1 < NY) {
      setTimeout(() => compute(y + 1, 0), 0);
    }
  };

  go();
}

// Show a status message, then start computing the first year's cartogram.
status.textContent = "Shaping the map…";
setTimeout(() => compute(0, 0), 30);

// Slider control: convert the selected calendar year to a zero-based index.
$("rng").addEventListener("input", e => show(+e.target.value - Y0));

let timer = 0; // Interval handle for the play control.

const stop = () => {
  // Stop the playback interval and restore the play icon.
  clearInterval(timer);
  timer = 0;
  $("play").textContent = "▶";
};

$("play").onclick = () => {
  // If playback is already running, stop it.
  if (timer) return stop();

  // Restart from the beginning if the final year is already selected.
  if (want >= NY - 1) show(0);

  $("play").textContent = "❚❚";

  // Advance one year at each interval, but only when its snapshot is ready.
  timer = setInterval(() => {
    const n = want + 1;

    if (n >= NY) return stop();
    if (snaps[n]) show(n);
  }, 900);
};

// Create shortcut buttons for selected years and events.
[
  [0, "1990"],
  [cross, `${Y0 + cross}: China passes the US`],
  [2020 - Y0, "2020: pandemic dip"],
  [NY - 1, "2024: latest"]
].forEach(([y, t]) => {
  const b = document.createElement("button");
  b.textContent = t;

  // Stop playback before jumping to the selected year.
  b.onclick = () => {
    stop();
    show(y);
  };

  $("ch").appendChild(b);
});

// Tooltip element used when hovering over a country.
const tip = $("tip");

document.addEventListener("mousemove", e => {
  // Find the nearest hovered element carrying a country index.
  const el = e.target.closest && e.target.closest("[data-i]");
  const i = el ? el.dataset.i : undefined;

  // Hide the tooltip when the pointer is not over a country element.
  if (i === undefined) {
    tip.style.opacity = 0;
    return;
  }

  const d = D[i];
  const y = want; // Use the currently requested year in the tooltip.

  // Show available emissions statistics, or a no-data message.
  tip.innerHTML = d
    ? `<b>${nm[i].replace("United States of America", "United States")}</b> ` +
      `<span>${Y0 + y}</span><br>` +
      `${f0(d.t[y])} Mt CO₂e in total<br>` +
      `<b>${f1(d.p[y])}</b> t per person<br>` +
      `<span>${f1(d.t[y] / world[y] * 100)}% of world emissions</span>`
    : `<b>${nm[i]}</b><br><span>No data in EDGAR</span>`;

  // Show the tooltip near the pointer, keeping it from extending
  // too far past the right edge of the window.
  tip.style.opacity = 1;
  tip.style.left = Math.min(e.clientX + 14, innerWidth - 200) + "px";
  tip.style.top = e.clientY + 14 + "px";
});

// Hide the tooltip when the pointer leaves the map SVG.
svg.addEventListener("mouseleave", () => {
  tip.style.opacity = 0;
});