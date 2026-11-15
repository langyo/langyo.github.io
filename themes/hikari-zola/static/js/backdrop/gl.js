/**
 * gl.js — WebGL2 renderer: soft-round gl.POINTS over a transparent canvas.
 * dark = additive glow, near-white kernel #D9F7FF in a pale blue halo;
 * light = source-over, blue kernel + pale blue halo (additive blows out to white).
 */
import { SWORD_HEIGHT } from './sword.js';

const VS = `#version 300 es
in vec3 aPos;
in vec3 aAttr;               // x seed, y kind, z size(px)
uniform mat4 uMvp;
uniform vec2 uRes;           // viewport size in CSS px
uniform float uTime, uDpr, uBreath, uPulse, uGain, uRoll;
uniform vec3 uCore, uEdge;
out vec3 vCore;
out vec3 vGlow;
out float vAlpha;

// hot-kernel weight per class (0 = halo only, 1 = near-white core)
float kCore(float k) {
  return k < .5 ? .62 : k < 1.5 ? 1. : k < 2.5 ? .18 : k < 3.5 ? .12 : k < 4.5 ? .16 : k < 5.5 ? .34 : .02;
}
// per-class base opacity
float kAlpha(float k) {
  return k < .5 ? .55 : k < 1.5 ? .9 : k < 2.5 ? .34 : k < 3.5 ? .62 : k < 4.5 ? .52 : k < 5.5 ? .68 : .1;
}

void main() {
  float seed = aAttr.x, kind = aAttr.y, size = aAttr.z;
  vec4 p = uMvp * vec4(aPos, 1.);
  // breathing drift ±1.5px, phase from the seed
  float ph = uTime * .9 + seed * 6.2831853;
  p.xy += vec2(sin(ph * .7), cos(ph * .53)) * uBreath * (2. / uRes) * p.w;
  gl_Position = p;
  // gentle screen-space roll (±2°) so the sword never looks frozen
  float cr = cos(uRoll), sr = sin(uRoll);
  p.xy = mat2(cr, sr, -sr, cr) * p.xy;
  gl_PointSize = max(1., size * uDpr * (.85 + .3 * seed));
  float kc = kCore(kind);
  vCore = uCore;
  vGlow = mix(uEdge, uCore, kc * .75);
  vAlpha = kAlpha(kind) * uPulse * uGain * (.7 + .3 * fract(seed * 7.31));
}
`;

const FS = `#version 300 es
precision mediump float;
in vec3 vCore;
in vec3 vGlow;
in float vAlpha;
out vec4 fragColor;
void main() {
  float d = length(gl_PointCoord - vec2(.5)) * 2.;   // 0 centre … 1 rim
  if (d > 1.) discard;
  float halo = (1. - d) * (1. - d);                  // soft round falloff
  float core = pow(max(0., 1. - d * 2.3), 2.5);      // tight hot kernel
  float a = min(1., halo * .8 + core * .85) * vAlpha;
  fragColor = vec4(mix(vGlow, vCore, core), a);      // additive: src.rgb * src.a
}
`;

/* palettes: on a white page the additive kernel must be darker/denser (gain) */
const PALETTE = {
  dark: { core: [0.851, 0.969, 1.0], edge: [0.498, 0.847, 1.0], gain: 0.4 },     // #D9F7FF / #7FD8FF
  light: { core: [0.18, 0.47, 0.87], edge: [0.55, 0.78, 1.0], gain: 1.05 },   // #2E78DE / #8CC7FF
};

const FOV = 42 * Math.PI / 180;    // vertical field of view
const DIST = 6;                    // camera → sword distance

/* ---- tiny column-major mat4 helpers (only what this renderer needs) ---- */
function perspective(out, fovy, aspect, near, far) {
  const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
  out.fill(0);
  out[0] = f / aspect; out[5] = f;
  out[10] = (far + near) * nf; out[11] = -1; out[14] = 2 * far * near * nf;
  return out;
}
function mul(out, a, b) {                 // out = a * b
  for (let c = 0; c < 4; c++) {
    const b0 = b[c * 4], b1 = b[c * 4 + 1], b2 = b[c * 4 + 2], b3 = b[c * 4 + 3];
    for (let r = 0; r < 4; r++) {
      out[c * 4 + r] = a[r] * b0 + a[4 + r] * b1 + a[8 + r] * b2 + a[12 + r] * b3;
    }
  }
  return out;
}

/**
 * Create the renderer over an existing canvas.
 * @param {HTMLCanvasElement} canvas
 * @returns controller, or null when WebGL2 is unavailable / the shaders fail
 */
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
    for (const k of ['mvp', 'res', 'time', 'dpr', 'breath', 'pulse', 'gain', 'roll', 'core', 'edge']) {
      loc[k] = gl.getUniformLocation(prog, 'u' + k[0].toUpperCase() + k.slice(1));
    }
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

  const proj = new Float32Array(16);
  const model = new Float32Array(16);
  const mvp = new Float32Array(16);
  let count = 0, w = 1, h = 1;

  return {
    /** upload a freshly generated cloud (interleaved x,y,z,seed,kind,size) */
    setPoints(data) {
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      count = data.length / 6;
    },

    /** CSS-pixel viewport + device pixel ratio */
    resize(cw, ch, dpr) {
      w = Math.max(1, cw); h = Math.max(1, ch);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
      perspective(proj, FOV, w / h, 0.1, 40);
    },

    /** draw one frame; st = {time, dark, yaw, pitch, panX, panY, heightFrac, breathe} */
    draw(st) {
      gl.clear(gl.COLOR_BUFFER_BIT);
      if (!count) return;
      const pal = PALETTE[st.dark ? 'dark' : 'light'];

      // fit the sword to a fraction of the viewport height
      const visH = 2 * DIST * Math.tan(FOV / 2);
      const s = (st.heightFrac * visH) / SWORD_HEIGHT;

      // model = T(pan) * Rx(pitch) * Ry(yaw) * S(s), closed form
      const cy = Math.cos(st.yaw), sy = Math.sin(st.yaw);
      const cx = Math.cos(st.pitch), sx = Math.sin(st.pitch);
      model[0] = cy * s;  model[1] = sx * sy * s;  model[2] = -cx * sy * s; model[3] = 0;
      model[4] = 0;       model[5] = cx * s;       model[6] = sx * s;       model[7] = 0;
      model[8] = sy * s;  model[9] = -sx * cy * s; model[10] = cx * cy * s; model[11] = 0;
      model[12] = st.panX * visH; model[13] = st.panY * visH;
      model[14] = -DIST; model[15] = 1;
      mul(mvp, proj, model);
      // Approved deviation: on the white page additive saturates to pure WHITE
      // (measured) and turns invisible, so light composites source-over instead.
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
      gl.uniform1f(loc.pulse, 1 + 0.09 * Math.sin(st.time * 0.9));
      gl.uniform1f(loc.gain, pal.gain * (st.dim || 1));
      gl.uniform1f(loc.roll, st.roll || 0);

      gl.uniform3fv(loc.core, pal.core);
      gl.uniform3fv(loc.edge, pal.edge);
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
