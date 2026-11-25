function proj(lon, lat) {
  // Convert longitude and latitude from degrees to radians.
  const l = lon * Math.PI / 180;
  const f = lat * Math.PI / 180;

  // Precompute powers of latitude used in the projection formulas.
  const f2 = f * f;
  const f4 = f2 * f2;

  // Return projected [x, y] coordinates.
  // The polynomial expressions define the map projection.
  return [
    l * (
      0.8707 -
      0.131979 * f2 +
      f4 * (-0.013791 + f4 * (0.003971 * f2 - 0.001529 * f4))
    ),
    -f * (
      1.007226 +
      f2 * (0.015085 + f4 * (-0.044475 + 0.028874 * f2 - 0.005916 * f4))
    )
  ];
}

function buildGeo(topo) {
  // TopoJSON stores coordinates in a scaled, translated integer grid.
  // Read the scale and translation needed to recover coordinates.
  const [sx, sy] = topo.transform.scale;
  const [tx, ty] = topo.transform.translate;

  const off = []; // Starting vertex index of each decoded arc.
  const pts = []; // Flat array of projected coordinates: [x0, y0, x1, y1, ...].
  let n = 0;      // Number of decoded points.

  // Decode each TopoJSON arc and project its points.
  topo.arcs.forEach(a => {
    let x = 0;
    let y = 0;

    // Record where this arc starts in the flattened point array.
    off.push(n);

    a.forEach(q => {
      // TopoJSON arc coordinates are delta-encoded, so accumulate them.
      x += q[0];
      y += q[1];

      // Restore geographic coordinates, project them, and store the result.
      const r = proj(x * sx + tx, y * sy + ty);
      pts.push(r[0], r[1]);
      n++;
    });
  });

  // Add the end index for the final arc. Each arc's point range is
  // off[arcIndex] through off[arcIndex + 1] - 1.
  off.push(n);

  // Return true when two projected points are far apart horizontally.
  // This is used to detect a boundary crossing the antimeridian.
  const jump = (a, b) => Math.abs(pts[2 * a] - pts[2 * b]) > 3;

  // Convert a TopoJSON ring (a sequence of arc references) into one
  // or more arrays of point indices.
  const ring = r => {
    const o = []; // Point indices making up the stitched ring.

    r.forEach(i => {
      // A negative arc reference means the arc is traversed backwards.
      // Bitwise complement (~) recovers its actual arc index.
      const rev = i < 0;
      const a = rev ? ~i : i;
      const s = off[a];     // First point in the referenced arc.
      const e = off[a + 1]; // One past the final point in the arc.
      const seg = [];

      // Collect the point indices belonging to this arc.
      for (let k = s; k < e; k++) {
        seg.push(k);
      }

      // Reverse the arc if the TopoJSON reference specifies reverse order.
      if (rev) seg.reverse();

      // Adjacent arcs share an endpoint; omit the repeated first point
      // when appending later arcs.
      if (o.length) seg.shift();
      o.push(...seg);
    });

    // Find places where the ring jumps across the antimeridian.
    const cuts = [];

    for (let i = 1; i < o.length; i++) {
      if (jump(o[i], o[i - 1])) cuts.push(i);
    }

    // If there are no antimeridian crossings, return the ring as one array.
    if (!cuts.length) {
      return [Int32Array.from(o)];
    }

    // Split the ring at each detected jump.
    const segs = [];
    let st = 0;

    cuts.forEach(c => {
      segs.push(o.slice(st, c));
      st = c;
    });

    // Join the final piece back to the first piece so the split ring
    // follows the original ring across the map boundary.
    const last = o.slice(st, o.length - 1);
    const first = segs.shift();
    segs.push(last.concat(first));

    // Discard fragments that are too short to form a ring, then convert
    // each remaining fragment to a compact integer array.
    return segs
      .filter(q => q.length > 2)
      .map(q => Int32Array.from(q));
  };

  const countries = []; // Country metadata, indexed by country number.
  const parts = [];     // Polygon parts, each associated with a country.

  // Process each country's TopoJSON geometry.
  topo.objects.countries.geometries.forEach((g, ci) => {
    // A Polygon contains one list of rings; a MultiPolygon contains
    // multiple such lists. Normalize both to an array of polygons.
    const polys = g.type === "Polygon" ? [g.arcs] : g.arcs;

    // Store the country name. The geometry's property `n` supplies it.
    countries.push({ name: g.n });

    polys.forEach(pl => {
      // Convert every ring in this polygon into point-index arrays.
      // The first ring is the exterior boundary; later rings are holes.
      const rs = pl.map(ring);

      // An exterior ring may have been split at the antimeridian.
      // Create one part for each resulting exterior sub-ring.
      rs[0].forEach((sub, j) => {
        parts.push({
          c: ci, // Index of the country this polygon part belongs to.
          // Attach the interior rings (holes) to the first exterior
          // sub-ring. For later sub-rings, use only that exterior piece.
          rings: j ? [sub] : [sub].concat(...rs.slice(1))
        });
      });
    });
  });

  // Return projected points, polygon parts, country metadata, and point count.
  return {
    P: Float64Array.from(pts),
    parts,
    countries,
    np: n
  };
}

