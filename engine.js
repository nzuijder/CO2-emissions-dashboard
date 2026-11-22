function proj(lon, lat) {
  const l = lon * Math.PI / 180;
  const f = lat * Math.PI / 180;
  const f2 = f * f;
  const f4 = f2 * f2;

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
  const [sx, sy] = topo.transform.scale;
  const [tx, ty] = topo.transform.translate;

  const off = [];
  const pts = [];
  let n = 0;

  topo.arcs.forEach(a => {
    let x = 0;
    let y = 0;

    off.push(n);

    a.forEach(q => {
      x += q[0];
      y += q[1];

      const r = proj(x * sx + tx, y * sy + ty);
      pts.push(r[0], r[1]);
      n++;
    });
  });

  off.push(n);

  const jump = (a, b) => Math.abs(pts[2 * a] - pts[2 * b]) > 3;

  const ring = r => {
    const o = [];

    r.forEach(i => {
      const rev = i < 0;
      const a = rev ? ~i : i;
      const s = off[a];
      const e = off[a + 1];
      const seg = [];

      for (let k = s; k < e; k++) {
        seg.push(k);
      }

      if (rev) seg.reverse();
      if (o.length) seg.shift();
      o.push(...seg);
    });

    // Split at antimeridian jumps into closed sub-rings
    const cuts = [];

    for (let i = 1; i < o.length; i++) {
      if (jump(o[i], o[i - 1])) cuts.push(i);
    }

    if (!cuts.length) {
      return [Int32Array.from(o)];
    }

    const segs = [];
    let st = 0;

    cuts.forEach(c => {
      segs.push(o.slice(st, c));
      st = c;
    });

    const last = o.slice(st, o.length - 1);
    const first = segs.shift();
    segs.push(last.concat(first));

    return segs
      .filter(q => q.length > 2)
      .map(q => Int32Array.from(q));
  };

  const countries = [];
  const parts = [];

  topo.objects.countries.geometries.forEach((g, ci) => {
    const polys = g.type === "Polygon" ? [g.arcs] : g.arcs;

    countries.push({ name: g.n });

    polys.forEach(pl => {
      const rs = pl.map(ring);

      rs[0].forEach((sub, j) => {
        parts.push({
          c: ci,
          rings: j ? [sub] : [sub].concat(...rs.slice(1))
        });
      });
    });
  });

  return {
    P: Float64Array.from(pts),
    parts,
    countries,
    np: n
  };
}

function polyStats(P, idx) {
  let a = 0;
  let cx = 0;
  let cy = 0;
  const m = idx.length;

  for (let i = 0; i < m; i++) {
    const j = idx[i];
    const k = idx[(i + 1) % m];
    const x0 = P[2 * j];
    const y0 = P[2 * j + 1];
    const x1 = P[2 * k];
    const y1 = P[2 * k + 1];
    const c = x0 * y1 - x1 * y0;

    a += c;
    cx += (x0 + x1) * c;
    cy += (y0 + y1) * c;
  }

  a /= 2;

  if (Math.abs(a) < 1e-7) {
    const j = idx[0];

    return {
      A: 1e-7,
      cx: P[2 * j],
      cy: P[2 * j + 1]
    };
  }

  return {
    A: Math.abs(a),
    cx: cx / (6 * a),
    cy: cy / (6 * a)
  };
}

// One Dougenik rubber-sheet pass. V = target value per country
function iterate(G, V) {
  const { P, parts, countries } = G;
  const nc = countries.length;
  const cur = new Float64Array(nc);

  const st = parts.map(p => {
    const s = polyStats(P, p.rings[0]);
    cur[p.c] += s.A;
    return s;
  });

  let TA = 0;
  let TV = 0;

  for (let c = 0; c < nc; c++) {
    TA += cur[c];
    TV += V[c];
  }

  const ratio = new Float64Array(nc);
  let err = 0;

  for (let c = 0; c < nc; c++) {
    ratio[c] = (V[c] / TV * TA) / cur[c];
    err += Math.min(6, Math.max(ratio[c], 1 / ratio[c]));
  }

  const frf = 1 / (1 + err / nc);

  const S = parts
    .map((p, i) => {
      const s = st[i];
      const r = Math.max(1e-4, Math.sqrt(s.A / Math.PI));

      return [
        s.cx,
        s.cy,
        r,
        (Math.sqrt(ratio[p.c]) - 1) * r
      ];
    })
    .filter(s => Math.abs(s[3]) > 2e-4);

  const used = G.used;
  const out = new Float64Array(P.length);
  out.set(P);

  for (let u = 0; u < used.length; u++) {
    const k = used[u];
    const x = P[2 * k];
    const y = P[2 * k + 1];
    let dx = 0;
    let dy = 0;

    for (let i = 0; i < S.length; i++) {
      const s = S[i];
      const ex = x - s[0];
      const ey = y - s[1];
      const d = Math.sqrt(ex * ex + ey * ey);

      if (d < 1e-9) continue;

      const q = d / s[2];
      const F = d > s[2]
        ? s[3] / q
        : s[3] * q * q * (4 - 3 * q);

      dx += F * ex / d;
      dy += F * ey / d;
    }

    out[2 * k] = x + dx * frf;
    out[2 * k + 1] = y + dy * frf;
  }

  G.P.set(out);
  return err / nc;
}

function markUsed(G) {
  const s = new Set();

  G.parts.forEach(p => {
    p.rings.forEach(r => {
      r.forEach(k => s.add(k));
    });
  });

  G.used = Int32Array.from(s);
}

function pathFor(P, c, G) {
  let d = "";

  G.byC[c].forEach(p => {
    p.rings.forEach(r => {
      for (let i = 0; i < r.length; i++) {
        const k = r[i];

        d += (i ? "L" : "M") +
          P[2 * k].toFixed(3) +
          " " +
          P[2 * k + 1].toFixed(3);
      }

      d += "Z";
    });
  });

  return d;
}