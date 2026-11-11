import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "./kit/iso-kit.mjs";
import { kitScript } from "./scripts/inline-kit.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const theme = process.argv.includes("--light") ? "light" : "dark";

const WIDTH = 940;
const HEIGHT = 470;

// ───────────── mundo (x direita, y profundidade, z para cima) ─────────────
const PLATE = { x: -225, y: -92, w: 460, d: 168, r: 10 };
const PLATE_H = 12;
const FOOT_H = 5;
const WALL = 3; // espessura das paredes
const LIP = 12; // paredes baixas (corte aberto)
const PORT_Z = 7; // eixo dos dutos
const ROW = 0; // duto principal em y = 0
const LEAK = 26; // duto de refluxo em y = 26

const LA = { x: -196, y: -40, w: 72, d: 80, r: 3, wall: 66 };
const LV = { x: -68, y: -46, w: 84, d: 92, r: 3, wall: 80 };
const AO = { x: 72, y: -33, w: 54, d: 66, r: 3, wall: 100 };
const MIT = [LA.x + LA.w, LV.x]; // duto mitral: -124 .. -82
const AOR = [LV.x + LV.w, AO.x]; // duto aórtico: 2 .. 42

// ranges dos manômetros e escalas de nível
const GAUGE = { la: { x: -160, y: -70, max: 40 }, lv: { x: -26, y: -82, max: 250 }, ao: { x: 99, y: -62, max: 200 } };
const GAUGE_Z = 124;
const GAUGE_R = 17;
const LEVEL_SCALE = { la: 0.36, lv: 0.19, ao: 0.34 };

const TRAVEL = 20; // curso da haste (px) ↔ área máxima
const AMAX = 4.5; // cm² no fim do curso
const LEAK_AMAX = 1.0;

const STEM_BASE = 24;
const BRIDGE_Z = 40;

const P = k.fitProjection(
  [
    ...k.boxCorners(PLATE, -PLATE_H - FOOT_H, 0),
    [GAUGE.ao.x + 20, GAUGE.ao.y, GAUGE_Z + 6],
    [GAUGE.lv.x, GAUGE.lv.y - 12, 0],
    [GAUGE.la.x - 20, GAUGE.la.y, GAUGE_Z + 6],
    [LV.x, LV.y - 20, 118],
    [AO.x + AO.w + 30, 0, 30],
    [PLATE.x + 12, 0, 20],
  ],
  WIDTH,
  HEIGHT,
  { pad: 20, azimuth: 56 },
);

const at = (point) => k.iso(point, P);
const S = (paths, style) => k.solidSvg(paths, style);
const L = (d, style) => k.lineSvg(d, style);
const D = (points, style) => k.dotsSvg(points, style);
const byDepth = (points) => [...points].sort((a, b) => k.depthOf([a[0], a[1], 0], P) - k.depthOf([b[0], b[1], 0], P));
const slab = (plan, z, h, tone = "mid", extra = {}) => S(k.slabOf(plan, z, h, P, extra.steps ?? 4, extra.bevel ?? 0.5), { tone, crease: extra.crease, lit: extra.lit });
const cyl = (x, y, r, z, h, tone = "mid", extra = {}) => S(k.cylinder(x, y, r, z, h, P, extra.steps ?? 28, extra.bevel ?? 0), { tone, crease: extra.crease ?? "faint", lit: extra.lit });
const hTick = (face, axis, a0, z0, z1, step, every, len) => {
  // régua vertical na face de uma parede: traços horizontais
  const minor = [];
  const major = [];
  for (let z = z0, i = 0; z <= z1 + 1e-6; z += step, i++) {
    const big = i % every === 0;
    const l = big ? len[1] : len[0];
    const a = axis === "x" ? [a0, face, z] : [face, a0, z];
    const b = axis === "x" ? [a0 + l, face, z] : [face, a0 + l, z];
    (big ? major : minor).push(k.segment(a, b, P));
  }
  return { minor: minor.join(""), major: major.join("") };
};

// ───────────── base ─────────────
function plate() {
  const out = [`<path class="iso-halo" d="${k.haloOf(PLATE, -PLATE_H - FOOT_H, PLATE_H, P)}"/>`];
  for (const [x, y] of byDepth(k.corners(PLATE, 24))) {
    out.push(cyl(x, y, 8, -PLATE_H - FOOT_H, 1.8, "lo", { steps: 28 }));
    out.push(cyl(x, y, 6, -PLATE_H - FOOT_H + 1.8, FOOT_H - 1.8, "mid", { steps: 28 }));
  }
  out.push(S(k.slabOf(PLATE, -PLATE_H, PLATE_H, P, 8, 1.6), { tone: "mid" }));
  out.push(L(k.planOutline(k.insetPlan(PLATE, 5), 0, P), { tone: "lo" }));
  const screws = k.corners(PLATE, 11);
  out.push(L(screws.map(([x, y]) => k.ring(x, y, 2.4, 0, P, 16)).join(""), { tone: "lo" }));
  out.push(D(screws.map(([x, y]) => at([x, y, 0])), { size: 0.5 }));
  // régua de comprimento no bordo da frente
  const strip = { x: -205, y: PLATE.y + PLATE.d - 16, w: 410, d: 7, r: 1 };
  out.push(S(k.slabOf(strip, 0, 0.6, P, 3), { tone: "lo", crease: "none" }));
  const ticks = k.topTicks(strip.x + 4, strip.x + strip.w - 4, 5, 5, strip.y + 0.8, 0.6, [2, 3.6], P);
  out.push(L(ticks.minor, { tone: "lo" }), L(ticks.major, { tone: "mid" }));
  out.push(D([at([strip.x + 2, strip.y + 3.5, 0.6]), at([strip.x + strip.w - 2, strip.y + 3.5, 0.6])], { size: 0.45 }));
  // placa de identificação com três linhas
  const label = { x: -208, y: 52, w: 56, d: 20, r: 2 };
  out.push(S(k.slabOf(label, 0, 1.2, P, 3, 0.3), { tone: "lo", crease: "none" }));
  out.push(L([8, 12, 16].map((dy) => k.lineOnTop([label.x + 5, label.y + dy], [label.x + label.w - 5, label.y + dy], 1.2, P)).join(""), { tone: "faint" }));
  out.push(D([at([label.x + 3, label.y + 3, 1.2]), at([label.x + label.w - 3, label.y + 3, 1.2]), at([label.x + 3, label.y + label.d - 3, 1.2]), at([label.x + label.w - 3, label.y + label.d - 3, 1.2])], { size: 0.4 }));
  return out.join("");
}

