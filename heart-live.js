// Coração 3D em WebGL. Usa as funções do modelo (rig.mjs) já inlinadas antes deste arquivo.
let SLOW = 4;
const canvas = document.querySelector("[data-heart]");
const stage = canvas.parentElement;
const gl = canvas.getContext("webgl", { antialias: true, alpha: true, premultipliedAlpha: false });
const readout = document.querySelector("[data-readout]");

// ─────────── álgebra mínima ───────────
const V = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  mul: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  len: (a) => Math.hypot(a[0], a[1], a[2]),
  norm: (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
  lerp: (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t],
};
const rotZ = (p, a) => [p[0] * Math.cos(a) - p[1] * Math.sin(a), p[0] * Math.sin(a) + p[1] * Math.cos(a), p[2]];
const rotX = (p, a) => [p[0], p[1] * Math.cos(a) - p[2] * Math.sin(a), p[1] * Math.sin(a) + p[2] * Math.cos(a)];
const perp = (n) => { const t = Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]; const u = V.norm(V.cross(n, t)); return [u, V.cross(n, u)]; };
const clamp01 = (x) => Math.max(0, Math.min(1, x));

function perspective(fov, aspect, near, far) {
  const f = 1 / Math.tan(fov / 2);
  return [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) / (near - far), -1, 0, 0, (2 * far * near) / (near - far), 0];
}
function mul4(a, b) {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
}
function viewMatrix(yaw, pitch, dist, pan) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
  // rotação (yaw em Y, depois pitch em X) e translação para trás
  const R = [cy, sp * sy, -cp * sy, 0, 0, cp, sp, 0, sy, -sp * cy, cp * cy, 0, 0, 0, 0, 1];
  const T = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, pan[0], pan[1], -dist, 1];
  return mul4(T, R);
}
const xform = (m, p) => {
  const x = m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12];
  const y = m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13];
  const z = m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14];
  const w = m[3] * p[0] + m[7] * p[1] + m[11] * p[2] + m[15];
  return [x / w, y / w, z / w, w];
};

