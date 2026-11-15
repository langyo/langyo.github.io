/**
 * gl.js — WebGL2 renderer for the hologram point cloud.
 * Orthographic booth: each frame the model's projected bbox is fitted into the
 * target NDC box, so the full-screen canvas follows a DOM rect exactly.
 * Soft gl.POINTS; dark = additive bloom, light = source-over (approved deviation:
 * additive saturates to WHITE on the white page). Colours: uPal[8] per class.
 */
const VS = `#version 300 es
in vec3 aPos;
in vec3 aAttr;                 // x seed, y kind, z size(px)
uniform mat4 uMvp;
uniform vec2 uRes;             // viewport in CSS px
uniform float uTime, uDpr, uBreath, uPulse, uGain, uScan;
uniform vec3 uPal[8];
uniform vec3 uCore;
out vec3 vCol;
out float vK;
out float vAlpha;

float kAlpha(float k) {   // per-class opacity
  return k < .5 ? .34 : k < 1.5 ? .85 : k < 2.5 ? .5 : k < 3.5 ? 1. :
         k < 4.5 ? .9 : k < 5.5 ? .55 : k < 6.5 ? .6 : .16;
}
float kCore(float k) {    // hot-kernel weight
  return k < .5 ? .12 : k < 1.5 ? .7 : k < 2.5 ? 0. : k < 3.5 ? 1. :
         k < 4.5 ? .75 : k < 5.5 ? .25 : k < 6.5 ? .55 : 0.;
}

void main() {
  float seed = aAttr.x, kind = aAttr.y, size = aAttr.z;
  vec3 p = aPos;
  // hologram rings: spin in their own plane + bob; projector beams stay put
  if (kind > 5.5 && kind < 6.5 && size > 2.5) {
    float a = uTime * .30 + p.x * 1.7;
    float ca = cos(a), sa = sin(a);
    p = vec3(p.x, ca * p.y - sa * p.z, sa * p.y + ca * p.z);
    p.y += sin(uTime * .45 + p.x * 2.) * .10;
  }
  // scan band sweeping along +X (amplitude <= .25)
  float bx = fract(uTime * .07) * 3.4 - 1.7 - p.x;
  float band = uScan * exp(-16. * bx * bx);
  vec4 clip = uMvp * vec4(p, 1.);
  // breathing drift, per-point phase from the seed
  float ph = uTime * .9 + seed * 6.2831853;
  clip.xy += vec2(sin(ph * .7), cos(ph * .53)) * uBreath * (2. / uRes);
  gl_Position = clip;
  gl_PointSize = max(1., size * uDpr * (.85 + .3 * seed));
  vCol = uPal[int(kind)];
  vK = kCore(kind);
  vAlpha = kAlpha(kind) * uPulse * uGain * (1. + band) * (size < 2.5 ? .45 : 1.) * (.75 + .25 * fract(seed * 7.31));
}
`;

const FS = `#version 300 es
precision mediump float;
in vec3 vCol;
in float vK;
in float vAlpha;
uniform vec3 uCore;
out vec4 fragColor;
void main() {
  float d = length(gl_PointCoord - vec2(.5)) * 2.;   // 0 centre … 1 rim
  if (d > 1.) discard;
  float halo = (1. - d) * (1. - d);                  // soft round falloff
  float core = pow(max(0., 1. - d * 2.3), 2.5);      // tight kernel
  float a = min(1., halo * .8 + core * .85) * vAlpha;
  fragColor = vec4(mix(vCol, uCore, core * vK), a);
}
`;

/* palettes: PANEL EDGE RAIL PORT CAP BRASS RING DUST + kernel colour */
const PAL = {
  dark: {
    gain: 0.62, core: [0.93, 0.99, 1],
    k: [[0.34, 0.6, 0.85], [0.85, 0.97, 1], [0.08, 0.24, 0.42], [0.92, 1, 1],
      [1, 0.7, 0.26], [0.68, 0.52, 0.2], [0.42, 0.85, 1], [0.28, 0.46, 0.6]],
  },
  light: {
    gain: 1.05, core: [0.04, 0.22, 0.44],
    k: [[0.55, 0.72, 0.9], [0.15, 0.45, 0.84], [0.07, 0.21, 0.37], [0.05, 0.4, 0.6],
      [0.83, 0.5, 0.05], [0.6, 0.44, 0.13], [0.15, 0.56, 0.75], [0.5, 0.66, 0.83]],
  },
};
for (const p of [PAL.dark, PAL.light]) p.flat = new Float32Array(p.k.flat());