// relógio do ciclo cardíaco: sístole e diástole sobre a base
const CLOCK = [206, 42];
const CLOCK_R = 21;
const CLOCK_Z = 1.2;
const SYS_SHARE = 0.42;
function clock() {
  const [x, y] = CLOCK;
  const out = [];
  out.push(S(k.cylinder(x, y, CLOCK_R + 3, 0, 4, P, 48, 0.6), { tone: "mid" }));
  out.push(S(k.cylinder(x, y, CLOCK_R, 4, 1.2, P, 48, 0.3), { tone: "hi", crease: "lo" }));
  const top = 5.2;
  const ticks = k.radialTicks(x, y, CLOCK_R - 1.2, 40, 5, top, [1.4, 3], P);
  out.push(L(ticks.minor, { tone: "lo" }), L(ticks.major, { tone: "mid" }));
  // arco da sístole (0 … 42 % do ciclo) em tom forte
  const arc = [];
  for (let i = 0; i <= 24; i++) {
    const a = (i / 24) * SYS_SHARE * Math.PI * 2;
    arc.push([x + Math.sin(a) * (CLOCK_R - 6), y - Math.cos(a) * (CLOCK_R - 6)]);
  }
  out.push(L(k.onTop(arc, top, P), { tone: "hi" }));
  out.push(k.faceTextSvg(k.topMatrix([x, y + 11], top, P, "x"), "SÍSTOLE · DIÁSTOLE", { size: 2.1, tone: "lo", anchor: "middle" }));
  out.push(L(k.ring(x, y, 2, top, P, 16), { tone: "mid" }));
  return out.join("");
}
const clockHand = (phase) => {
  const [x, y] = CLOCK;
  const a = phase * Math.PI * 2;
  return k.lineOnTop([x, y], [x + Math.sin(a) * (CLOCK_R - 3), y - Math.cos(a) * (CLOCK_R - 3)], 5.4, P);
};

// ───────────── câmaras (corte aberto: só a parede de fundo é alta) ─────────────
function tankBack(c, name) {
  const out = [];
  out.push(`<path class="iso-halo" d="${k.haloOf({ x: c.x - 2, y: c.y - 2, w: c.w + 4, d: c.d + 4, r: 4 }, 0, 2, P)}" style="filter:blur(4px)"/>`);
  out.push(S(k.slabOf({ x: c.x, y: c.y, w: c.w, d: c.d, r: c.r }, 0, 3, P, 4, 0.5), { tone: "mid" }));
  out.push(S(k.slabOf({ x: c.x, y: c.y, w: c.w, d: WALL, r: 0.8 }, 3, c.wall - 3, P, 3, 0.5), { tone: "mid" })); // fundo (−y), alta
  out.push(S(k.slabOf({ x: c.x, y: c.y + WALL, w: WALL, d: c.d - WALL, r: 0.8 }, 3, LIP + 2 - 3, P, 3, 0.4), { tone: "mid" })); // −x, baixa
  // régua de nível (mL) na face interna da parede de fundo
  const t = hTick(c.y + WALL, "x", c.x + c.w - 9, 6, c.wall - 6, 5, 5, [2, 4.2]);
  out.push(L(t.minor, { tone: "lo" }), L(t.major, { tone: "mid" }));
  out.push(L(k.rise([c.x + c.w - 9, c.y + WALL], 5, c.wall - 5, P), { tone: "lo" }));
  // rebites no topo da parede de fundo
  const rivets = [];
  for (let x = c.x + 8; x < c.x + c.w - 6; x += 12) rivets.push(at([x, c.y + WALL / 2, c.wall]));
  out.push(D(rivets, { size: 0.4 }));
  out.push(L(k.lineOnTop([c.x + 2, c.y + WALL / 2], [c.x + c.w - 2, c.y + WALL / 2], c.wall, P), { tone: "faint" }));
  return out.join("");
}
function tankFront(c) {
  const out = [];
  out.push(S(k.slabOf({ x: c.x + c.w - WALL, y: c.y + WALL, w: WALL, d: c.d - WALL, r: 0.8 }, 3, LIP - 3, P, 3, 0.4), { tone: "mid" })); // +x
  out.push(S(k.slabOf({ x: c.x, y: c.y + c.d - WALL, w: c.w - 0, d: WALL, r: 0.8 }, 3, LIP - 3, P, 3, 0.4), { tone: "mid" })); // +y
  // parafusos no topo dos lábios
  const screws = [];
  for (let x = c.x + 8; x < c.x + c.w - 6; x += 14) screws.push(at([x, c.y + c.d - WALL / 2, LIP]));
  out.push(D(screws, { size: 0.4 }));
  return out.join("");
}
const inner = (c) => ({ x: c.x + WALL, y: c.y + WALL, w: c.w - WALL * 2, d: c.d - WALL * 2, r: 1 });

