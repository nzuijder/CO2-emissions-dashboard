// Creates two linked views:
// 1. A chart where each country's width represents its population
//    and its height/colour represents emissions per person.
// 2. A panel ranking countries by total emissions, per-person emissions,
//    and population.
const YMAX = 40; // Maximum emissions-per-person value shown on the chart.
const SHORT = {
  // Shorter labels for country names that may not fit in the chart.
  "United States of America": "US",
  "Dem. Rep. Congo": "DR Congo"
};

// Return a shortened country name if one is defined; otherwise use the full name.
const sn = n => SHORT[n] || n;

// State used by the linked views.
const VW = {
  hl: null, // Country currently highlighted, if any.
  lab: {},  // SVG label elements, indexed by country position.
  rect: []  // SVG bar/rectangle elements, indexed by country position.
};

// Linearly interpolate between neighbouring values in array `a`
// for a possibly fractional year index `y`.
const lerp = (a, y) => {
  const f = Math.floor(y); // Index of the earlier year.
  const c = Math.min(a.length - 1, f + 1); // Index of the next year, capped at the final entry.

  // Blend the two values according to the fractional part of `y`.
  return a[f] + (a[c] - a[f]) * (y - f);
};

// Format a number using English-style thousands separators.
// By default, show at most one digit after the decimal point.
const fmt = (x, d = 1) =>
  x.toLocaleString("en", { maximumFractionDigits: d });

// Format a decimal change as a signed percentage.
// For example, 0.12 becomes "+12%" and -0.12 becomes "−12%".
const pct = x =>
  (x >= 0 ? "+" : "−") + fmt(Math.abs(x) * 100, 0) + "%";

// Create an SVG element, set its attributes, and optionally append it to a parent.
const mk = (tag, attrs, parent) => {
  const e = document.createElementNS("http://www.w3.org/2000/svg", tag);

  // Apply each supplied attribute to the new SVG element.
  for (const k in attrs) {
    e.setAttribute(k, attrs[k]);
  }

  // Attach the element to its parent if one was provided.
  if (parent) parent.appendChild(e);
  return e;
};

function initViews() {
  VW.ix = [];

  // Store the indices of countries that have data.
  D.forEach((d, i) => {
    if (d) VW.ix.push(i);
  });

  // Calculate each country's population in millions:
  // total emissions in megatonnes divided by emissions per person in tonnes.
  VW.pop = VW.ix.map(i =>
    D[i].t.map((t, y) => t / Math.max(D[i].p[y], 1e-6))
  );

  // Calculate the total population represented by the countries, for each year.
  VW.tp = Array.from({ length: NY }, (_, y) =>
    VW.pop.reduce((s, a) => s + a[y], 0)
  );

  // Calculate the total emissions of the countries, for each year.
  VW.tt = Array.from({ length: NY }, (_, y) =>
    VW.ix.reduce((s, i) => s + D[i].t[y], 0)
  );

  // Find the SVG chart element and define its dimensions and margins.
  const m = $("mek");
  const W = 900;
  const H = 340;
  const L = 46; // Left margin.
  const T = 18; // Top margin.
  const B = 32; // Bottom margin.
  const ih = H - T - B; // Height of the plot area.

  // Add a group for the chart's horizontal gridlines and y-axis labels.
  mk("g", { id: "mgrid" }, m);

  // Create groups for the country rectangles and their labels.
  const bars = mk("g", {}, m);
  const labs = mk("g", { id: "mlab" }, m);

  // Create the average-value line and its label.
  mk("line", { id: "mavg", class: "avg" }, m);
  mk("text", { id: "mavgt", class: "avgt" }, m);

  // Draw y-axis gridlines and labels at 0, 10, 20, 30, and 40.
  [0, 10, 20, 30, 40].forEach(v => {
    const y = T + ih - v / YMAX * ih; // Convert the value to a chart y-coordinate.

    // Horizontal gridline.
    mk(
      "line",
      { x1: L, x2: W - 10, y1: y, y2: y, class: "gl" },
      $("mgrid")
    );

    // Y-axis tick label.
    const t = mk(
      "text",
      { x: L - 6, y: y + 4, class: "ax", "text-anchor": "end" },
      $("mgrid")
    );

    // Mark the top tick as "40+" to indicate that values can exceed the chart scale.
    t.textContent = v + (v === 40 ? "+" : "");
  });

  // Create a group for x-axis tick marks and labels.
  mk("g", { id: "mx" }, m);

  // Add the x-axis label.
  mk("text", { x: L, y: H - 4, class: "axt" }, m).textContent =
    "Cumulative population (billions)";

  // Add a vertically rotated y-axis label.
  mk('text',{
    x:12,                                   // Position near the left edge of the chart.
    y:T+ih/2,                               // Vertically centre it in the plot area.
    class:'axt',                            // Use the axis-label styling.
    'text-anchor':'middle',                 // Centre the text on its coordinates.
    transform:`rotate(-90 12 ${T+ih/2})`    // Rotate it around its own position.
  },m).textContent='Emissions per person (tonnes)';

  // Create one SVG rectangle for each country.
  VW.ix.forEach((i, k) => {
    VW.rect[k] = mk("rect", { "data-i": i }, bars);
  });

  // Create labels only for countries whose share of world emissions
  // in the final year exceeds 1.2%.
  VW.ix.forEach((i, k) => {
    if (D[i].t[NY - 1] / world[NY - 1] > 0.012) {
      const t = mk("text", { class: "bl" }, labs);
      t.textContent = sn(nm[i]); // Use the shortened name where available.
      VW.lab[k] = t;
    }
  });

  // When the pointer moves over an element with a country data-i attribute,
  // highlight that country across the linked views.
  document.addEventListener("mouseover", e => {
    const el = e.target.closest && e.target.closest("[data-i]");
    setHl(el ? el.dataset.i : null);
  });
}