/** Renderer over an existing canvas; null when WebGL2 / shaders fail. */
export function createRenderer(canvas) {
  let gl;
  try {
    gl = canvas.getContext('webgl2', {
      alpha: true, depth: false, stencil: false, antialias: false,
      premultipliedAlpha: true, powerPreference: 'low-power',
    });
  } catch (e) { gl = null; }
  if (!gl) return null;

  const compile = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(s) || 'shader compile failed');
    }
    return s;
  };

  let prog, vao, buf, loc;
  try {
    prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(prog) || 'link failed');
    }
    // attribute + uniform locations (uniform names are 'u' + Capitalised key)
    loc = {
      aPos: gl.getAttribLocation(prog, 'aPos'),
      aAttr: gl.getAttribLocation(prog, 'aAttr'),
    };
    for (const k of ['mvp', 'res', 'time', 'dpr', 'breath', 'pulse', 'gain', 'scan', 'core']) {
      loc[k] = gl.getUniformLocation(prog, 'u' + k[0].toUpperCase() + k.slice(1));
    }
    loc.pal = gl.getUniformLocation(prog, 'uPal[0]');
    vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.enableVertexAttribArray(loc.aPos);
    gl.vertexAttribPointer(loc.aPos, 3, gl.FLOAT, false, 24, 0);
    gl.enableVertexAttribArray(loc.aAttr);
    gl.vertexAttribPointer(loc.aAttr, 3, gl.FLOAT, false, 24, 12);
    gl.bindVertexArray(null);
  } catch (e) {
    return null;                        // broken driver → caller hides the canvas
  }

  gl.disable(gl.DEPTH_TEST);
  gl.enable(gl.BLEND);
  gl.clearColor(0, 0, 0, 0);

  const mvp = new Float32Array(16);      // model matrix already in clip space
  let count = 0, hull = null, w = 1, h = 1;

  return {
    /** upload a cloud + its hull extremes (used for the fit) */
    setPoints(data, hl) {
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      count = data.length / 6;
      hull = hl;
    },

    /** CSS-pixel viewport + device pixel ratio */
    resize(cw, ch, dpr) {
      w = Math.max(1, cw); h = Math.max(1, ch);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
    },

    /**
     * Draw one frame.
     * st = {time, dark, yaw, pitch, roll, fit, bob, dim, breathe}
     * fit = {cx, cy, w, h} in NDC: the projection box the gun must fill
     * (bbox-adaptive scale, so the gun always uses the chamber).
     */
    draw(st) {
      gl.clear(gl.COLOR_BUFFER_BIT);
      if (!count) return;
      const pal = PAL[st.dark ? 'dark' : 'light'];
      const aspect = w / h;
      const cy = Math.cos(st.yaw), sy = Math.sin(st.yaw);
      const cx = Math.cos(st.pitch), sx = Math.sin(st.pitch);
      const cz = Math.cos(st.roll), sz = Math.sin(st.roll);
      // R = Rz(roll) * Rx(pitch) * Ry(yaw), column-major 3x3 (view-plane roll last)
      const r0 = cz * cy - sz * sx * sy, r1 = sz * cy + cz * sx * sy, r2 = -cx * sy;
      const r3 = -sz * cx, r4 = cz * cx, r5 = sx;
      const r6 = cz * sy + sz * sx * cy, r7 = sz * sy - cz * sx * cy, r8 = cx * cy;
      // fit the rotated silhouette (hull extremes) into the target box
      let mnx = 1e9, mxx = -1e9, mny = 1e9, mxy = -1e9;
      for (let i = 0; i < hull.length; i += 3) {
        const px = hull[i], py = hull[i + 1], pz = hull[i + 2];
        const wx = r0 * px + r3 * py + r6 * pz;
        const wy = r1 * px + r4 * py + r7 * pz;
        if (wx < mnx) mnx = wx;
        if (wx > mxx) mxx = wx;
        if (wy < mny) mny = wy;
        if (wy > mxy) mxy = wy;
      }
      const bw = mxx - mnx, bh = mxy - mny;
      // 0.85 / 0.66 of the booth + 2% hull inflation ⇒ >=6% inset at every phase
      const s = Math.min(0.85 * st.fit.w * aspect / (bw * 1.02), 0.66 * st.fit.h / (bh * 1.02));
      // clip-space model matrix: ortho maps x/aspect and y directly
      const k = s / aspect;
      mvp[0] = r0 * k; mvp[4] = r3 * k; mvp[8] = r6 * k;
      mvp[12] = st.fit.cx - (mnx + mxx) * 0.5 * k;
      mvp[1] = r1 * s; mvp[5] = r4 * s; mvp[9] = r7 * s;
      mvp[13] = st.fit.cy + (st.bob || 0) - (mny + mxy) * 0.5 * s;
      mvp[2] = r2 * s; mvp[6] = r5 * s; mvp[10] = r8 * s;
      mvp[3] = 0; mvp[7] = 0; mvp[11] = 0; mvp[14] = 0; mvp[15] = 1;

      // dark: additive bloom. light: source-over, else the cloud turns white.
      if (st.dark) {
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
      } else {
        gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA,
          gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      }

      gl.useProgram(prog);
      gl.uniformMatrix4fv(loc.mvp, false, mvp);
      gl.uniform2f(loc.res, w, h);
      gl.uniform1f(loc.time, st.time);
      gl.uniform1f(loc.dpr, canvas.height / h);
      gl.uniform1f(loc.breath, st.breathe ? 1.5 : 0);
      gl.uniform1f(loc.pulse, 1 + 0.04 * Math.sin(st.time * 0.8));
      gl.uniform1f(loc.gain, pal.gain * (st.dim || 1));
      gl.uniform1f(loc.scan, 0.22);
      gl.uniform3fv(loc.pal, pal.flat);
      gl.uniform3fv(loc.core, pal.core);
      gl.bindVertexArray(vao);
      gl.drawArrays(gl.POINTS, 0, count);
      gl.bindVertexArray(null);
    },

    /** drop GL resources */
    dispose() {
      count = 0;
      gl.deleteBuffer(buf);
      gl.deleteVertexArray(vao);
      gl.deleteProgram(prog);
    },
  };
}