// ───────────── estações de válvula ─────────────
function duct(x0, x1, y) {
  return slab({ x: x0, y: y - 4, w: x1 - x0, d: 8, r: 2 }, 3, 8, "mid", { steps: 4, bevel: 0.5 });
}
function flange(x, y) {
  return slab({ x, y: y - 6.5, w: 3, d: 13, r: 1.5 }, 1, 12, "mid", { steps: 4, bevel: 0.4 });
}
function arrow(x0, x1, y, z, dir) {
  const mid = (x0 + x1) / 2;
  const a = dir * 6;
  return L(k.lineOnTop([mid - a, y], [mid + a, y], z, P) + k.lineOnTop([mid + a, y], [mid + a - dir * 3, y - 2.2], z, P) + k.lineOnTop([mid + a, y], [mid + a - dir * 3, y + 2.2], z, P), { tone: "mid" });
}
// estação: duto principal (válvula) y=0 e duto de refluxo y=LEAK
function stationStatic(range, id) {
  const [xa, xb] = range;
  const xc = (xa + xb) / 2;
  const out = [];
  // dutos
  out.push(duct(xa, xb, ROW), duct(xa, xb, LEAK));
  for (const y of [ROW, LEAK]) out.push(flange(xa, y), flange(xb - 3, y));
  out.push(D([[xa + 1.5, ROW - 4], [xa + 1.5, ROW + 4], [xb - 1.5, ROW - 4], [xb - 1.5, ROW + 4], [xa + 1.5, LEAK - 4], [xb - 1.5, LEAK + 4]].map(([x, y]) => at([x, y, 13])), { size: 0.38 }));
  // alojamento da válvula principal
  out.push(slab({ x: xc - 9, y: ROW - 8.5, w: 18, d: 17, r: 2 }, 3, STEM_BASE - 3, "mid", { steps: 4, bevel: 0.7 }));
  out.push(L(k.planOutline({ x: xc - 7, y: ROW - 6.5, w: 14, d: 13, r: 1 }, STEM_BASE, P), { tone: "faint" }));
  out.push(D([[xc - 6.4, ROW - 5.5], [xc + 6.4, ROW - 5.5], [xc - 6.4, ROW + 5.5], [xc + 6.4, ROW + 5.5]].map(([x, y]) => at([x, y, STEM_BASE])), { size: 0.38 }));
  // suporte e ponte do batente (atrás da haste)
  out.push(slab({ x: xc + 5.5, y: ROW - 8.5, w: 3.5, d: 3.5, r: 0.8 }, STEM_BASE, BRIDGE_Z - STEM_BASE, "mid", { steps: 3, bevel: 0.3 }));
  out.push(slab({ x: xc - 4, y: ROW - 8.5, w: 13, d: 8.6, r: 1.4 }, BRIDGE_Z, 3.2, "mid", { steps: 3, bevel: 0.4 }));
  out.push(L(k.ring(xc, ROW, 3.0, BRIDGE_Z + 3.2, P, 16), { tone: "lo" }));
  // alojamento da válvula de refluxo (agulha)
  out.push(slab({ x: xc - 6.5, y: LEAK - 6.5, w: 13, d: 13, r: 2 }, 3, 15 - 3, "mid", { steps: 4, bevel: 0.6 }));
  out.push(D([[xc - 4, LEAK + 4.2], [xc + 4, LEAK + 4.2]].map(([x, y]) => at([x, y, 15])), { size: 0.36 }));
  out.push(slab({ x: xc + 3, y: LEAK - 6.5, w: 3, d: 3, r: 0.8 }, 15, 17, "mid", { steps: 3, bevel: 0.3 }));
  out.push(slab({ x: xc - 3.5, y: LEAK - 6.5, w: 10, d: 6.5, r: 1.2 }, 30, 3, "mid", { steps: 3, bevel: 0.4 }));
  // setas: sentido normal (→) no duto principal; refluxo (←) no duto de fuga
  out.push(arrow(xa + 4, xb - 4, ROW + 0, 11, 1), arrow(xa + 4, xb - 4, LEAK, 11, -1));
  return out.join("");
}
// hastes móveis (reconstruídas por translação)
function stemMain(xc) {
  const out = [];
  out.push(cyl(xc, ROW, 2.2, STEM_BASE, 44, "hi", { steps: 16, crease: "none", lit: true }));
  out.push(cyl(xc, ROW, 6, STEM_BASE + 44, 3, "hi", { steps: 28, lit: true }));
  out.push(L(k.knurl(xc, ROW, 6, STEM_BASE + 44, STEM_BASE + 47, 24, P), { tone: "lo" }));
  out.push(D([at([xc, ROW, STEM_BASE + 47])], { size: 0.5, tone: "hi" }));
  return out.join("");
}
function stemLeak(xc) {
  const out = [];
  out.push(cyl(xc, LEAK, 1.6, 15, 28, "hi", { steps: 14, crease: "none", lit: true }));
  out.push(cyl(xc, LEAK, 4.4, 43, 3, "hi", { steps: 24, lit: true }));
  out.push(L(k.knurl(xc, LEAK, 4.4, 43, 46, 18, P), { tone: "lo" }));
  return out.join("");
}
function collar(xc) {
  return cyl(xc, ROW, 3.6, 0, 3, "mid", { steps: 20 });
}

// ───────────── manômetros ─────────────
function gaugeStatic(g, name) {
  const out = [];
  const { x, y } = g;
  out.push(`<path class="iso-halo" d="${k.haloOf({ x: x - 12, y: y - 12, w: 24, d: 24, r: 8 }, 0, 1, P)}" style="filter:blur(3px)"/>`);
  out.push(S(k.slabOf({ x: x - 11, y: y - 11, w: 22, d: 22, r: 3 }, 0, 4, P, 5, 0.6), { tone: "mid" }));
  out.push(D([[x - 8, y - 8], [x + 8, y - 8], [x - 8, y + 8], [x + 8, y + 8]].map(([a, b]) => at([a, b, 4])), { size: 0.4 }));
  out.push(cyl(x, y, 4, 4, GAUGE_Z - 4 - 8, "mid", { steps: 24, crease: "none" }));
  out.push(L([30, 60, 90].map((z) => k.sideArc(x, y, 4, z, P, 12)).join(""), { tone: "faint" }));
  out.push(S(k.slabOf({ x: x - 7, y: y - 7, w: 14, d: 14, r: 2.5 }, GAUGE_Z - 12, 4, P, 4, 0.5), { tone: "mid" }));
  out.push(cyl(x, y, GAUGE_R, GAUGE_Z - 8, 8, "hi", { steps: 48, bevel: 0.7 }));
  out.push(L(k.knurl(x, y, GAUGE_R, GAUGE_Z - 3, GAUGE_Z, 72, P, 0.3), { tone: "lo" }));
  out.push(L(k.ring(x, y, GAUGE_R - 2, GAUGE_Z, P, 48), { tone: "lo" }));
  // escala de 270°
  const ticks = k.radialTicks(x, y, GAUGE_R - 2.6, 30, 5, GAUGE_Z, [1.2, 2.6], P, (-135 * Math.PI) / 180, (270 * Math.PI) / 180);
  out.push(L(ticks.minor, { tone: "lo" }), L(ticks.major, { tone: "mid" }));
  out.push(L(k.ring(x, y, 1.7, GAUGE_Z, P, 16), { tone: "mid" }));
  out.push(k.faceTextSvg(k.topMatrix([x, y + 8.5], GAUGE_Z, P, "x"), name, { size: 2.4, tone: "mid", anchor: "middle" }));
  return out.join("");
}
const needleAt = (g, frac) => {
  const a = ((-135 + 270 * Math.max(0, Math.min(1, frac))) * Math.PI) / 180;
  return k.lineOnTop([g.x - Math.sin(a) * 3.2, g.y + Math.cos(a) * 3.2], [g.x + Math.sin(a) * (GAUGE_R - 4), g.y - Math.cos(a) * (GAUGE_R - 4)], GAUGE_Z + 0.2, P);
};