// ─────────── geometria ───────────
function chamber({ c, r, rot = [0, 0], taper = 0, bump = 0, lat = 40, lon = 60, seed = 0 }) {
  const pos = [], nrm = [], idx = [];
  for (let i = 0; i <= lat; i++) {
    const th = (Math.PI * i) / lat;
    for (let j = 0; j <= lon; j++) {
      const ph = (2 * Math.PI * j) / lon;
      const l = [Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph)];
      const f = 1 - taper * Math.pow(Math.max(0, -l[1]), 1.25);
      let n = V.norm([l[0] / r[0], l[1] / r[1], l[2] / r[2]]);
      const wob = bump * (Math.sin(3 * th + 1.3 + seed) * Math.sin(2 * ph + 0.7 + seed) + 0.6 * Math.sin(5 * ph + th * 2.2 + seed * 2) + 0.4 * Math.sin(7 * th + 3 * ph));
      let p = [r[0] * l[0] * f + n[0] * wob, r[1] * l[1] + n[1] * wob, r[2] * l[2] * f + n[2] * wob];
      p = rotX(rotZ(p, rot[0]), rot[1]);
      n = rotX(rotZ(n, rot[0]), rot[1]);
      pos.push(c[0] + p[0], c[1] + p[1], c[2] + p[2]);
      nrm.push(n[0], n[1], n[2]);
    }
  }
  for (let i = 0; i < lat; i++) for (let j = 0; j < lon; j++) {
    const a = i * (lon + 1) + j, b = a + lon + 1;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  return { pos, nrm, idx };
}
function catmull(pts, per = 10) {
  const out = [];
  const g = (i) => pts[Math.max(0, Math.min(pts.length - 1, i))];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = g(i - 1), p1 = g(i), p2 = g(i + 1), p3 = g(i + 2);
    for (let s = 0; s < per; s++) {
      const t = s / per, t2 = t * t, t3 = t2 * t;
      out.push([0, 1, 2].map((k) => 0.5 * ((2 * p1[k]) + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3)));
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}
function tube(points, radii, { sides = 18, per = 9, cap = [true, true], smooth = true } = {}) {
  const line = smooth ? catmull(points, per) : points;
  const rs = line.map((_, i) => { const t = (i / (line.length - 1)) * (radii.length - 1); const a = Math.floor(t), b = Math.min(radii.length - 1, a + 1); return radii[a] + (radii[b] - radii[a]) * (t - a); });
  const pos = [], nrm = [], idx = [];
  let T = V.norm(V.sub(line[1], line[0]));
  let [N] = perp(T);
  for (let i = 0; i < line.length; i++) {
    const nxt = line[Math.min(line.length - 1, i + 1)], prv = line[Math.max(0, i - 1)];
    const t2 = V.norm(V.sub(nxt, prv));
    // transporte paralelo
    const ax = V.cross(T, t2);
    if (V.len(ax) > 1e-6) { const ang = Math.asin(Math.min(1, V.len(ax))); const k = V.norm(ax); N = V.add(V.add(V.mul(N, Math.cos(ang)), V.mul(V.cross(k, N), Math.sin(ang))), V.mul(k, V.dot(k, N) * (1 - Math.cos(ang)))); }
    T = t2;
    const B = V.cross(T, N);
    for (let s = 0; s <= sides; s++) {
      const a = (2 * Math.PI * s) / sides;
      const d = V.add(V.mul(N, Math.cos(a)), V.mul(B, Math.sin(a)));
      const p = V.add(line[i], V.mul(d, rs[i]));
      pos.push(p[0], p[1], p[2]); nrm.push(d[0], d[1], d[2]);
    }
  }
  for (let i = 0; i < line.length - 1; i++) for (let s = 0; s < sides; s++) {
    const a = i * (sides + 1) + s, b = a + sides + 1;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const addCap = (ring, center, dir) => {
    const base = pos.length / 3;
    pos.push(center[0], center[1], center[2]); nrm.push(dir[0], dir[1], dir[2]);
    for (let s = 0; s <= sides; s++) { const o = (ring + s) * 3; pos.push(pos[o], pos[o + 1], pos[o + 2]); nrm.push(dir[0], dir[1], dir[2]); }
    for (let s = 0; s < sides; s++) idx.push(base, base + 1 + s, base + 2 + s);
  };
  if (cap[0]) addCap(0, line[0], V.mul(V.norm(V.sub(line[1], line[0])), -1));
  if (cap[1]) addCap((line.length - 1) * (sides + 1), line[line.length - 1], V.norm(V.sub(line[line.length - 1], line[line.length - 2])));
  return { pos, nrm, idx };
}
const merge = (list) => {
  const o = { pos: [], nrm: [], idx: [] };
  for (const m of list) { const base = o.pos.length / 3; o.pos.push(...m.pos); o.nrm.push(...m.nrm); o.idx.push(...m.idx.map((i) => i + base)); }
  return o;
};
function ringMesh(c, n, R, r) {
  const [u, v] = perp(n);
  const pts = [];
  for (let i = 0; i <= 40; i++) { const a = (2 * Math.PI * i) / 40; pts.push(V.add(c, V.add(V.mul(u, Math.cos(a) * R), V.mul(v, Math.sin(a) * R)))); }
  return tube(pts, [r], { sides: 10, smooth: false, cap: [false, false] });
}


// ─────────── anatomia (visão frontal: esquerda do paciente à direita da tela) ───────────
const CH = {
  lv: { c: [0.3, -0.28, -0.05], r: [0.5, 0.92, 0.47], rot: [-0.42, 0], taper: 0.45, bump: 0.008, seed: 1, pivot: [0.22, 0.16, -0.14] },
  rv: { c: [-0.28, -0.3, 0.3], r: [0.5, 0.78, 0.36], rot: [0.22, 0.1], taper: 0.34, bump: 0.008, seed: 2, pivot: [-0.3, 0.1, 0.25] },
  la: { c: [0.22, 0.58, -0.42], r: [0.52, 0.3, 0.34], rot: [0.12, 0], taper: 0, bump: 0.006, seed: 3, pivot: [0.2, 0.4, -0.32] },
  ra: { c: [-0.82, 0.2, 0.08], r: [0.34, 0.52, 0.32], rot: [0, 0], taper: 0, bump: 0.008, seed: 4, pivot: [-0.6, 0.2, 0.15] },
};
const BLOOD_R = 0.8; // raio da cavidade em relação à parede externa
const PARTS = []; // tecido
const BLOODS = []; // sangue (volume)
const addTissue = (name, mesh, color, inner, extra = {}) => PARTS.push({ name, mesh, color, inner, ...extra });
const addBlood = (name, mesh, color, extra = {}) => BLOODS.push({ name, mesh, color, ...extra });
const chamberMesh = (key, k = 1) => chamber({ ...CH[key], r: CH[key].r.map((x) => x * k), bump: k === 1 ? CH[key].bump : 0, lat: k === 1 ? 40 : 28, lon: k === 1 ? 60 : 40 });

addTissue("lv", chamberMesh("lv"), [0.7, 0.24, 0.2], [0.5, 0.12, 0.12], { scale: "lvOut", pivot: CH.lv.pivot, side: "L" });
addTissue("rv", chamberMesh("rv"), [0.66, 0.32, 0.3], [0.46, 0.16, 0.18], { scale: "rvOut", pivot: CH.rv.pivot, side: "R" });
addTissue("la", chamberMesh("la"), [0.68, 0.27, 0.24], [0.48, 0.13, 0.13], { scale: "laOut", pivot: CH.la.pivot, side: "L" });
addTissue("ra", chamberMesh("ra"), [0.6, 0.32, 0.36], [0.4, 0.16, 0.22], { scale: "raOut", pivot: CH.ra.pivot, side: "R" });
addBlood("lv", chamberMesh("lv", BLOOD_R), [0.82, 0.07, 0.08], { scale: "lv", pivot: CH.lv.pivot, side: "L" });
addBlood("rv", chamberMesh("rv", BLOOD_R), [0.2, 0.3, 0.78], { scale: "rv", pivot: CH.rv.pivot, side: "R" });
addBlood("la", chamberMesh("la", BLOOD_R), [0.84, 0.09, 0.1], { scale: "la", pivot: CH.la.pivot, side: "L" });
addBlood("ra", chamberMesh("ra", BLOOD_R), [0.22, 0.32, 0.8], { scale: "ra", pivot: CH.ra.pivot, side: "R" });

// aorta (com os três ramos do arco) e tronco pulmonar
const aortaPts = [[0.07, 0.3, 0.0], [0.04, 0.62, 0.02], [0.08, 0.98, 0.0], [0.26, 1.2, -0.1], [0.52, 1.14, -0.26], [0.68, 0.84, -0.34], [0.7, 0.4, -0.4], [0.7, -0.2, -0.42]];
const aortaR = [0.2, 0.19, 0.18, 0.17, 0.16, 0.15, 0.15, 0.15];
const branches = [
  tube([[0.12, 1.12, -0.02], [0.1, 1.35, 0.0], [0.08, 1.62, 0.0]], [0.06, 0.055, 0.05], { sides: 12, cap: [false, true] }),
  tube([[0.22, 1.2, -0.08], [0.24, 1.42, -0.08], [0.26, 1.66, -0.08]], [0.05, 0.045, 0.04], { sides: 12, cap: [false, true] }),
  tube([[0.36, 1.2, -0.14], [0.46, 1.4, -0.14], [0.56, 1.58, -0.12]], [0.05, 0.045, 0.04], { sides: 12, cap: [false, true] }),
];
addTissue("ao", merge([tube(aortaPts, aortaR, { sides: 24, cap: [false, true] }), ...branches]), [0.74, 0.25, 0.22], [0.5, 0.12, 0.12], { scale: "ao", pivot: [0.2, 0.7, -0.1], side: "L" });
const branchPts = [[[0.12, 1.12, -0.02], [0.1, 1.35, 0.0], [0.08, 1.62, 0.0]], [[0.22, 1.2, -0.08], [0.24, 1.42, -0.08], [0.26, 1.66, -0.08]], [[0.36, 1.2, -0.14], [0.46, 1.4, -0.14], [0.56, 1.58, -0.12]]];
addBlood("ao", merge([tube(aortaPts, aortaR.map((r) => r * 0.78), { sides: 18, cap: [false, true] }), ...branchPts.map((pts, i) => tube(pts, [0.045 - i * 0.004, 0.04 - i * 0.004, 0.035 - i * 0.004], { sides: 10, cap: [false, true] }))]), [0.82, 0.07, 0.08], { scale: "ao", pivot: [0.2, 0.7, -0.1], side: "L" });

const paTrunk = [[-0.2, 0.34, 0.36], [-0.14, 0.7, 0.3], [-0.08, 0.98, 0.18]];
const paL = [[-0.08, 0.98, 0.18], [0.2, 1.06, 0.1], [0.5, 0.98, -0.08], [0.78, 0.8, -0.2]];
const paR = [[-0.08, 0.98, 0.18], [-0.34, 1.02, 0.0], [-0.62, 0.98, -0.18], [-0.9, 0.82, -0.3]];
const paMesh = (k) => merge([tube(paTrunk, [0.16 * k, 0.15 * k, 0.14 * k], { sides: 20, cap: [false, false] }), tube(paL, [0.13 * k, 0.115 * k, 0.1 * k, 0.1 * k], { sides: 18, cap: [false, true] }), tube(paR, [0.13 * k, 0.115 * k, 0.1 * k, 0.1 * k], { sides: 18, cap: [false, true] })]);
addTissue("pa", paMesh(1), [0.48, 0.55, 0.78], [0.28, 0.34, 0.54], { scale: "rv2", pivot: [-0.1, 0.8, 0.2], side: "R" });
addBlood("pa", paMesh(0.78), [0.2, 0.3, 0.78], { scale: "rv2", pivot: [-0.1, 0.8, 0.2], side: "R" });
const svcP = [[-0.82, 0.55, 0.06], [-0.84, 0.95, 0.04], [-0.84, 1.45, 0.0]], ivcP = [[-0.8, -0.1, 0.05], [-0.8, -0.5, 0.04], [-0.82, -0.95, 0.0]];
const cavaMesh = (k) => merge([tube(svcP, [0.14 * k, 0.14 * k, 0.14 * k], { sides: 18, cap: [false, true] }), tube(ivcP, [0.15 * k, 0.15 * k, 0.15 * k], { sides: 18, cap: [false, true] })]);
addTissue("cava", cavaMesh(1), [0.42, 0.5, 0.74], [0.24, 0.3, 0.5], { scale: "ra2", pivot: [-0.8, 0.2, 0.05], side: "R" });
addBlood("cava", cavaMesh(0.78), [0.2, 0.3, 0.78], { scale: "ra2", pivot: [-0.8, 0.2, 0.05], side: "R" });
const pvEnds = [[[0.74, 0.62, -0.52], [1.2, 0.8, -0.66]], [[0.74, 0.5, -0.4], [1.2, 0.46, -0.5]], [[-0.1, 0.66, -0.58], [-0.46, 0.84, -0.8]], [[-0.1, 0.52, -0.5], [-0.46, 0.5, -0.7]]];
const pvMesh = (k) => merge(pvEnds.map(([a, b]) => tube([a, V.lerp(a, b, 0.5), b], [0.09 * k, 0.08 * k, 0.08 * k], { sides: 14, per: 4, cap: [false, true] })));
addTissue("pv", pvMesh(1), [0.74, 0.28, 0.25], [0.5, 0.13, 0.13], { scale: "la2", pivot: [0.2, 0.55, -0.42], side: "L" });
addBlood("pv", pvMesh(0.78), [0.84, 0.09, 0.1], { scale: "la2", pivot: [0.2, 0.55, -0.42], side: "L" });

// aurículas (apêndices atriais)
addTissue("raa", chamber({ c: [-0.5, 0.62, 0.42], r: [0.2, 0.26, 0.1], rot: [-0.7, 0.3], taper: 0.2, bump: 0.01, seed: 5, lat: 24, lon: 36 }), [0.62, 0.34, 0.36], [0.44, 0.18, 0.22], { scale: "raOut", pivot: CH.ra.pivot, side: "R" });
addTissue("laa", chamber({ c: [0.66, 0.6, 0.18], r: [0.2, 0.22, 0.09], rot: [0.9, 0.2], taper: 0.2, bump: 0.01, seed: 6, lat: 24, lon: 36 }), [0.7, 0.3, 0.26], [0.5, 0.14, 0.14], { scale: "laOut", pivot: CH.la.pivot, side: "L" });

// coronárias em gordura epicárdica
const coronary = (pts, r) => [tube(pts, r.map((x) => x * 1.7), { sides: 10, cap: [true, true] }), tube(pts, r, { sides: 8, cap: [true, true] })];
const lad = [[0.1, 0.38, 0.22], [0.1, 0.12, 0.46], [0.18, -0.25, 0.46], [0.28, -0.62, 0.38], [0.38, -0.96, 0.2]];
const rca = [[0.0, 0.36, 0.3], [-0.45, 0.45, 0.45], [-0.75, 0.2, 0.34], [-0.7, -0.2, 0.46], [-0.55, -0.6, 0.5]];
const lcx = [[0.14, 0.36, 0.14], [0.45, 0.42, 0.14], [0.7, 0.22, 0.02], [0.78, -0.1, -0.06]];
for (const [i, pts] of [lad, rca, lcx].entries()) {
  const [fat, art] = coronary(pts, [0.026, 0.024, 0.02, 0.018, 0.015].slice(0, pts.length));
  addTissue("fat" + i, fat, [0.9, 0.76, 0.42], [0.7, 0.56, 0.3], { scale: "none", decor: true });
  addTissue("art" + i, art, [0.78, 0.18, 0.14], [0.6, 0.1, 0.1], { scale: "none", decor: true });
}
// músculos papilares (visíveis com corte ou em modo translúcido)
const papT = [[0.34, -0.1, -0.22], [0.16, -0.06, -0.26]];
addTissue("pap", merge([
  tube([[0.5, -0.6, -0.3], [0.42, -0.35, -0.26], papT[0]], [0.07, 0.055, 0.03], { sides: 12, per: 4, cap: [false, true] }),
  tube([[0.12, -0.6, -0.32], [0.14, -0.35, -0.3], papT[1]], [0.07, 0.055, 0.03], { sides: 12, per: 4, cap: [false, true] }),
]), [0.62, 0.22, 0.2], [0.5, 0.15, 0.14], { scale: "lv", pivot: CH.lv.pivot, side: "L", inside: true });

// válvulas
const VALVES = {
  mitral: { c: [0.2, 0.2, -0.26], n: V.norm([0.18, -0.9, 0.38]), R: 0.22, count: 2, width: 1.5, full: 4.5 },
  aortic: { c: [0.07, 0.32, -0.02], n: V.norm([0, 1, 0.06]), R: 0.165, count: 3, width: 0.96, full: 4.0 },
  tricuspid: { c: [-0.5, -0.02, 0.2], n: V.norm([0.5, -0.78, 0.26]), R: 0.22, count: 3, width: 0.96, full: 4.5 },
  pulmonary: { c: [-0.2, 0.36, 0.36], n: V.norm([0.06, 1, -0.1]), R: 0.15, count: 3, width: 0.96, full: 4.0 },
};
for (const [name, v] of Object.entries(VALVES)) addTissue("ring-" + name, ringMesh(v.c, v.n, v.R, 0.026), [0.86, 0.74, 0.62], [0.64, 0.52, 0.44], { scale: "none", ring: name });

// ─────────── WebGL ───────────
const compile = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
const program = (vs, fs) => { const p = gl.createProgram(); gl.attachShader(p, compile(gl.VERTEX_SHADER, vs)); gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p); if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p)); return p; };
const tissue = program(`
attribute vec3 aPos; attribute vec3 aNrm;
uniform mat4 uVP; uniform vec3 uPivot; uniform float uScale;
varying vec3 vN; varying vec3 vW;
void main(){ vec3 p = uPivot + (aPos-uPivot)*uScale; vW=p; vN=aNrm; gl_Position=uVP*vec4(p,1.); }`, `
precision mediump float;
varying vec3 vN; varying vec3 vW;
uniform vec3 uColor; uniform vec3 uInner; uniform vec3 uCam; uniform float uAlpha; uniform float uCut; uniform float uCutOn; uniform float uRim; uniform vec3 uRimColor; uniform float uShine;
void main(){
  if(uCutOn>0.5 && vW.z>uCut) discard;
  vec3 n=normalize(vN); bool front=gl_FrontFacing; if(!front) n=-n;
  vec3 L=normalize(vec3(-0.4,0.8,0.7)); vec3 Vv=normalize(uCam-vW);
  float diff=max(dot(n,L),0.)*0.75+max(dot(n,normalize(vec3(0.6,-0.2,0.5))),0.)*0.25+0.4;
  float spec=pow(max(dot(reflect(-L,n),Vv),0.),uShine>0.5?60.:20.)*(uShine>0.5?0.7:0.3);
  float rim=pow(1.-abs(dot(n,Vv)),2.2);
  vec3 base = front? uColor : uInner;
  vec3 c = base*diff + spec + uRimColor*rim*uRim;
  float edge = uCutOn>0.5 ? smoothstep(0.012,0.0,abs(vW.z-uCut)) : 0.;
  c += vec3(0.9,0.75,0.7)*edge*0.6;
  float a = uAlpha + rim*uRim*0.55;
  gl_FragColor=vec4(c, clamp(a,0.,1.));
}`);
const pts = program(`
attribute vec3 aPos; attribute vec4 aCol; attribute float aSize;
uniform mat4 uVP; uniform float uPx; varying vec4 vC;
void main(){ vec4 p=uVP*vec4(aPos,1.); gl_Position=p; gl_PointSize=aSize*uPx/p.w; vC=aCol; }`, `
precision mediump float; varying vec4 vC;
void main(){ float d=length(gl_PointCoord-0.5)*2.; float a=smoothstep(1.,0.,d); a*=a; gl_FragColor=vec4(vC.rgb, vC.a*a); }`);
const lineP = program(`attribute vec3 aPos; uniform mat4 uVP; void main(){ gl_Position=uVP*vec4(aPos,1.); }`, `precision mediump float; uniform vec4 uC; uniform float uCut; void main(){ gl_FragColor=uC; }`);