function setHl(i) {
  // Do nothing if the highlighted country has not changed.
  if (i === VW.hl) return;

  VW.hl = i;
  // Toggle a page-level class that can be used by CSS to dim non-highlighted items.
  document.body.classList.toggle("hl", i !== null);

  // Remove the highlight from all currently highlighted country elements.
  document.querySelectorAll("[data-i].on").forEach(e => {
    e.classList.remove("on");
  });

  // Apply the highlight to every element representing the selected country.
  if (i !== null) {
    document.querySelectorAll(`[data-i="${i}"]`).forEach(e => {
      e.classList.add("on");
    });
  }
}

function renderViews(yf) {
  VW.yf = yf; // Save the current (possibly fractional) year index.
  renderMek(yf); // Update the population-by-emissions chart.
  renderBal(Math.round(yf)); // Update the rankings for the nearest whole year.
}

function renderMek(yf) {
  // Chart dimensions and margins; these match the dimensions set in initViews.
  const W = 900;
  const H = 340;
  const L = 46;
  const R = 10;
  const T = 18;
  const B = 32;
  const iw = W - L - R; // Width of the plot area.
  const ih = H - T - B; // Height of the plot area.
  const tp = lerp(VW.tp, yf); // Interpolated total population for this year.

  // Gather each country's population and per-person emissions for this year,
  // then sort countries from highest to lowest per-person emissions.
  const it = VW.ix
    .map((i, k) => ({
      i,                         // Index into the source country data.
      k,                         // Index into the chart's rectangle/label arrays.
      pop: lerp(VW.pop[k], yf),  // Interpolated population.
      pc: lerp(D[i].p, yf)       // Interpolated emissions per person.
    }))
    .sort((a, b) => b.pc - a.pc);

  // The rectangles are placed side by side along the x-axis.
  let x = L;

  it.forEach(o => {
    // Width represents the country's share of the total population.
    const w = o.pop / tp * iw;

    // Height represents emissions per person, capped at the chart's maximum.
    const h = Math.min(o.pc, YMAX) / YMAX * ih;
    const r = VW.rect[o.k]; // The SVG rectangle for this country.
    const yt = T + ih - h;  // Top y-coordinate of the rectangle.

    // Position and size the rectangle. A tiny minimum width keeps it visible.
    r.setAttribute("x", x.toFixed(2));
    r.setAttribute("y", yt.toFixed(2));
    r.setAttribute("width", Math.max(w, 0.3).toFixed(2));
    r.setAttribute("height", h.toFixed(2));

    // Set the rectangle's colour based on its per-person emissions.
    r.setAttribute("fill", col(o.pc));

    // Update the country label, if this country has one.
    const t = VW.lab[o.k];

    if (t) {
      // Hide labels when the country is too narrow to label legibly.
      if (w < 9) {
        t.style.display = "none";
      } else {
        t.style.display = "";
        const cx = x + w / 2; // Horizontal centre of the country's rectangle.

        // Rotate labels for narrow rectangles; use horizontal labels otherwise.
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

    // Move the starting x-coordinate to the right for the next rectangle.
    x += w;
  });

  // Rebuild the x-axis ticks for the current total population.
  const g = $("mx");
  g.innerHTML = ""; // Remove the previous year's tick marks and labels.

  // Add one tick per billion people, up to the current total population.
  for (let b = 0; b <= Math.floor(tp / 1000); b++) {
    const xx = L + b * 1000 / tp * iw; // Convert billions to a chart x-coordinate.

    // Tick mark below the plot.
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

    // Tick label, with the value in billions.
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
  // Avoid rebuilding the ranking cards if the year has not changed.
  if (VW.balY === y) return;
  VW.balY = y;

  // Gather each country's total emissions, per-person emissions,
  // and population for the selected whole year.
  const a = VW.ix.map((i, k) => ({
    i,
    t: D[i].t[y],
    p: D[i].p[y],
    pop: VW.pop[k][y]
  }));

  // Sort countries by total emissions, per-person emissions, and population.
  const byT = [...a].sort((x, z) => z.t - x.t);
  // Exclude countries with fewer than 10 million people from this ranking.
  const byP = a.filter(o => o.pop >= 10).sort((x, z) => z.p - x.p);
  const byPop = [...a].sort((x, z) => z.pop - x.pop);

  // Build the HTML for one ranking card.
  // Each row carries the country's index in data-i so it can be highlighted.
  const card = (h, sub, rows) =>
    `<div class="card">` +
    `<h4>${h}</h4>` +
    `<p class="cap">${sub}</p>` +
    rows
      .map(
        r =>
          `<div class="cr" data-i="${r[0]}">` +
          `<span>${sn(nm[r[0]])}</span>` + // Country name.
          `<b>${r[1]}</b>` +              // Main value in the ranking.
          `<span class="mu">${r[2]}</span>` + // Supporting description/value.
          "</div>"
      )
      .join("") +
    "</div>";

  // Populate three cards with the top five countries in each ranking.
  $("cards").innerHTML =
    card(
      "Largest total emissions",
      "The usual headline: who emits the most.",
      byT.slice(0, 5).map(o => [
        o.i,
        fmt(o.t / 1000) + " Gt", // Convert megatonnes to gigatonnes.
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
        fmt(o.pop / VW.tp[y] * 100, 0) + "%", // Share of the represented population.
        fmt(o.p) + " t per person"
      ])
    );

  // Find countries that appear in both the top 10 by total emissions
  // and the top 10 by per-person emissions.
  const s1 = new Set(byT.slice(0, 10).map(o => o.i));
  const both = byP
    .slice(0, 10)
    .filter(o => s1.has(o.i))
    .map(o => sn(nm[o.i]));

  // Helper for calculating a value's percentage change from its first-year value.
  const g = q => q[y] / q[0] - 1;

  // Calculate average emissions per person across the represented countries,
  // for every year.
  const pcw = VW.tt.map((t, k) => t / VW.tp[k]);

  // `both`, `g`, and `pcw` are calculated here but are not used later
  // in this function as shown.
  // Reapply the current highlight to the matching row in the ranking cards.
  if (VW.hl !== null) {
    const e = document.querySelector(`#cards [data-i="${VW.hl}"]`);
    if (e) e.classList.add("on");
  }
}