// ───────────── pórtico do ventrículo (contratilidade) ─────────────
const GANTRY_Y = LV.y - 14;
const GANTRY_POSTS = [LV.x - 8, LV.x + LV.w + 8];
function gantryStatic() {
  const out = [];
  for (const x of GANTRY_POSTS) {
    out.push(S(k.slabOf({ x: x - 8, y: GANTRY_Y - 8, w: 16, d: 16, r: 2.5 }, 0, 4, P, 4, 0.5), { tone: "mid" }));
    out.push(D([[x - 5.5, GANTRY_Y - 5.5], [x + 5.5, GANTRY_Y - 5.5], [x - 5.5, GANTRY_Y + 5.5], [x + 5.5, GANTRY_Y + 5.5]].map(([a, b]) => at([a, b, 4])), { size: 0.38 }));
    out.push(cyl(x, GANTRY_Y, 3.4, 4, 106, "mid", { steps: 24, crease: "none" }));
    out.push(L([20, 40, 60, 80, 100].map((z) => k.sideArc(x, GANTRY_Y, 3.4, z, P, 12)).join(""), { tone: "faint" }));
    out.push(cyl(x, GANTRY_Y, 4.4, 110, 2.4, "mid", { steps: 24 }));
  }
  return out.join("");
}
const BEAM = { x: GANTRY_POSTS[0] - 6, y: GANTRY_Y - 4, w: GANTRY_POSTS[1] - GANTRY_POSTS[0] + 12, d: 8, r: 1.5 };
const ARM = { x: LV.x + LV.w / 2 - 4, y: GANTRY_Y, w: 8, d: LV.y + LV.d / 2 - GANTRY_Y, r: 1.5 };
const PRESS = [LV.x + LV.w / 2, LV.y + LV.d / 2];
const PRESS_R = 29;
const COIL_R = 7.5;
function armSvg(z) {
  const out = [];
  out.push(slab(BEAM, z, 7, "mid", { steps: 3, bevel: 0.5 }));
  for (const x of GANTRY_POSTS) out.push(slab({ x: x - 5.5, y: GANTRY_Y - 5.5, w: 11, d: 11, r: 2 }, z - 1.5, 10, "hi", { steps: 4, bevel: 0.6, lit: true }));
  out.push(slab(ARM, z + 1, 5, "mid", { steps: 3, bevel: 0.4 }));
  out.push(D([at([ARM.x + 4, ARM.y + 6, z + 6]), at([ARM.x + 4, ARM.y + ARM.d - 8, z + 6])], { size: 0.4 }));
  out.push(cyl(PRESS[0], PRESS[1], 9, z - 1, 7, "hi", { steps: 28, bevel: 0.5, lit: true }));
  out.push(L(k.knurl(PRESS[0], PRESS[1], 9, z - 1, z + 6, 24, P), { tone: "lo" }));
  return out.join("");
}
function plateSvg(z) {
  return cyl(PRESS[0], PRESS[1], PRESS_R, z, 3, "hi", { steps: 48, bevel: 0.5 }) + L(k.ring(PRESS[0], PRESS[1], PRESS_R - 3, z + 3, P, 48), { tone: "faint" });
}

// ───────────── entrada pulmonar e saída periférica ─────────────
function inflow() {
  const out = [];
  const x0 = PLATE.x + 12;
  out.push(slab({ x: x0, y: -12, w: 20, d: 24, r: 3 }, 3, 16, "mid", { steps: 4, bevel: 0.7 })); // bomba
  out.push(L(k.planOutline({ x: x0 + 3, y: -9, w: 14, d: 18, r: 1.5 }, 19, P), { tone: "faint" }));
  out.push(cyl(x0 + 10, 0, 5, 19, 5, "mid", { steps: 24 }));
  out.push(L(k.knurl(x0 + 10, 0, 5, 19, 24, 20, P), { tone: "lo" }));
  out.push(D([[x0 + 3, -9], [x0 + 17, -9], [x0 + 3, 9], [x0 + 17, 9]].map(([a, b]) => at([a, b, 19])), { size: 0.38 }));
  out.push(duct(x0 + 20, LA.x, ROW));
  out.push(flange(x0 + 20, ROW), flange(LA.x - 3, ROW));
  out.push(arrow(x0 + 22, LA.x - 3, ROW, 11, 1));
  out.push(k.faceTextSvg(k.topMatrix([x0 + 10, 21], 0, P, "x"), "VEIAS PULM.", { size: 2.4, tone: "lo", anchor: "middle" }));
  return out.join("");
}
const OUT_X = [AO.x + AO.w, AO.x + AO.w + 38];
function outflow() {
  const out = [];
  out.push(duct(OUT_X[0], OUT_X[1], ROW));
  out.push(flange(OUT_X[0], ROW));
  const xv = OUT_X[0] + 18;
  out.push(slab({ x: xv - 7, y: -7, w: 14, d: 14, r: 2 }, 3, 15 - 3, "mid", { steps: 4, bevel: 0.6 }));
  out.push(cyl(xv, 0, 2.2, 15, 12, "mid", { steps: 16, crease: "none" }));
  out.push(cyl(xv, 0, 5.6, 27, 3, "mid", { steps: 24 }));
  out.push(L(k.knurl(xv, 0, 5.6, 27, 30, 22, P), { tone: "lo" }));
  out.push(L(k.lineOnTop([xv, 0], [xv + 5.6, 0], 30, P), { tone: "hi" }));
  out.push(D([at([xv, 0, 30])], { size: 0.5, tone: "hi" }));
  // calha de retorno
  out.push(slab({ x: OUT_X[1] - 2, y: -14, w: 18, d: 28, r: 3 }, 0, 6, "lo", { steps: 4, bevel: 0.4 }));
  out.push(L(k.planOutline({ x: OUT_X[1] + 0.5, y: -11.5, w: 13, d: 23, r: 2 }, 6, P), { tone: "faint" }));
  out.push(arrow(OUT_X[0] + 3, OUT_X[1], ROW, 11, 1));
  out.push(k.faceTextSvg(k.topMatrix([xv, 18], 0, P, "x"), "RESIST. PERIF.", { size: 2.4, tone: "lo", anchor: "middle" }));
  return out.join("");
}