function polyStats(P, idx) {
  // Compute a polygon ring's signed area and centroid using the
  // shoelace formula. `idx` contains point indices into flat array P.
  let a = 0;
  let cx = 0;
  let cy = 0;
  const m = idx.length;

  for (let i = 0; i < m; i++) {
    const j = idx[i];
    const k = idx[(i + 1) % m]; // Wrap around to close the ring.
    const x0 = P[2 * j];
    const y0 = P[2 * j + 1];
    const x1 = P[2 * k];
    const y1 = P[2 * k + 1];

    // Cross-product contribution from this edge.
    const c = x0 * y1 - x1 * y0;

    a += c;
    cx += (x0 + x1) * c;
    cy += (y0 + y1) * c;
  }

  a /= 2; // Signed polygon area.

  // If the ring has nearly zero area, avoid dividing by a tiny number.
  // Use its first point as a fallback centroid and a small positive area.
  if (Math.abs(a) < 1e-7) {
    const j = idx[0];

    return {
      A: 1e-7,
      cx: P[2 * j],
      cy: P[2 * j + 1]
    };
  }

  // Return positive area and the polygon centroid.
  // The signed area is retained in the centroid calculation so that
  // clockwise and counter-clockwise rings are handled consistently.
  return {
    A: Math.abs(a),
    cx: cx / (6 * a),
    cy: cy / (6 * a)
  };
}

// Perform one Dougenik rubber-sheet cartogram iteration.
// G is the geographic data structure; V[c] is the target value for country c.
function iterate(G, V) {
  const { P, parts, countries } = G;
  const nc = countries.length; // Number of countries.
  const cur = new Float64Array(nc); // Current area of each country.

  // Calculate the area and centroid of each polygon part.
  // Add each part's area to its country's current total area.
  const st = parts.map(p => {
    const s = polyStats(P, p.rings[0]);
    cur[p.c] += s.A;
    return s;
  });

  // Sum the total current map area and the sum of target values.
  let TA = 0;
  let TV = 0;

  for (let c = 0; c < nc; c++) {
    TA += cur[c];
    TV += V[c];
  }

  // Calculate each country's desired area relative to its current area.
  const ratio = new Float64Array(nc);
  let err = 0;

  for (let c = 0; c < nc; c++) {
    // Desired area is the country's share of total target value
    // multiplied by the current total map area.
    ratio[c] = (V[c] / TV * TA) / cur[c];

    // Accumulate a bounded measure of how far the desired area differs
    // from the current area. The reciprocal handles ratios below 1.
    err += Math.min(6, Math.max(ratio[c], 1 / ratio[c]));
  }

  // Reduce each iteration's movement according to the average error.
  const frf = 1 / (1 + err / nc);

  // Represent each polygon part as a radial force centred on its centroid.
  const S = parts
    .map((p, i) => {
      const s = st[i];

      // Estimate the part's radius from its area, treating it as a circle.
      const r = Math.max(1e-4, Math.sqrt(s.A / Math.PI));

      return [
        s.cx,                         // Force centre x-coordinate.
        s.cy,                         // Force centre y-coordinate.
        r,                            // Estimated radius.
        (Math.sqrt(ratio[p.c]) - 1) * r // Radial displacement amount.
      ];
    })
    // Ignore negligible forces to reduce unnecessary calculations.
    .filter(s => Math.abs(s[3]) > 2e-4);

  // `G.used` contains the point indices that occur in the polygon rings.
  // Copy the current coordinates so unused points remain unchanged.
  const used = G.used;
  const out = new Float64Array(P.length);
  out.set(P);

  // Move each used point according to the combined forces from all parts.
  for (let u = 0; u < used.length; u++) {
    const k = used[u];
    const x = P[2 * k];
    const y = P[2 * k + 1];
    let dx = 0;
    let dy = 0;

    for (let i = 0; i < S.length; i++) {
      const s = S[i];
      const ex = x - s[0]; // Horizontal distance from the force centre.
      const ey = y - s[1]; // Vertical distance from the force centre.
      const d = Math.sqrt(ex * ex + ey * ey); // Distance from the centre.

      // Avoid division by a distance of zero.
      if (d < 1e-9) continue;

      const q = d / s[2]; // Distance relative to the estimated radius.

      // Calculate how strongly this part moves the point.
      // Outside the estimated radius, force decreases with distance.
      // Inside it, force varies smoothly with relative distance.
      const F = d > s[2]
        ? s[3] / q
        : s[3] * q * q * (4 - 3 * q);

      // Add this force's x and y components to the total displacement.
      dx += F * ex / d;
      dy += F * ey / d;
    }

    // Apply the accumulated displacement, scaled to moderate the update.
    out[2 * k] = x + dx * frf;
    out[2 * k + 1] = y + dy * frf;
  }

  // Update the map's coordinates in place.
  G.P.set(out);

  // Return the average error measure for this iteration.
  return err / nc;
}

function markUsed(G) {
  // Collect the indices of all points referenced by the polygon rings.
  // A Set avoids including the same point index more than once.
  const s = new Set();

  G.parts.forEach(p => {
    p.rings.forEach(r => {
      r.forEach(k => s.add(k));
    });
  });

  // Store the unique indices as an integer array for use by iterate().
  G.used = Int32Array.from(s);
}

function pathFor(P, c, G) {
  // Build and return SVG path commands for country `c`.
  // This function expects G.byC[c] to contain that country's polygon parts.
  let d = "";

  G.byC[c].forEach(p => {
    p.rings.forEach(r => {
      // Start each ring with a move command, then draw lines through
      // its remaining points.
      for (let i = 0; i < r.length; i++) {
        const k = r[i];

        d += (i ? "L" : "M") +
          P[2 * k].toFixed(3) + // Point's x-coordinate, rounded for the SVG path.
          " " +
          P[2 * k + 1].toFixed(3); // Point's y-coordinate.
      }

      // Close this ring. This closes both exterior outlines and holes.
      d += "Z";
    });
  });

  return d;
}