const resetAttribs = () => { for (let i = 0; i < 8; i++) gl.disableVertexAttribArray(i); };
const buf = (data, type = gl.ARRAY_BUFFER, usage = gl.STATIC_DRAW) => { const b = gl.createBuffer(); gl.bindBuffer(type, b); gl.bufferData(type, data, usage); return b; };
for (const p of [...PARTS, ...BLOODS]) { p.vb = buf(new Float32Array(p.mesh.pos)); p.nb = buf(new Float32Array(p.mesh.nrm)); p.ib = buf(new Uint16Array(p.mesh.idx), gl.ELEMENT_ARRAY_BUFFER); p.count = p.mesh.idx.length; }

// folhetos (dinâmicos)
const GRID_S = 7, GRID_T = 6;
for (const [name, v] of Object.entries(VALVES)) {
  const per = GRID_S * GRID_T, idx = [];
  for (let l = 0; l < v.count; l++) for (let s = 0; s < GRID_S - 1; s++) for (let t = 0; t < GRID_T - 1; t++) {
    const a = l * per + s * GRID_T + t, b = a + GRID_T;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  v.pos = new Float32Array(v.count * per * 3); v.nrm = new Float32Array(v.count * per * 3);
  v.vb = buf(v.pos, gl.ARRAY_BUFFER, gl.DYNAMIC_DRAW); v.nb = buf(v.nrm, gl.ARRAY_BUFFER, gl.DYNAMIC_DRAW);
  v.ib = buf(new Uint16Array(idx), gl.ELEMENT_ARRAY_BUFFER); v.count_idx = idx.length;
  [v.u, v.v] = perp(v.n);
}
function leaflets(v, rho, gapLen, bulge) {
  const alpha = Math.acos(Math.max(0, Math.min(1, (1 - rho) / gapLen)));
  const per = GRID_S * GRID_T, P = v.pos;
  for (let l = 0; l < v.count; l++) {
    const phi = ((2 * Math.PI) / v.count) * l + (v.count === 2 ? Math.PI / 2 : Math.PI / 6);
    for (let s = 0; s < GRID_S; s++) for (let t = 0; t < GRID_T; t++) {
      const ss = s / (GRID_S - 1), tt = (t / (GRID_T - 1)) * 2 - 1;
      const psi = phi + tt * v.width * 0.5 * (1 - 0.3 * ss);
      const er = V.add(V.mul(v.u, Math.cos(psi)), V.mul(v.v, Math.sin(psi)));
      const d = ss * v.R * gapLen;
      const along = d * Math.sin(alpha) + bulge * Math.sin(Math.PI * ss) * v.R * (1 - clamp01(rho * 2.2)) * (1 - tt * tt * 0.5);
      const radial = v.R - d * Math.cos(alpha);
      const p = V.add(v.c, V.add(V.mul(er, radial), V.mul(v.n, along)));
      const o = (l * per + s * GRID_T + t) * 3;
      P[o] = p[0]; P[o + 1] = p[1]; P[o + 2] = p[2];
    }
  }
  const N = v.nrm;
  for (let l = 0; l < v.count; l++) for (let s = 0; s < GRID_S; s++) for (let t = 0; t < GRID_T; t++) {
    const at = (ss, tt) => { const o = (l * per + Math.max(0, Math.min(GRID_S - 1, ss)) * GRID_T + Math.max(0, Math.min(GRID_T - 1, tt))) * 3; return [P[o], P[o + 1], P[o + 2]]; };
    let n = V.norm(V.cross(V.sub(at(s, t + 1), at(s, t - 1)), V.sub(at(s + 1, t), at(s - 1, t))));
    if (V.dot(n, v.n) < 0) n = V.mul(n, -1);
    const o = (l * per + s * GRID_T + t) * 3;
    N[o] = n[0]; N[o + 1] = n[1]; N[o + 2] = n[2];
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, v.vb); gl.bufferSubData(gl.ARRAY_BUFFER, 0, P);
  gl.bindBuffer(gl.ARRAY_BUFFER, v.nb); gl.bufferSubData(gl.ARRAY_BUFFER, 0, N);
}
const chordBuf = gl.createBuffer();

// ─────────── trajetos do sangue (partículas) ───────────
const LEFT_LANES = [[[1.18, 0.8, -0.66], [0.74, 0.62, -0.52]], [[1.18, 0.46, -0.5], [0.74, 0.5, -0.4]], [[-0.46, 0.84, -0.8], [-0.1, 0.66, -0.58]], [[-0.46, 0.5, -0.7], [-0.1, 0.52, -0.5]]];
const leftCommon = [
  [[0.22, 0.58, -0.42], "la", 0.2, "la"], [[0.22, 0.4, -0.36], "la", 0.17, "la"], [[0.2, 0.2, -0.26], "none", 0.1, "mv"],
  [[0.26, 0.0, -0.16], "lv", 0.2, "lv"], [[0.3, -0.3, -0.1], "lv", 0.28, "lv"], [[0.2, -0.05, -0.05], "lv", 0.16, "lv"],
  [[0.07, 0.32, -0.02], "none", 0.09, "av"], [[0.05, 0.6, 0.02], "ao", 0.15, "ao"], [[0.08, 0.98, 0.0], "ao", 0.15, "ao"],
  [[0.26, 1.2, -0.1], "ao", 0.14, "ao"], [[0.52, 1.14, -0.26], "ao", 0.13, "ao"], [[0.68, 0.84, -0.34], "ao", 0.12, "ao"],
  [[0.7, 0.4, -0.4], "ao", 0.12, "ao"], [[0.7, -0.2, -0.42], "ao", 0.12, "ao"],
];
const RIGHT_LANES = [[[-0.84, 1.45, 0.0], [-0.84, 0.95, 0.04]], [[-0.82, -0.95, 0.0], [-0.8, -0.5, 0.04]]];
const rightCommon = [
  [[-0.82, 0.55, 0.06], "ra", 0.16, "ra"], [[-0.8, 0.2, 0.1], "ra", 0.22, "ra"], [[-0.5, -0.02, 0.2], "none", 0.1, "mv"],
  [[-0.36, -0.2, 0.26], "rv", 0.2, "rv"], [[-0.3, -0.3, 0.3], "rv", 0.24, "rv"], [[-0.24, 0.05, 0.32], "rv", 0.16, "rv"],
  [[-0.2, 0.36, 0.36], "none", 0.09, "av"], [[-0.14, 0.7, 0.3], "pa", 0.12, "ao"], [[-0.08, 0.98, 0.18], "pa", 0.11, "ao"],
];
const buildPath = (lane, common, kind) => {
  const nodes = [[lane[0], "pv", 0.07, kind], [lane[1], "pv", 0.07, kind], ...common];
  const arc = [0];
  for (let i = 1; i < nodes.length; i++) arc.push(arc[i - 1] + V.len(V.sub(nodes[i][0], nodes[i - 1][0])));
  return { nodes, arc, total: arc[arc.length - 1] };
};
const paths = { left: LEFT_LANES.map((l) => buildPath(l, leftCommon, "pv")), right: RIGHT_LANES.map((l) => buildPath(l, rightCommon, "pv")) };
const N_PART = 280;
const particles = [];
for (const side of ["left", "right"]) for (let i = 0; i < N_PART; i++) particles.push({ side, lane: i % paths[side].length, s: Math.random() * 100, a: Math.random() * 6.28, b: Math.sqrt(Math.random()), j: Math.random() * 6.28, size: 0.7 + Math.random() * 0.6 });
const jets = { mr: [], ar: [] };
for (let i = 0; i < 60; i++) { jets.mr.push({ s: Math.random(), a: Math.random() * 6.28, b: Math.sqrt(Math.random()) }); jets.ar.push({ s: Math.random(), a: Math.random() * 6.28, b: Math.sqrt(Math.random()) }); }

// ─────────── estado ───────────
const S = { yaw: -0.5, pitch: 0.12, dist: 4.6, flow: false, blood: false, cut: false, labels: true, playing: true, kase: "normal", sev: 1, drag: null, idle: 0 };
let sim = null, lastMs = 0;
const factors = {};
const sm = { m: 0, a: 0, mb: 0, ab: 0 };
const REF = { edv: 148 };
const lerpParams = (a, b, t) => { const o = {}; for (const key of Object.keys(a)) o[key] = a[key] + (b[key] - a[key]) * t; return o; };
function reset() {
  const params = S.kase === "normal" ? { ...CASES.normal } : lerpParams(CASES.normal, CASES[S.kase], S.sev);
  sim = start(params);
  settle(sim, 8);
  const n = start(CASES.normal); settle(n, 8);
  REF.edv = n.beat ? n.beat.edv : 148;
}
reset();

const viewport = { w: 1, h: 1, dpr: 1 };
function resize() {
  const r = stage.getBoundingClientRect();
  viewport.dpr = Math.min(window.devicePixelRatio || 1, 2);
  viewport.w = Math.max(10, Math.round(r.width * viewport.dpr)); viewport.h = Math.max(10, Math.round(r.height * viewport.dpr));
  canvas.width = viewport.w; canvas.height = viewport.h;
}
new ResizeObserver(resize).observe(stage); resize();
canvas.addEventListener("pointerdown", (e) => { canvas.setPointerCapture(e.pointerId); S.drag = { x: e.clientX, y: e.clientY }; S.idle = 0; });
canvas.addEventListener("pointermove", (e) => { if (!S.drag) return; S.yaw += (e.clientX - S.drag.x) * 0.008; S.pitch = Math.max(-1.2, Math.min(1.2, S.pitch + (e.clientY - S.drag.y) * 0.006)); S.drag = { x: e.clientX, y: e.clientY }; S.idle = 0; });
canvas.addEventListener("pointerup", () => { S.drag = null; });
canvas.addEventListener("wheel", (e) => { e.preventDefault(); S.dist = Math.max(2.4, Math.min(7, S.dist * (1 + e.deltaY * 0.001))); }, { passive: false });

const LABELS = [
  ["AE", [0.4, 0.8, -0.55], "L"], ["VE", [0.58, -0.55, 0.15], "L"], ["Ao", [0.55, 1.3, -0.1], "L"],
  ["AD", [-1.12, 0.35, 0.2], "R"], ["VD", [-0.68, -0.68, 0.5], "R"], ["AP", [-0.5, 1.14, 0.2], "R"],
  ["V. mitral", [0.2, 0.2, -0.26], "valve"], ["V. aórtica", [0.07, 0.32, -0.02], "valve"],
];
const labelEls = LABELS.map(([t, , k]) => { const el = document.createElement("span"); el.className = "hl-label"; el.dataset.kind = k; el.textContent = t; stage.appendChild(el); return el; });

// ─────────── som ───────────
const AUD = { ctx: null, on: false, beats: true, murmurs: true, vol: 0.8, g: {}, env: { s1: 0, s2: 0, snap: 0 } };
function audioInit() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return false;
  const ctx = (AUD.ctx = new Ctx());
  AUD.master = ctx.createGain(); AUD.master.gain.value = 0.0; AUD.master.connect(ctx.destination);
  const len = ctx.sampleRate * 2, nb = ctx.createBuffer(1, len, ctx.sampleRate), d = nb.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  AUD.noise = nb;
  const branch = (name, chain, gain) => {
    const src = ctx.createBufferSource(); src.buffer = nb; src.loop = true;
    let node = src;
    for (const [type, f, q] of chain) { const flt = ctx.createBiquadFilter(); flt.type = type; flt.frequency.value = f; flt.Q.value = q; node.connect(flt); node = flt; }
    const g = ctx.createGain(); g.gain.value = 0; node.connect(g); g.connect(AUD.master); src.start();
    AUD.g[name] = { g, gain };
  };
  branch("as", [["bandpass", 260, 0.7], ["lowpass", 900, 0.5]], 1.6);   // sopro ejetivo, áspero
  branch("mr", [["highpass", 260, 0.7], ["bandpass", 480, 0.6]], 1.3);   // sopro regurgitante, "em jato de vapor"
  branch("ar", [["highpass", 520, 0.7], ["bandpass", 900, 0.8]], 0.9);   // sopro aspirativo, agudo
  branch("ms", [["lowpass", 170, 0.7], ["bandpass", 85, 1.0]], 3.0);     // ruflar grave
  return true;
}
function thump(freq, dur, gain) {
  if (!AUD.ctx || !AUD.on || !AUD.beats) return;
  const ctx = AUD.ctx, t = ctx.currentTime, stretch = Math.sqrt(SLOW);
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = "sine"; o.frequency.setValueAtTime(freq, t); o.frequency.exponentialRampToValueAtTime(freq * 0.55, t + dur * stretch);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain * AUD.vol, t + 0.006); g.gain.exponentialRampToValueAtTime(0.001, t + dur * stretch);
  o.connect(g); g.connect(AUD.master); o.start(t); o.stop(t + dur * stretch + 0.05);
}
function click(freq, dur, gain) {
  if (!AUD.ctx || !AUD.on || !AUD.beats) return;
  const ctx = AUD.ctx, t = ctx.currentTime, src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  src.buffer = AUD.noise; f.type = "bandpass"; f.frequency.value = freq; f.Q.value = 2.5;
  g.gain.setValueAtTime(gain * AUD.vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f); f.connect(g); g.connect(AUD.master); src.start(t, Math.random()); src.stop(t + dur + 0.02);
}
function setAudio(on) {
  AUD.on = on;
  if (on && !AUD.ctx && !audioInit()) { AUD.on = false; return; }
  if (AUD.ctx) { AUD.ctx.resume && AUD.ctx.resume(); AUD.master.gain.setTargetAtTime(on ? 0.9 : 0, AUD.ctx.currentTime, 0.05); }
}
function murmurAmps(p) {
  const s = sim;
  return {
    as: clamp01((Math.sqrt(s.da) - 3) / 7) * (s.qa > 2 ? 1 : 0),
    mr: clamp01(Math.sqrt(s.dmBack) / 9) * clamp01(p.miLeak / 0.3),
    ar: clamp01(Math.sqrt(s.daBack) / 9) * clamp01(p.aoLeak / 0.2),
    ms: clamp01((Math.sqrt(s.dm) - 2.4) / 2.6) * (s.qm > 2 ? 1 : 0),
  };
}