// ───────────── legendas gravadas na base ─────────────
function engraving() {
  const out = [];
  const put = (x, y, text) => out.push(k.faceTextSvg(k.topMatrix([x, y], 0, P, "x"), text, { size: 4, tone: "mid", anchor: "middle" }));
  put(LA.x + LA.w / 2, LA.y + LA.d + 12, "ÁTRIO ESQ.");
  put(LV.x + LV.w / 2, LV.y + LV.d + 12, "VENTRÍCULO ESQ.");
  put(AO.x + AO.w / 2, AO.y + AO.d + 12, "AORTA");
  put((MIT[0] + MIT[1]) / 2, 42, "V. MITRAL");
  put((AOR[0] + AOR[1]) / 2, 42, "V. AÓRTICA");
  return out.join("");
}

// ───────────── montagem (de trás para a frente) ─────────────
const mitC = (MIT[0] + MIT[1]) / 2;
const aorC = (AOR[0] + AOR[1]) / 2;
const GATE = (xc, id) => `<g data-part="${id}">${stemMain(xc)}</g>`;
const collarG = (xc, id) => `<g data-part="${id}">${collar(xc)}</g>`;

const body = [
  plate(),
  clock(),
  `<path data-part="hand" class="iso-line" data-tone="lit" data-free="start" d="${clockHand(0)}" style="stroke-width:1.2"/>`,
  engraving(),
  inflow(),
  `<g data-flow="in">${""}</g>`,
  gaugeStatic(GAUGE.la, "PAE"),
  `<path data-part="needle-la" class="iso-line" data-tone="lit" data-free="start" d="${needleAt(GAUGE.la, 0.2)}" style="stroke-width:1"/>`,
  gaugeStatic(GAUGE.lv, "PVE"),
  `<path data-part="needle-lv" class="iso-line" data-tone="lit" data-free="start" d="${needleAt(GAUGE.lv, 0.1)}" style="stroke-width:1"/>`,
  tankBack(LA, "la"),
  `<g data-part="liq-la"></g>`,
  tankFront(LA),
  stationStatic(MIT, "mit"),
  `<g data-part="collar-mit" data-xc="${mitC}"></g>`,
  `<g data-part="gate-mit">${stemMain(mitC)}</g>`,
  `<g data-part="leak-mit">${stemLeak(mitC)}</g>`,
  `<g data-dots="mit-main"></g><g data-dots="mit-leak"></g>`,
  gantryStatic(),
  tankBack(LV, "lv"),
  `<g data-part="liq-lv"></g>`,
  tankFront(LV),
  `<g data-part="press"></g>`,
  stationStatic(AOR, "aor"),
  `<g data-part="collar-aor" data-xc="${aorC}"></g>`,
  `<g data-part="gate-aor">${stemMain(aorC)}</g>`,
  `<g data-part="leak-aor">${stemLeak(aorC)}</g>`,
  `<g data-dots="aor-main"></g><g data-dots="aor-leak"></g>`,
  gaugeStatic(GAUGE.ao, "PAo"),
  `<path data-part="needle-ao" class="iso-line" data-tone="lit" data-free="start" d="${needleAt(GAUGE.ao, 0.5)}" style="stroke-width:1"/>`,
  tankBack(AO, "ao"),
  `<g data-part="liq-ao"></g>`,
  tankFront(AO),
  outflow(),
  `<g data-dots="out"></g><g data-dots="in"></g>`,
];

const svg = k.figureSvg({
  width: WIDTH,
  height: HEIGHT,
  label:
    "Bancada de teste do coração esquerdo. Três tanques abertos representam o átrio esquerdo, o ventrículo esquerdo e a aorta. Entre eles, duas estações de válvula: uma comporta de haste que abre com o fluxo e um duto de refluxo com válvula de agulha. Um pórtico com mola pressiona o ventrículo e três manômetros leem as pressões.",
  body,
});

