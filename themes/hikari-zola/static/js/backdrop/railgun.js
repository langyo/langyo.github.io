/**
 * railgun.js — procedural point cloud of the RG·SUPERNOVA railgun ("光之剑").
 * +X = muzzle, +Y = up, Z = across; ~2.6 x 0.52 x 0.4 units. Faceted shell, twin
 * top rails + dark channel, wedge muzzle block with two barrels, exposed amber
 * capacitor + silver rings, carry handle, rear power pack, slanted stock, brass
 * belly rails, hologram rings, projector beams. 6 floats/point: x,y,z,seed,kind,px.
 * EDGE frames the silhouette (denser than the PANEL faces).
 */
export const K_PANEL = 0;   // shell faces (sparse, dim)
export const K_EDGE = 1;    // hard edges / outline (dense, bright)
export const K_RAIL = 2;    // dark rail channel
export const K_PORT = 3;    // muzzle / panel cores
export const K_CAP = 4;     // amber capacitor
export const K_BRASS = 5;   // brass belly rails
export const K_RING = 6;    // hologram rings
export const K_DUST = 7;    // floating motes

/** world length along X (contract: ~2.6) */
export const GUN_LENGTH = 2.6;


const TAU = Math.PI * 2;
const rnd = (a, b) => a + Math.random() * (b - a);

/** faceted (octagonal) cross-section in the YZ plane: [y, z] pairs in order */
const oct = (hy, hz, c) => [
  [hy, hz - c], [hy - c, hz], [c - hy, hz], [-hy, hz - c],
  [-hy, c - hz], [c - hy, -hz], [hy - c, -hz], [hy, c - hz],
];

/**
 * @param {number} count point budget
 * @returns {Float32Array} interleaved x,y,z,seed,kind,size
 */
