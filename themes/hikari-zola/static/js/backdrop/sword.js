/**
 * sword.js — procedural point cloud of the "light sword" (光之剑).
 * +Y = blade axis, X = blade width, Z = thickness; height 2.4. Double-edged
 * straight blade with a fuller (血槽), up-swept guard, wrapped grip, domed
 * pommel. 6 floats/point: x,y,z,seed,kind,size (breathing phase, class, px).
 */

/** point classes, index order must match the shader tables in gl.js */
export const K_BLADE = 0;   // blade faces
export const K_EDGE = 1;    // cutting edges (brightest)
export const K_FULLER = 2;  // recessed fuller groove (dim)
export const K_GUARD = 3;   // cross-guard
export const K_GRIP = 4;    // wrapped grip
export const K_POMMEL = 5;  // pommel
export const K_DUST = 6;    // ambient motes

/** overall height in local units (contract: ~2.4) */
export const SWORD_HEIGHT = 2.4;

const TIP_Y = 1.2;          // blade point
const BASE_Y = -0.6;        // blade root, on the guard
const HW0 = 0.115;          // blade half width at the root
const TH0 = 0.026;          // blade half thickness (diamond section)
const GUARD_Y = -0.67;
const GUARD_X = 0.3;        // guard half span
const GRIP_TOP = -0.74;
const GRIP_BOTTOM = -1.06;
const POMMEL_Y = -1.12;

const TAU = Math.PI * 2;
const rnd = (a, b) => a + Math.random() * (b - a);
const sgn = () => (Math.random() < 0.5 ? -1 : 1);

/** blade half width / thickness at normalised position t (0 root, 1 tip) */
const bladeW = (t) => HW0 * Math.pow(1 - t, 0.8);
const bladeT = (t) => TH0 * Math.pow(1 - t, 0.7);

/** @param {number} count point budget @returns {Float32Array} interleaved cloud */
export function buildSword(count) {
  const out = new Float32Array(count * 6);
  let i = 0;
  const put = (x, y, z, seed, kind, size) => {
    const o = i * 6;
    out[o] = x; out[o + 1] = y; out[o + 2] = z;
    out[o + 3] = seed; out[o + 4] = kind; out[o + 5] = size;
    i++;
  };

  /* the blade carries most of the geometry; the hilt is denser per unit area */
  const nBlade = Math.round(count * 0.5);
  const nGuard = Math.round(count * 0.14);
  const nGrip = Math.round(count * 0.12);
  const nPommel = Math.round(count * 0.07);
  const nDust = count - nBlade - nGuard - nGrip - nPommel;

  /* blade: faces + two cutting edges + fuller groove */
  for (let k = 0; k < nBlade; k++) {
    const t = Math.random();                       // 0 root … 1 tip
    const y = BASE_Y + t * (TIP_Y - BASE_Y);
    const hw = bladeW(t);
    const th = bladeT(t);
    const r = Math.random();
    if (r < 0.22) {
      put(sgn() * hw * rnd(0.94, 1), y, rnd(-0.004, 0.004), Math.random(), K_EDGE, 5.8);
    } else if (r < 0.34) {
      // fuller: dim recessed line down the centre
      put(rnd(-0.02, 0.02), y, sgn() * th * 0.3, Math.random(), K_FULLER, 4.2);
    } else {
      // diamond faces; inside the fuller band the centre stays sparse so the
      // groove reads as a dark channel between them
      let u = rnd(-1, 1);
      if (t > 0.13 && t < 0.68) u = Math.sign(u || 1) * (0.2 + 0.8 * Math.abs(u));
      put(u * hw, y, sgn() * th * (1 - Math.abs(u)) * rnd(0.85, 1), Math.random(), K_BLADE, 5.4);
    }
  }

  /* cross-guard: bar whose tips sweep up (微上翘) */
  for (let k = 0; k < nGuard; k++) {
    const s = rnd(-1, 1);                          // -1 … +1 across the guard
    const yc = GUARD_Y + 0.085 * s * s;            // tips rise, centre stays low
    const hh = 0.03 * (1 - 0.4 * Math.abs(s));     // bar thins towards the tips
    const zt = 0.03 * (1 - 0.55 * Math.abs(s));
    const face = Math.random();
    let y, z;
    if (face < 0.45) {
      y = yc + rnd(-hh, hh); z = sgn() * zt;       // front / back faces
    } else if (face < 0.8) {
      y = yc + sgn() * hh; z = rnd(-zt, zt);       // top / bottom rims
    } else {
      const a = rnd(0, TAU), rr = 0.05 * Math.sqrt(Math.random());
      y = yc + Math.sin(a) * rr; z = Math.cos(a) * rr;  // centre boss
    }
    put(s * GUARD_X, y, z, Math.random(), K_GUARD, 5.0);
  }

  /* grip: slightly oval cylinder with wrap ridges */
  for (let k = 0; k < nGrip; k++) {
    const t = Math.random();
    const a = rnd(0, TAU);
    const rr = (0.0335 + 0.0045 * Math.sin(t * 14 + 1.2)) * rnd(0.95, 1.02);
    put(Math.cos(a) * rr, GRIP_TOP + t * (GRIP_BOTTOM - GRIP_TOP), Math.sin(a) * rr * 0.78,
      Math.random(), K_GRIP, 4.8);
  }

  /* pommel: flattened dome */
  for (let k = 0; k < nPommel; k++) {
    const u = rnd(-1, 1), a = rnd(0, TAU), r = Math.sqrt(1 - u * u);
    put(Math.cos(a) * r * 0.062, POMMEL_Y + u * 0.055, Math.sin(a) * r * 0.049,
      Math.random(), K_POMMEL, 5.4);
  }

  /* ambient motes: faint halo around the whole sword */
  for (let k = 0; k < nDust; k++) {
    const a = rnd(0, TAU), rr = 0.34 + Math.random() * 0.3;
    put(Math.cos(a) * rr, rnd(-1.34, 1.42), Math.sin(a) * rr * 0.7,
      Math.random(), K_DUST, 5.6);
  }

  return out;
}