// ───────────── tempo real: o mesmo modelo move as peças ─────────────
const rig = readFileSync(join(HERE, "rig.mjs"), "utf8").replace(/^export /gm, "");
const live = `
${rig}
const P = ${JSON.stringify(P)};
const C = ${JSON.stringify({ LA, LV, AO, GAUGE, GAUGE_Z, GAUGE_R, LEVEL_SCALE, TRAVEL, AMAX, LEAK_AMAX, WALL, LIP, PORT_Z, ROW, LEAK, STEM_BASE, BRIDGE_Z, MIT, AOR, OUT_X, PRESS, PRESS_R, COIL_R, CLOCK, CLOCK_R, SYS_SHARE, BEAM, ARM, GANTRY_Y, GANTRY_POSTS })};
const ARMSVG = ${JSON.stringify("")};
const mitC = ${mitC}, aorC = ${aorC};
const stage = document.querySelector(".iso-stage");
const svg = stage.querySelector("svg");
const q = (n) => svg.querySelector('[data-part="' + n + '"]');
const el = {
  la: q("liq-la"), lv: q("liq-lv"), ao: q("liq-ao"), press: q("press"), hand: q("hand"),
  nla: q("needle-la"), nlv: q("needle-lv"), nao: q("needle-ao"),
  gm: q("gate-mit"), ga: q("gate-aor"), lm: q("leak-mit"), lao: q("leak-aor"),
  cm: q("collar-mit"), ca: q("collar-aor"),
};
const dg = (n) => svg.querySelector('[data-dots="' + n + '"]');
const dots = { mm: dg("mit-main"), ml: dg("mit-leak"), am: dg("aor-main"), al: dg("aor-leak"), out: dg("out"), inn: dg("in") };
const readout = document.querySelector("[data-readout]");
const SLOW = 4;
const S = (paths, style) => solidSvg(paths, style);
const solidRed = (paths) => solidSvg(paths, { tone: "mid", crease: "none", className: "blood" });
const inner = (c) => ({ x: c.x + C.WALL, y: c.y + C.WALL, w: c.w - C.WALL * 2, d: c.d - C.WALL * 2, r: 1 });
const lvl = (v, scale) => Math.max(0.4, v * scale);

const cyl = (x, y, r, z, h, tone, extra = {}) => S(cylinder(x, y, r, z, h, P, extra.steps || 28, extra.bevel || 0), { tone, crease: extra.crease || "faint", lit: extra.lit });
function coilZ(cx, cy, r, z0, z1, turns, perTurn = 18) {
  const n = Math.max(2, Math.round(turns * perTurn));
  const back = [], front = [];
  let run = [], near = null;
  for (let i = 0; i <= n; i++) {
    const s = i / n, a = s * turns * Math.PI * 2;
    const p = [cx + r * Math.cos(a), cy + r * Math.sin(a), z0 + (z1 - z0) * s];
    const facing = Math.cos(a) * towardViewer(P)[0] + Math.sin(a) * towardViewer(P)[1] > 0;
    const f = iso(p, P);
    if (near === null) near = facing;
    if (facing !== near) { run.push(f); (near ? front : back).push(pathOf(run)); run = [f]; near = facing; continue; }
    run.push(f);
  }
  if (run.length > 1) (near ? front : back).push(pathOf(run));
  return { back: back.join(""), front: front.join("") };
}
const needle = (g, frac) => {
  const a = ((-135 + 270 * Math.max(0, Math.min(1, frac))) * Math.PI) / 180;
  return lineOnTop([g.x - Math.sin(a) * 3.2, g.y + Math.cos(a) * 3.2], [g.x + Math.sin(a) * (C.GAUGE_R - 4), g.y - Math.cos(a) * (C.GAUGE_R - 4)], C.GAUGE_Z + 0.2, P);
};
const armSvg = (z) => {
  const slab = (plan, zz, h, tone, ex = {}) => S(slabOf(plan, zz, h, P, ex.steps || 3, ex.bevel || 0.5), { tone, lit: ex.lit });
  const o = [];
  o.push(slab(C.BEAM, z, 7, "mid", { bevel: 0.5 }));
  for (const x of C.GANTRY_POSTS) o.push(slab({ x: x - 5.5, y: C.GANTRY_Y - 5.5, w: 11, d: 11, r: 2 }, z - 1.5, 10, "hi", { steps: 4, bevel: 0.6, lit: true }));
  o.push(slab(C.ARM, z + 1, 5, "mid", { bevel: 0.4 }));
  o.push(dotsSvg([iso([C.ARM.x + 4, C.ARM.y + 6, z + 6], P), iso([C.ARM.x + 4, C.ARM.y + C.ARM.d - 8, z + 6], P)], { size: 0.4 }));
  return o.join("");
};
const boss = (z) => cyl(C.PRESS[0], C.PRESS[1], 9, z - 1, 7, "hi", { steps: 28, bevel: 0.5, lit: true }) + lineSvg(knurl(C.PRESS[0], C.PRESS[1], 9, z - 1, z + 6, 24, P), { tone: "lo" });
const plateDisc = (z) => cyl(C.PRESS[0], C.PRESS[1], C.PRESS_R, z, 3, "hi", { steps: 48, bevel: 0.5 }) + lineSvg(ring(C.PRESS[0], C.PRESS[1], C.PRESS_R - 3, z + 3, P, 48), { tone: "faint" });

let state, kase = "normal", frame = 0, last = 0, visible = false, playing = true, shown = null, since = 0;
const phases = { mm: 0, ml: 0, am: 0, al: 0, out: 0, inn: 0 };
function reset(name) {
  kase = name;
  state = start(CASES[name]);
  settle(state, 8);
  const p = state.p;
  const collar = (xc, area, target) => {
    const travel = Math.min(C.TRAVEL, (area / C.AMAX) * C.TRAVEL);
    const zc = C.BRIDGE_Z - 3 - travel;
    target.innerHTML = zc > C.STEM_BASE + 1.5 ? '<g transform="' + translateAlong(P, [0, 0, zc]) + '">' + cyl(xc, C.ROW, 3.6, 0, 3, "mid", { steps: 20 }) + "</g>" : "";
  };
  collar(mitC, p.miArea, el.cm);
  collar(aorC, p.aoArea, el.ca);
}
const stemZ = (area, s) => Math.min(C.TRAVEL, (area / C.AMAX) * C.TRAVEL * s);
const stemLeakZ = (area, s) => Math.min(24, (area / C.LEAK_AMAX) * 14 * s);

const ductDots = (list, x0, x1, y, ph, dir, on) => {
  if (!on) return "";
  const n = 6, span = x1 - x0 - 14, pts = [];
  for (let i = 0; i < n; i++) {
    const f = (((ph + i / n) % 1) + 1) % 1;
    const x = dir > 0 ? x0 + 7 + f * span : x1 - 7 - f * span;
    const edge = Math.min(f, 1 - f) * 8;
    pts.push([...iso([x, y, 11.2], P).slice(0, 2), Math.min(1, edge) * on]);
  }
  return dotsSvg(pts, { size: 0.9, tone: "lit" });
};

function draw(now) {
  const s = state, p = s.p;
  const frac = (s.t % BEAT_SECONDS) / BEAT_SECONDS;
  // tanques
  const laStored = s.pla * p.Cla, aoStored = s.pao * p.Cao;
  el.la.innerHTML = solidRed(slabOf(inner(C.LA), 3, lvl(laStored, C.LEVEL_SCALE.la), P, 3, 0));
  el.lv.innerHTML = solidRed(slabOf(inner(C.LV), 3, lvl(s.vv, C.LEVEL_SCALE.lv), P, 3, 0));
  el.ao.innerHTML = solidRed(slabOf(inner(C.AO), 3, lvl(aoStored, C.LEVEL_SCALE.ao), P, 3, 0));
  // pórtico e mola
  const act = activation(s.t);
  const top = 3 + lvl(s.vv, C.LEVEL_SCALE.lv) + 0.5;
  const coilLen = 38 - 20 * act * (p.Es / 1.8);
  const armZ = top + 3 + Math.max(10, coilLen);
  const c = coilZ(C.PRESS[0], C.PRESS[1], C.COIL_R, top + 3, armZ - 1, 6);
  el.press.innerHTML = armSvg(armZ) + plateDisc(top) + lineSvg(c.back, { tone: "mid" }) + lineSvg(c.front, { tone: "hi" }) + boss(armZ);
  // comportas e agulhas
  el.gm.setAttribute("transform", translateAlong(P, [0, 0, stemZ(p.miArea, s.sm)]));
  el.ga.setAttribute("transform", translateAlong(P, [0, 0, stemZ(p.aoArea, s.sa)]));
  el.lm.setAttribute("transform", translateAlong(P, [0, 0, stemLeakZ(p.miLeak, s.smb)]));
  el.lao.setAttribute("transform", translateAlong(P, [0, 0, stemLeakZ(p.aoLeak, s.sab)]));
  // manômetros e relógio
  el.nla.setAttribute("d", needle(C.GAUGE.la, s.pla / C.GAUGE.la.max));
  el.nlv.setAttribute("d", needle(C.GAUGE.lv, s.plv / C.GAUGE.lv.max));
  el.nao.setAttribute("d", needle(C.GAUGE.ao, s.pao / C.GAUGE.ao.max));
  const a = frac * Math.PI * 2;
  el.hand.setAttribute("d", lineOnTop([C.CLOCK[0], C.CLOCK[1]], [C.CLOCK[0] + Math.sin(a) * (C.CLOCK_R - 3), C.CLOCK[1] - Math.cos(a) * (C.CLOCK_R - 3)], 5.4, P));
  // gotas de fluxo (velocidade ∝ vazão)
  const k = 0.00045;
  const on = (q) => Math.min(1, q / 40);
  dots.mm.innerHTML = ductDots(0, C.MIT[0] + 3, C.MIT[1] - 3, C.ROW, phases.mm, 1, on(s.qm));
  dots.ml.innerHTML = ductDots(0, C.MIT[0] + 3, C.MIT[1] - 3, C.LEAK, phases.ml, -1, on(s.qmBack));
  dots.am.innerHTML = ductDots(0, C.AOR[0] + 3, C.AOR[1] - 3, C.ROW, phases.am, 1, on(s.qa));
  dots.al.innerHTML = ductDots(0, C.AOR[0] + 3, C.AOR[1] - 3, C.LEAK, phases.al, -1, on(s.qaBack));
  dots.out.innerHTML = ductDots(0, C.OUT_X[0] + 3, C.OUT_X[1], C.ROW, phases.out, 1, on(s.pao / p.R));
  dots.inn.innerHTML = ductDots(0, ${PLATE.x + 32}, ${LA.x - 3}, C.ROW, phases.inn, 1, on(p.Qpv));
  const text = "PAE " + s.pla.toFixed(0) + " · PVE " + s.plv.toFixed(0) + " · PAo " + s.pao.toFixed(0) + " mmHg";
  if (text !== shown) { readout.textContent = text; shown = text; }
}
function metrics() {
  const b = state.beat;
  if (!b) return null;
  const aoOpen = state.p.aoArea, miOpen = state.p.miArea;
  return { b, aoOpen, miOpen };
}
const phaseSpeed = (q) => Math.sign(q) * Math.min(1.1, Math.sqrt(Math.abs(q)) * 0.06);
function tick(nowMs) {
  const dt = last ? Math.min((nowMs - last) / 1000, 1 / 20) : 1 / 60;
  last = nowMs;
  if (playing) {
    const sim = dt / SLOW;
    const steps = Math.max(1, Math.round(sim / 0.0005));
    for (let i = 0; i < steps; i++) step(state, sim / steps);
    const s = state;
    phases.mm += phaseSpeed(s.qm) * dt; phases.ml += phaseSpeed(s.qmBack) * dt;
    phases.am += phaseSpeed(s.qa) * dt; phases.al += phaseSpeed(s.qaBack) * dt;
    phases.out += phaseSpeed(s.pao / s.p.R) * dt; phases.inn += phaseSpeed(s.p.Qpv) * dt;
    since += dt;
    if (since > 0.25) { since = 0; window.dispatchEvent(new CustomEvent("heart-metrics", { detail: { state, metrics: metrics() } })); }
  }
  draw(nowMs);
  frame = visible ? requestAnimationFrame(tick) : 0;
}
const run = () => { if (!frame && visible) { last = 0; frame = requestAnimationFrame(tick); } };
new IntersectionObserver((entries) => { visible = entries[entries.length - 1].isIntersecting; if (visible) run(); }, { rootMargin: "120px 0px" }).observe(stage);
window.addEventListener("heart-case", (e) => { reset(e.detail); draw(0); window.dispatchEvent(new CustomEvent("heart-metrics", { detail: { state, metrics: metrics() } })); });
window.addEventListener("heart-play", (e) => { playing = e.detail; });
reset("normal");
draw(0);
if (matchMedia("(prefers-reduced-motion: reduce)").matches) playing = false;
window.dispatchEvent(new CustomEvent("heart-metrics", { detail: { state, metrics: metrics() } }));
`;