export function buildRailgun(count) {
  const P = [];
  const add = (x, y, z, kind, size) => P.push(x, y, z, Math.random(), kind, size);

  /** n points along the segment a→b */
  const edge = (n, a, b, kind, size) => {
    for (let i = 0; i < n; i++) {
      const t = Math.random();
      add(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, kind, size);
    }
  };
  /** n points on the bilinear patch p0,p1,p2,p3 (p0→p1 across, p0→p3 along) */
  const face = (n, p0, p1, p2, p3, kind, size) => {
    for (let i = 0; i < n; i++) {
      const u = Math.random(), v = Math.random();
      const ax = p0[0] + (p1[0] - p0[0]) * u, ay = p0[1] + (p1[1] - p0[1]) * u, az = p0[2] + (p1[2] - p0[2]) * u;
      const bx = p3[0] + (p2[0] - p3[0]) * u, by = p3[1] + (p2[1] - p3[1]) * u, bz = p3[2] + (p2[2] - p3[2]) * u;
      add(ax + (bx - ax) * v, ay + (by - ay) * v, az + (bz - az) * v, kind, size);
    }
  };
  /** n points inside the profile polygon at a single x (closes a hull end) */
  const cap = (n, prof, x, yc, zc, s, kind, size) => {
    const m = prof.length;
    for (let i = 0; i < n; i++) {
      const k = 1 + ((Math.random() * (m - 1)) | 0);
      const a = prof[0], b = prof[k], c = prof[(k + 1) % m];
      let u = Math.random(), v = Math.random();
      if (u + v > 1) { u = 1 - u; v = 1 - v; }
      add(x, yc + (a[0] + (b[0] - a[0]) * u + (c[0] - a[0]) * v) * s,
        zc + (a[1] + (b[1] - a[1]) * u + (c[1] - a[1]) * v) * s, kind, size);
    }
  };
  /** faceted hull: profile extruded x0→x1, y-centre lerps y0→y1, section s0→s1 */
  const hull = (prof, x0, x1, y0, y1, zc, s0, s1, nE, nP, ek, pk, es, ps, nC) => {
    const m = prof.length;
    const ne = Math.max(1, Math.round(nE * 0.5 / m));
    const nr = Math.max(1, Math.round(nE * 0.25 / m));
    const nf = Math.max(1, Math.round(nP / m));
    if (nC) { cap(nC, prof, x0, y0, zc, s0, pk, ps); cap(nC, prof, x1, y1, zc, s1, pk, ps); }
    for (let i = 0; i < m; i++) {
      const j = (i + 1) % m;
      const a0 = [x0, y0 + prof[i][0] * s0, zc + prof[i][1] * s0];
      const b0 = [x0, y0 + prof[j][0] * s0, zc + prof[j][1] * s0];
      const a1 = [x1, y1 + prof[i][0] * s1, zc + prof[i][1] * s1];
      const b1 = [x1, y1 + prof[j][0] * s1, zc + prof[j][1] * s1];
      edge(ne, a0, a1, ek, es);
      edge(nr, a0, b0, ek, es);
      edge(nr, a1, b1, ek, es);
      face(nf, a0, b0, b1, a1, pk, ps);
    }
  };

  const f = (k) => Math.round(count * k);

  /* main shell: two faceted cowls, the front one slightly larger */
  for (const c of [[-0.95, 0.30, 1, 0.155, 0.05], [0.30, 0.92, 0.95, 0.108, 0.034]]) {
    hull(oct(0.172, 0.131, 0.055), c[0], c[1], 0.03, 0.03, 0, 1, c[2],
      f(c[3]), f(c[4]), K_EDGE, K_PANEL, 4.4, 3.0, f(0.008));
  }

  /* raised front cowl plate */
  hull(oct(0.02, 0.108, 0.02), 0.10, 0.90, 0.212, 0.212, 0, 1, 1, f(0.024), f(0.008), K_EDGE, K_PANEL, 4.2, 2.8);

  /* wedge muzzle block: tapers and drops slightly toward the muzzle */
  hull(oct(0.18, 0.135, 0.06), 0.92, 1.26, 0.03, 0.0, 0, 1.03, 0.8, f(0.085), f(0.017), K_EDGE, K_PANEL, 4.4, 2.8, f(0.008));

  /* twin barrels protruding from the muzzle block + bright front rings */
  for (const zc of [-0.075, 0.075]) {
    for (let i = 0; i < f(0.026); i++) {
      const a = rnd(0, TAU), u = Math.random();
      add(1.24 + u * 0.11, -0.075 + Math.cos(a) * 0.05, zc + Math.sin(a) * 0.05,
        u > 0.72 ? K_PORT : K_EDGE, 4.6);
    }
    for (let i = 0; i < f(0.012); i++) {
      const a = rnd(0, TAU), r = 0.03 * Math.sqrt(Math.random()) * (i % 3 ? 1 : 1.7);
      add(1.358, -0.075 + Math.cos(a) * r, zc + Math.sin(a) * r, K_PORT, 5.0);
    }
  }

  /* two round muzzle ports: bright core + inner edge + outer ring */
  for (const zc of [-0.072, 0.072]) {
    for (let i = 0; i < f(0.011); i++) {
      const a = rnd(0, TAU);
      add(1.285, -0.085 + Math.cos(a) * 0.048, zc + Math.sin(a) * 0.048, K_PORT, 4.4);
    }
    for (let i = 0; i < f(0.005); i++) {
      const a = rnd(0, TAU);
      add(1.283, -0.085 + Math.cos(a) * 0.03, zc + Math.sin(a) * 0.03, K_EDGE, 3.4);
    }
    for (let i = 0; i < f(0.004); i++) {
      const a = rnd(0, TAU), r = 0.017 * Math.sqrt(Math.random());
      add(1.281, -0.085 + Math.cos(a) * r, zc + Math.sin(a) * r, K_PORT, 4.6);
    }
  }

  /* twin top rails + dark channel between them */
  for (const zc of [-0.052, 0.052]) {
    hull(oct(0.013, 0.022, 0.005), -0.55, 0.86, 0.236, 0.236, zc, 1, 1,
      f(0.04), f(0.004), K_EDGE, K_PANEL, 5.0, 3.2);
  }
  for (let i = 0; i < f(0.018); i++) add(rnd(-0.5, 0.8), 0.218, rnd(-0.016, 0.016), K_RAIL, 3.2);
  for (const zc of [-0.088, 0.088]) {
    for (let i = 0; i < f(0.006); i++) add(rnd(-0.5, 0.82), 0.207, zc + rnd(-0.008, 0.008), K_RAIL, 3.0);
  }

  /* exposed amber capacitor (drum along X) + 4 silver rings */
  for (let i = 0; i < f(0.05); i++) {
    const a = rnd(0, TAU);
    add(rnd(-0.86, -0.52), 0.05 + Math.cos(a) * 0.09, 0.115 + Math.sin(a) * 0.09, K_CAP, 4.4);
  }
  for (const x of [-0.82, -0.73, -0.64, -0.55]) {
    for (let i = 0; i < f(0.006); i++) {
      const a = rnd(0, TAU);
      add(x + rnd(-0.008, 0.008), 0.05 + Math.cos(a) * 0.099, 0.115 + Math.sin(a) * 0.099, K_EDGE, 4.0);
    }
  }

  /* top carry handle: rectangular loop of two thin plates */
  const hx0 = -0.68, hx1 = -0.32, hy0 = 0.20, hy1 = 0.36;
  for (const z of [-0.028, 0.028]) {
    const c = [[hx0, hy0, z], [hx1, hy0, z], [hx1, hy1, z], [hx0, hy1, z]];
    for (let i = 0; i < 4; i++) edge(f(0.007), c[i], c[(i + 1) % 4], K_EDGE, 3.4);
  }
  for (let i = 0; i < f(0.018); i++) {
    add(rnd(hx0, hx1), rnd(0.28, hy1), rnd(-0.028, 0.028), K_PANEL, 2.8);
  }

  /* rear power pack + lit blue panel */
  hull(oct(0.175, 0.135, 0.05), -1.26, -0.90, 0.03, 0.03, 0, 1, 1, f(0.06), f(0.016), K_EDGE, K_PANEL, 4.6, 2.8, f(0.007));
  for (let i = 0; i < f(0.014); i++) add(rnd(-1.16, -1.04), rnd(0.05, 0.14), 0.138, K_PORT, 4.6);
  edge(f(0.006), [-1.16, 0.05, 0.138], [-1.04, 0.05, 0.138], K_EDGE, 3.8);
  edge(f(0.006), [-1.16, 0.14, 0.138], [-1.04, 0.14, 0.138], K_EDGE, 3.8);

  /* slanted rear stock */
  hull(oct(0.06, 0.11, 0.02), -1.30, -1.00, -0.21, -0.10, 0, 1, 0.92, f(0.035), f(0.008), K_EDGE, K_PANEL, 4.2, 2.8);

  /* brass belly rails + rivets */
  for (const zc of [-0.085, 0.085]) {
    hull(oct(0.011, 0.014, 0.003), -1.05, 0.92, -0.185, -0.185, zc, 1, 1,
      f(0.024), f(0.003), K_BRASS, K_BRASS, 3.4, 2.8);
  }
  for (let i = 0; i < f(0.012); i++) {
    add(rnd(-1.0, 0.9), -0.182, (Math.random() < 0.5 ? -1 : 1) * rnd(0.07, 0.10), K_BRASS, 4.0);
  }

  /* hologram rings: dashed arcs so the shader spin is visible */
  for (const x of [-0.42, 0.02, 0.46]) {
    for (let i = 0; i < f(0.013); i++) {
      const a = rnd(0, TAU);
      if (Math.sin(a * 5) < -0.55) continue;          // gaps between the arcs
      add(x, Math.cos(a) * 0.32, Math.sin(a) * 0.32, K_RING, 3.6);
    }
  }

  /* projector cone beams: from a base point under the gun to both ends */
  for (const ex of [-1.24, 1.24]) {
    for (let i = 0; i < f(0.022); i++) {
      const t = Math.random();
      add(ex * t, -0.46 + t * 0.5, rnd(-0.05, 0.05), K_RING, 2.6);
    }
  }

  /* floating motes */
  for (let i = 0; i < f(0.026); i++) add(rnd(-1.32, 1.32), rnd(-0.30, 0.44), rnd(-0.3, 0.3), K_DUST, 3.0);

  /* exact size: pad by repeating points (with jitter) or truncate */
  const out = new Float32Array(count * 6);
  const have = P.length / 6;
  for (let i = 0; i < count; i++) {
    const j = (i < have ? i : (Math.random() * have) | 0) * 6;
    const o = i * 6;
    out[o] = P[j]; out[o + 1] = P[j + 1]; out[o + 2] = P[j + 2];
    out[o + 3] = P[j + 3]; out[o + 4] = P[j + 4]; out[o + 5] = P[j + 5];
  }

  /* convex-hull-ish extremes (18 directions, every 2nd point): the renderer fits
     the *silhouette* to the booth, not the empty corners of an AABB */
  const ext = [];
  for (let d = 0; d < 30; d++) {
    const a = (d / 30) * TAU * 3, b = (d * 1.7) % TAU;
    const dx = Math.cos(a) * Math.cos(b), dy = Math.sin(b), dz = Math.sin(a) * Math.cos(b);
    let best = 0, bd = -1e9;
    for (let i = 0; i < P.length; i += 12) {
      if (P[i + 4] > 6.5) continue;                     // dust must not inflate the fit
      if (P[i + 4] > 5.5 && P[i + 5] < 2.5) continue;   // nor the projector cone
      const v = P[i] * dx + P[i + 1] * dy + P[i + 2] * dz;
      if (v > bd) { bd = v; best = i; }
    }
    ext.push(P[best], P[best + 1], P[best + 2]);
  }
  return { data: out, hull: new Float32Array(ext) };
}