// ─────────── fonocardiograma ao vivo ───────────
const pcg = document.querySelector("[data-pcg]");
const pcgCtx = pcg ? pcg.getContext("2d") : null;
let pcgLast = -1;
function drawPcg(u, amps) {
  if (!pcgCtx) return;
  const w = pcg.width, h = pcg.height;
  const x = Math.floor(u * w);
  if (pcgLast < 0 || x < pcgLast) { pcgCtx.clearRect(0, 0, w, h); }
  const dark = getComputedStyle(pcg).getPropertyValue("--pcg-ink") || "#cfe6ff";
  const murmur = Math.max(amps.as, amps.mr, amps.ar, amps.ms);
  const env = AUD.env;
  for (let xx = Math.max(0, pcgLast + 1); xx <= x; xx++) {
    const a = murmur * 0.42 * (0.55 + 0.45 * Math.random()) + Math.max(env.s1, env.s2, env.snap) * 0.55;
    const hh = Math.max(1, a * h * 0.5);
    pcgCtx.fillStyle = dark.trim() || "#cfe6ff";
    pcgCtx.fillRect(xx, h / 2 - hh, 1, hh * 2);
  }
  pcgLast = x;
}

// ─────────── quadro ───────────
const phaseOf = (t) => (t % BEAT_SECONDS) / BEAT_SECONDS;
function speedFor(kind, q, p) {
  switch (kind) {
    case "pv": return 0.55;
    case "la": return 0.1 + 0.004 * q.m;
    case "ra": return 0.14 + 0.004 * q.m;
    case "mv": return Math.min(3.4, 0.2 + 0.011 * q.m / Math.max(0.5, p.miArea));
    case "lv": return 0.08 + 0.0042 * Math.max(q.m, q.a);
    case "rv": return 0.1 + 0.0042 * Math.max(q.m, q.a);
    case "av": return Math.min(3.8, 0.2 + 0.011 * q.a / Math.max(0.5, p.aoArea));
    default: return 0.16 + 0.0032 * q.a + 0.003 * (q.p / p.R);
  }
}
let particleBuf = null;
const jetColor = [1, 0.72, 0.15];
const WIG = { ivc: [100, 108], ej: [108, 158], ivr: [158, 166], rapid: [166, 190], diast: [190, 232], atrial: [232, 264] };
const SEG_NAMES = ["Contração isovolumétrica", "Ejeção", "Relaxamento isovolumétrico", "Afluxo rápido", "Diástase", "Sístole atrial"];
function cycleInfo() {
  const ev = sim.ev, ph = phaseOf(sim.t), mc = ev.mc;
  const rel = (x) => (((x - mc) % 1) + 1) % 1;
  const tAO = rel(ev.ao), tAC = rel(ev.ac), tMO = rel(ev.mo), tAS = rel(0.88);
  const tRP = tMO + 0.3 * (tAS - tMO);
  const a = [[0, 100], [Math.max(tAO, 0.005), 108], [Math.max(tAC, tAO + 0.01), 158], [Math.max(tMO, tAC + 0.01), 166], [Math.max(tRP, tMO + 0.01), 190], [Math.max(tAS, tRP + 0.01), 232], [1, 264]];
  const u = rel(ph);
  let i = 0; while (i < a.length - 2 && u > a[i + 1][0]) i++;
  const f = clamp01((u - a[i][0]) / Math.max(1e-6, a[i + 1][0] - a[i][0]));
  const wx = a[i][1] + (a[i + 1][1] - a[i][1]) * f;
  const sx = u <= tAC ? 117 + (212 - 117) * (u / Math.max(tAC, 1e-6)) : 212 + (365 - 212) * ((u - tAC) / Math.max(1e-6, 1 - tAC));
  return { u, wx, sx, seg: i, name: SEG_NAMES[i] };
}
function frame(ms) {
  requestAnimationFrame(frame);
  if (!lastMs) lastMs = ms;
  const dt = Math.min((ms - lastMs) / 1000, 1 / 15); lastMs = ms;
  if (S.playing) {
    const dsim = dt / SLOW, n = Math.max(1, Math.round(dsim / 0.0005));
    for (let i = 0; i < n; i++) step(sim, dsim / n);
    S.idle += dt;
  }
  const p = sim.p;
  // sons discretos
  const fired = sim.fired || [];
  while (fired.length) {
    const e = fired.shift();
    if (!S.playing) continue;
    if (e === "S1") { thump(58, 0.12, 0.95); thump(92, 0.09, 0.6); AUD.env.s1 = 1; }
    if (e === "S2") { const soft = p.aoArea < 1.5 ? 0.35 : 1; thump(118, 0.09, 0.62 * soft); thump(165, 0.06, 0.4 * soft); AUD.env.s2 = soft; }
    if (e === "MO" && p.miArea < 2.2) { click(950, 0.04, 0.7); AUD.env.snap = 1; }
  }
  const decay = Math.exp(-dt / (0.06 * SLOW));
  AUD.env.s1 *= decay; AUD.env.s2 *= decay; AUD.env.snap *= decay;
  const amps = murmurAmps(p);
  if (AUD.ctx && AUD.on) {
    const tt = AUD.ctx.currentTime;
    for (const [k, branch] of Object.entries(AUD.g)) branch.g.gain.setTargetAtTime(AUD.murmurs && S.playing ? amps[k] * branch.gain * 0.22 * AUD.vol : 0, tt, 0.02);
  }
  const cyc = cycleInfo();
  if (S.playing) drawPcg(cyc.u, { as: amps.as, mr: amps.mr, ar: amps.ar, ms: amps.ms });
  window.dispatchEvent(new CustomEvent("heart-cycle", { detail: cyc }));

  // escalas: cavidades (sangue) e parede (tecido)
  const cLV = Math.pow(Math.max(20, sim.vv) / REF.edv, 1 / 3);
  const hyp = clamp01((p.Es - 1.8) / 1.2) * 0.1;
  const laVol = 25 + sim.pla * p.Cla;
  const cLA = Math.pow(Math.max(18, laVol) / (25 + 9 * 3.5), 1 / 3);
  const rvC = 0.94 + (cLV - 1) * 0.8;
  const raC = 0.98 + 0.05 * Math.sin(2 * Math.PI * phaseOf(sim.t) * 1) + (cLA - 1) * 0.3;
  factors.lv = cLV; factors.lvOut = 0.5 + 0.5 * cLV + hyp;
  factors.rv = rvC; factors.rvOut = 0.5 + 0.5 * rvC;
  factors.la = cLA; factors.laOut = 0.62 + 0.38 * cLA;
  factors.ra = raC; factors.raOut = 0.62 + 0.38 * raC;
  factors.ao = 1 + 0.07 * (sim.pao - 80) / 60; factors.rv2 = 1; factors.ra2 = 1; factors.la2 = 0.9 + 0.1 * cLA; factors.none = 1;
  const k = 1 - Math.exp(-dt / 0.03);
  sm.m += (sim.sm - sm.m) * k; sm.a += (sim.sa - sm.a) * k; sm.mb += (sim.smb - sm.mb) * k; sm.ab += (sim.sab - sm.ab) * k;

  const aspect = viewport.w / viewport.h;
  const yaw = S.yaw + (S.idle > 4 && !matchMedia("(prefers-reduced-motion: reduce)").matches ? 0.2 * Math.sin(ms / 3200) : 0);
  const VM = viewMatrix(yaw, S.pitch, S.dist, [0.0, -0.06]);
  const VP = mul4(perspective(0.62, aspect, 0.5, 30), VM);
  const cyw = Math.cos(yaw), syw = Math.sin(yaw), cpw = Math.cos(S.pitch), spw = Math.sin(S.pitch);
  const camPos = [-S.dist * cpw * syw, S.dist * spw, S.dist * cpw * cyw];

  gl.viewport(0, 0, viewport.w, viewport.h);
  gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.DEPTH_TEST); gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.disable(gl.CULL_FACE);
  resetAttribs();
  gl.useProgram(tissue);
  const U = (n) => gl.getUniformLocation(tissue, n);
  gl.uniformMatrix4fv(U("uVP"), false, new Float32Array(VP));
  gl.uniform3fv(U("uCam"), camPos);
  gl.uniform1f(U("uCut"), 0.12); gl.uniform1f(U("uCutOn"), S.cut ? 1 : 0);
  const aloc = (n) => gl.getAttribLocation(tissue, n);
  const bindMesh = (m) => {
    gl.bindBuffer(gl.ARRAY_BUFFER, m.vb); gl.enableVertexAttribArray(aloc("aPos")); gl.vertexAttribPointer(aloc("aPos"), 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, m.nb); gl.enableVertexAttribArray(aloc("aNrm")); gl.vertexAttribPointer(aloc("aNrm"), 3, gl.FLOAT, false, 0, 0);
  };
  const translucent = S.flow || S.blood;
  const drawMesh = (part, { alpha, rim, rimColor, shine, color, inner }) => {
    const key = part.scale;
    gl.uniform3fv(U("uColor"), color || part.color); gl.uniform3fv(U("uInner"), inner || part.inner || color || part.color);
    gl.uniform3fv(U("uPivot"), part.pivot || [0, 0, 0]);
    gl.uniform1f(U("uScale"), key && factors[key] !== undefined ? factors[key] : 1);
    gl.uniform1f(U("uAlpha"), alpha); gl.uniform1f(U("uRim"), rim); gl.uniform3fv(U("uRimColor"), rimColor); gl.uniform1f(U("uShine"), shine ? 1 : 0);
    bindMesh(part);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, part.ib);
    gl.drawElements(gl.TRIANGLES, part.count, gl.UNSIGNED_SHORT, 0);
  };
  const rimOf = (side) => (side === "R" ? [0.35, 0.55, 1.0] : side === "L" ? [1.0, 0.35, 0.3] : [0.95, 0.85, 0.75]);

  // 1) sangue (volume), opaco
  if (S.blood) {
    gl.depthMask(true);
    for (const b of BLOODS) drawMesh(b, { alpha: 1, rim: 0.35, rimColor: rimOf(b.side), shine: true });
  }
  // 2) folhetos e anéis valvares
  const rhoOf = (area, full, open) => Math.min(1, Math.sqrt(Math.max(0, area) / full)) * open;
  const stiffM = p.miArea < 2.2, stiffA = p.aoArea < 2.0;
  const vdraw = [
    ["mitral", rhoOf(p.miArea, 4.5, sm.m), p.miLeak > 0.02 ? 1 - Math.min(0.46, p.miLeak * 0.8) : 1, stiffM],
    ["aortic", rhoOf(p.aoArea, 4.0, sm.a), p.aoLeak > 0.02 ? 1 - Math.min(0.42, p.aoLeak * 0.8) : 1, stiffA],
    ["tricuspid", rhoOf(4.5, 4.5, sm.m), 1, false],
    ["pulmonary", rhoOf(4.0, 4.0, sm.a), 1, false],
  ];
  gl.depthMask(!translucent || S.blood);
  for (const [name, rho, gapLen, stiff] of vdraw) {
    const v = VALVES[name];
    leaflets(v, rho, gapLen, stiff ? 0.1 : 0.22);
    gl.uniform3fv(U("uColor"), stiff ? [0.94, 0.88, 0.7] : [0.9, 0.62, 0.55]); gl.uniform3fv(U("uInner"), stiff ? [0.78, 0.7, 0.55] : [0.74, 0.46, 0.4]);
    gl.uniform3fv(U("uPivot"), [0, 0, 0]); gl.uniform1f(U("uScale"), 1);
    gl.uniform1f(U("uAlpha"), translucent && !S.blood ? 0.6 : 1); gl.uniform1f(U("uRim"), translucent ? 1 : 0.3); gl.uniform3fv(U("uRimColor"), [0.95, 0.85, 0.75]); gl.uniform1f(U("uShine"), 0);
    bindMesh(v);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, v.ib);
    gl.drawElements(gl.TRIANGLES, v.count_idx, gl.UNSIGNED_SHORT, 0);
  }
  // 3) tecido (opaco; ou translúcido com sangue/fluxo)
  const order = PARTS.map((part) => part);
  if (translucent) {
    const mid = (part) => { const m = part.mesh.pos; let x = 0, y = 0, z = 0, c = 0; for (let i = 0; i < m.length; i += 30) { x += m[i]; y += m[i + 1]; z += m[i + 2]; c++; } return xform(VM, [x / c, y / c, z / c])[2]; };
    order.sort((a, b) => mid(a) - mid(b));
    gl.depthMask(false);
  }
  for (const part of order) {
    if (part.inside && !translucent && !S.cut) continue;
    const alpha = translucent ? (part.ring ? 0.55 : part.decor ? (S.blood ? 0.55 : 0.3) : S.blood ? 0.2 : 0.12) : 1;
    drawMesh(part, { alpha, rim: translucent ? 1.0 : 0.25, rimColor: rimOf(part.ring ? "" : part.side), shine: false });
  }
  gl.depthMask(true);
  // 4) cordas tendíneas (valva mitral → músculos papilares)
  {
    const v = VALVES.mitral, per = GRID_S * GRID_T, lines = [];
    const tip = (l, t) => { const o = (l * per + (GRID_S - 1) * GRID_T + t) * 3; return [v.pos[o], v.pos[o + 1], v.pos[o + 2]]; };
    const lvScale = factors.lv;
    const pap = papT.map((q) => V.add(CH.lv.pivot, V.mul(V.sub(q, CH.lv.pivot), lvScale)));
    for (let l = 0; l < v.count; l++) for (let t = 1; t < GRID_T - 1; t++) { const a = tip(l, t); lines.push(...a, ...pap[(l + t) % 2]); }
    resetAttribs();
    gl.useProgram(lineP);
    gl.bindBuffer(gl.ARRAY_BUFFER, chordBuf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(lines), gl.DYNAMIC_DRAW);
    const l0 = gl.getAttribLocation(lineP, "aPos"); gl.enableVertexAttribArray(l0); gl.vertexAttribPointer(l0, 3, gl.FLOAT, false, 0, 0);
    gl.uniformMatrix4fv(gl.getUniformLocation(lineP, "uVP"), false, new Float32Array(VP));
    gl.uniform4f(gl.getUniformLocation(lineP, "uC"), 0.95, 0.9, 0.8, S.cut || translucent ? 0.85 : 0.0);
    if (S.cut || translucent) gl.drawArrays(gl.LINES, 0, lines.length / 3);
    resetAttribs();
    gl.useProgram(tissue);
  }
  if (S.flow) drawParticles(dt, VP);
  // rótulos (com volumes)
  labelEls.forEach((el, i) => {
    const [name, pos, kind] = LABELS[i];
    const c = xform(VP, pos);
    let text = name;
    if (S.blood && name === "VE") text = "VE · " + Math.round(sim.vv) + " mL";
    if (S.blood && name === "AE") text = "AE · " + Math.round(25 + sim.pla * p.Cla) + " mL";
    if (S.blood && name === "Ao") text = "Ao · " + Math.round(sim.pao) + " mmHg";
    if (el.textContent !== text) el.textContent = text;
    el.style.display = S.labels ? "" : "none";
    el.style.left = ((c[0] * 0.5 + 0.5) * 100).toFixed(2) + "%";
    el.style.top = ((1 - (c[1] * 0.5 + 0.5)) * 100).toFixed(2) + "%";
  });
  const text = "PAE " + sim.pla.toFixed(0) + " · PVE " + sim.plv.toFixed(0) + " · PAo " + sim.pao.toFixed(0) + " mmHg";
  if (text !== readout.textContent) readout.textContent = text;
  if (sim.beat !== frame.beat || ms - (frame.t || 0) > 250) {
    frame.t = ms; frame.beat = sim.beat;
    window.dispatchEvent(new CustomEvent("heart-metrics", { detail: { state: sim, metrics: sim.beat ? { b: sim.beat } : null } }));
  }
}