// ───────────── painel de texto e controles ─────────────
const panel = JSON.parse(readFileSync(join(HERE, "content.json"), "utf8"));
const ui = `
<style>
.hc-bar{display:flex;flex-wrap:wrap;gap:8px;margin:16px 0 0}
.hc-bar button{font:inherit;font-size:13px;color:var(--anatomy-text);background:var(--anatomy-card);border:1px solid var(--anatomy-lo);padding:7px 12px;cursor:pointer;border-radius:0}
.hc-bar button[aria-pressed="true"]{color:var(--anatomy-strong);border-color:var(--anatomy-hi);box-shadow:inset 0 -2px 0 var(--anatomy-red)}
.hc-bar button:focus-visible{outline:2px solid var(--anatomy-hi);outline-offset:2px}
.hc-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px;margin:12px 0 0}
.hc-card{background:var(--anatomy-card);box-shadow:0 0 0 1px var(--anatomy-lo);padding:14px 16px}
.hc-card h3{margin:0 0 8px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--anatomy-muted);font-weight:600}
.hc-card p,.hc-card li{margin:0 0 6px;color:var(--anatomy-text);font-size:13.5px;line-height:1.55}
.hc-card ul{margin:0;padding-left:18px}
.hc-card b{color:var(--anatomy-strong);font-weight:600}
.hc-num{display:grid;grid-template-columns:auto 1fr auto;gap:2px 12px;font-family:var(--anatomy-mono);font-size:12.5px;color:var(--anatomy-text)}
.hc-num span:nth-child(3n){color:var(--anatomy-strong);text-align:right}
.hc-flag{display:inline-block;font-size:11px;padding:1px 6px;border:1px solid var(--anatomy-lo);margin-left:6px;color:var(--anatomy-muted)}
.hc-flag[data-on]{color:var(--anatomy-red);border-color:var(--anatomy-red)}
.hc-note{margin-top:10px;padding:10px 12px;border-left:2px solid var(--anatomy-red);background:var(--anatomy-card);font-size:12.5px;color:var(--anatomy-muted)}
.blood .iso-fill{fill:color-mix(in srgb,var(--anatomy-red) 30%,var(--anatomy-paper))}
.blood .iso-top{fill:color-mix(in srgb,var(--anatomy-red) 42%,var(--anatomy-paper))}
.blood .iso-shade{fill:color-mix(in srgb,var(--anatomy-red) 24%,var(--anatomy-paper))}
</style>
<div class="hc-bar" role="group" aria-label="Escolha a condição">
${Object.entries(panel.cases)
  .map(([id, c], i) => `<button data-case="${id}" aria-pressed="${i === 0}">${i + 1} · ${c.button}</button>`)
  .join("")}
<button data-play aria-pressed="true" aria-label="Pausar ou retomar">⏯ espaço</button>
</div>
<div class="hc-grid" data-panel>
  <div class="hc-card"><h3>Fisiopatologia</h3><div data-sec="physio"></div></div>
  <div class="hc-card"><h3>Números do modelo (ao vivo)</h3><div class="hc-num" data-nums></div><p style="margin-top:8px;font-size:12px;color:var(--anatomy-muted)">Modelo didático de parâmetros concentrados, em câmera lenta (×4). Fluxo pelo orifício: Q = 44,3 · A · √ΔP.</p></div>
  <div class="hc-card"><h3>Gravidade e critérios</h3><div data-sec="criteria"></div></div>
  <div class="hc-card"><h3>Manejo</h3><div data-sec="management"></div></div>
</div>
<div class="hc-note">${panel.disclaimer}</div>
<script type="module">
const cases = ${JSON.stringify(panel.cases)};
const $ = (s) => document.querySelector(s);
let current = "normal", latest = null;
const fill = (c) => {
  $('[data-sec="physio"]').innerHTML = c.physio.map((t) => "<p>" + t + "</p>").join("");
  $('[data-sec="criteria"]').innerHTML = "<ul>" + c.criteria.map((t) => "<li>" + t + "</li>").join("") + "</ul>";
  $('[data-sec="management"]').innerHTML = "<ul>" + c.management.map((t) => "<li>" + t + "</li>").join("") + "</ul>";
};
const pick = (id) => {
  current = id;
  document.querySelectorAll("[data-case]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.case === id)));
  fill(cases[id]);
  window.dispatchEvent(new CustomEvent("heart-case", { detail: id }));
};
document.querySelectorAll("[data-case]").forEach((b) => b.addEventListener("click", () => pick(b.dataset.case)));
const play = $("[data-play]");
let playing = true;
const toggle = () => { playing = !playing; play.setAttribute("aria-pressed", String(playing)); window.dispatchEvent(new CustomEvent("heart-play", { detail: playing })); };
play.addEventListener("click", toggle);
const ids = Object.keys(cases);
window.addEventListener("keydown", (e) => {
  if (e.target.closest && e.target.closest("button") && e.key === " ") return;
  if (/^[1-5]$/.test(e.key)) pick(ids[Number(e.key) - 1]);
  if (e.key === " ") { e.preventDefault(); toggle(); }
});
const f = (v, d = 0) => (Number.isFinite(v) ? v.toFixed(d) : "–");
window.addEventListener("heart-metrics", (e) => {
  const { state, metrics } = e.detail;
  const b = metrics && metrics.b;
  if (!b) return;
  const p = state.p;
  const row = (a, v, u, flag) => "<span>" + a + "</span><span>" + (flag ? '<i class="hc-flag" data-on>' + flag + "</i>" : "") + "</span><span>" + v + " " + u + "</span>";
  const aoSevere = p.aoArea <= 1.0, miSevere = p.miArea <= 1.5, arSevere = p.aoLeak >= 0.3, mrSevere = p.miLeak >= 0.4;
  $("[data-nums]").innerHTML = [
    row("Área valva aórtica", f(p.aoArea, 1), "cm²", aoSevere ? "grave" : ""),
    row("Gradiente médio VE–Ao", f(b.gradMean), "mmHg", b.gradMean >= 40 ? "≥ 40" : ""),
    row("Área valva mitral", f(p.miArea, 1), "cm²", miSevere ? "grave" : ""),
    row("Gradiente médio AE–VE", f(b.gradMi), "mmHg", b.gradMi >= 10 ? "≥ 10" : ""),
    row("ORE refluxo aórtico", f(p.aoLeak, 2), "cm²", arSevere ? "grave" : ""),
    row("ORE refluxo mitral", f(p.miLeak, 2), "cm²", mrSevere ? "grave" : ""),
    row("Fração regurgitante", f(b.rf * 100), "%", b.rf >= 0.5 ? "≥ 50 %" : ""),
    row("Pressão máx. VE", f(b.plvMax), "mmHg", ""),
    row("Aorta (sist/diast)", f(b.paoMax) + "/" + f(b.paoMin), "mmHg", ""),
    row("Pressão máx. AE", f(b.plaMax), "mmHg", ""),
    row("Volume diast. final VE", f(b.edv), "mL", ""),
    row("Fração de ejeção", f(b.ef * 100), "%", ""),
    row("Débito cardíaco efetivo", f(b.co, 1), "L/min", ""),
  ].join("");
});
fill(cases.normal);
</script>`;

const html = k.plateHtml({
  fig: "Fig 1",
  title: "Coração esquerdo · valvopatias",
  hint: "1–5 escolhem a condição · espaço pausa",
  readout: "PAE 8 · PVE 8 · PAo 80 mmHg",
  keys: [
    { mark: "lit", label: "Hastes das válvulas, agulhas e manômetros: o que se move com o fluxo" },
    { mark: "raised", label: "Tanques: nível = volume de sangue" },
  ],
  caption:
    "Átrio esquerdo, ventrículo esquerdo e aorta como tanques ligados por duas válvulas. A comporta abre com o fluxo; o duto paralelo com agulha reproduz o refluxo. A mola do pórtico faz o papel da contração do ventrículo.",
  body: `<div class="iso-stage" tabindex="0" role="img" aria-label="Bancada do coração esquerdo">${svg}</div>`,
});

writeFileSync(join(HERE, theme === "light" ? "coracao-light.html" : "coracao.html"), k.pageHtml({ title: "Coração esquerdo", theme, width: 980, body: html + ui, script: kitScript() + live }));
console.log("wrote", theme === "light" ? "coracao-light.html" : "coracao.html");