function nodePos(node) {
  const [p, ch] = node;
  const key = ch === "la" ? "la" : ch === "lv" ? "lv" : ch === "rv" ? "rv" : ch === "ra" ? "ra" : ch === "ao" ? "ao" : ch === "pa" ? "rv2" : "none";
  const f = factors[key] || 1;
  const piv = CH[ch] ? CH[ch].pivot : ch === "ao" ? [0.2, 0.7, -0.1] : ch === "pa" ? [-0.1, 0.8, 0.2] : [0, 0, 0];
  return V.add(piv, V.mul(V.sub(p, piv), f));
}
function sample(path, s) {
  const total = path.total, d = ((s % total) + total) % total;
  let i = 1; while (i < path.arc.length - 1 && path.arc[i] < d) i++;
  const t = (d - path.arc[i - 1]) / Math.max(1e-6, path.arc[i] - path.arc[i - 1]);
  const a = path.nodes[i - 1], b = path.nodes[i];
  return { p: V.lerp(nodePos(a), nodePos(b), t), r: a[2] + (b[2] - a[2]) * t, kind: a[3], t, dir: V.norm(V.sub(nodePos(b), nodePos(a))) };
}
function drawParticles(dt, VP) {
  const p = sim.p, q = { m: sim.qm, a: sim.qa, p: sim.pao }, out = [];
  const rhoM = Math.sqrt(Math.max(0.02, p.miArea) / 4.5), rhoA = Math.sqrt(Math.max(0.02, p.aoArea) / 4.0);
  for (const part of particles) {
    const path = paths[part.side][part.lane];
    const sp = speedFor(sample(path, part.s).kind, q, p);
    part.s += sp * dt;
    if (part.s > path.total + 0.01) part.s -= path.total;
    for (let tr = 0; tr < 3; tr++) {
      const back = tr * Math.min(0.16, 0.025 + sp * 0.03);
      const sm_ = sample(path, part.s - back);
      const [u, v] = perp(sm_.dir);
      let r = sm_.r * 0.72;
      if (sm_.kind === "mv" && part.side === "left") r *= rhoM;
      if (sm_.kind === "av" && part.side === "left") r *= rhoA;
      const turb = (sm_.kind === "lv" && part.side === "left" ? Math.max(0, sp - 0.5) * 0.015 : 0) + (sm_.kind === "ao" && part.side === "left" && p.aoArea < 1.5 ? Math.max(0, sp - 0.5) * 0.03 : 0);
      const jit = turb * Math.sin(part.j + sim.t * 90 + tr);
      const o = V.add(sm_.p, V.add(V.mul(u, Math.cos(part.a) * part.b * r + jit), V.mul(v, Math.sin(part.a) * part.b * r + jit * 0.7)));
      const fast = clamp01((sp - 0.5) / 2.5), left = part.side === "left";
      const col = left ? [1, 0.28 + 0.35 * fast, 0.24 + 0.2 * fast] : [0.3 + 0.2 * fast, 0.52 + 0.2 * fast, 1];
      out.push(o[0], o[1], o[2], col[0], col[1], col[2], (1.0 - tr * 0.3) * (0.6 + 0.4 * clamp01(sm_.t < 0.1 ? sm_.t * 10 : 1)), part.size * (1 - tr * 0.2) * (1 + fast * 0.6) * 17);
    }
  }
  const jetOf = (list, a, b, back, width) => {
    const on = clamp01(back / 40);
    if (on < 0.02) return;
    const dirv = V.norm(V.sub(b, a)), [u, v] = perp(dirv), L = V.len(V.sub(b, a));
    for (const j of list) {
      j.s += dt * (0.9 + back * 0.006); if (j.s > 1) j.s -= 1;
      for (let tr = 0; tr < 3; tr++) {
        const s = Math.max(0, j.s - tr * 0.05), rr = (0.02 + s * width) * j.b;
        const c = V.add(V.add(a, V.mul(dirv, s * L)), V.add(V.mul(u, Math.cos(j.a + s * 9) * rr), V.mul(v, Math.sin(j.a + s * 9) * rr)));
        out.push(c[0], c[1], c[2], jetColor[0], jetColor[1], jetColor[2], on * (1.0 - tr * 0.28) * (1 - s * 0.4), 22 * (1 - tr * 0.2));
      }
    }
  };
  jetOf(jets.mr, [0.2, 0.2, -0.26], nodePos([[0.22, 0.6, -0.5], "la"]), sim.qmBack, 0.2);
  jetOf(jets.ar, [0.07, 0.34, -0.02], nodePos([[0.28, -0.08, -0.06], "lv"]), sim.qaBack, 0.14);
  const data = new Float32Array(out), n = data.length / 8;
  resetAttribs();
  gl.useProgram(pts);
  if (!particleBuf) particleBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, particleBuf); gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
  const A = (n_, size, off) => { const l = gl.getAttribLocation(pts, n_); gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, size, gl.FLOAT, false, 32, off); };
  A("aPos", 3, 0); A("aCol", 4, 12); A("aSize", 1, 28);
  gl.uniformMatrix4fv(gl.getUniformLocation(pts, "uVP"), false, new Float32Array(VP));
  gl.uniform1f(gl.getUniformLocation(pts, "uPx"), viewport.dpr * 0.62 * S.dist);
  gl.disable(gl.DEPTH_TEST); gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
  gl.drawArrays(gl.POINTS, 0, n);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.enable(gl.DEPTH_TEST);
  resetAttribs();
  gl.useProgram(tissue);
}

// ─────────── comandos externos ───────────
const on = (n, f) => window.addEventListener(n, (e) => f(e.detail));
on("heart-case", (id) => { S.kase = id; reset(); pcgLast = -1; });
on("heart-sev", (v) => { S.sev = v; reset(); });
on("heart-play", (v) => { S.playing = v; });
on("heart-flow", (v) => { S.flow = v; });
on("heart-blood", (v) => { S.blood = v; });
on("heart-cut", (v) => { S.cut = v; });
on("heart-labels", (v) => { S.labels = v; });
on("heart-speed", (v) => { SLOW = v; });
on("heart-audio", (v) => setAudio(v));
on("heart-beats", (v) => { AUD.beats = v; });
on("heart-murmurs", (v) => { AUD.murmurs = v; });
on("heart-view", () => { S.yaw = -0.5; S.pitch = 0.12; S.dist = 4.6; S.idle = 0; });
if (matchMedia("(prefers-reduced-motion: reduce)").matches) S.playing = false;
requestAnimationFrame(frame);
