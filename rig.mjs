// Modelo do coração esquerdo (parâmetros concentrados). Puro: sem DOM.
// Unidades: mmHg, mL, s, cm². Fluxo por orifício: lei de Gorlin, Q = 44,3 · A · √ΔP (mL/s).
// Cada peça da bancada é movida por este mesmo estado.

const GORLIN = 44.3;
const BEAT = 0.8; // 75 bpm
const SYSTOLE = 0.42; // fração do ciclo em sístole

const BASE = {
  aoArea: 4.0, // área valvar aórtica (cm²)
  aoLeak: 0, // área efetiva do orifício regurgitante aórtico (ORE, cm²)
  miArea: 4.5, // área valvar mitral (cm²)
  miLeak: 0, // ORE mitral (cm²)
  Es: 1.8, // elastância sistólica do VE (mmHg/mL)
  Ed: 0.07, // elastância diastólica
  V0: 20, // volume morto do VE (mL)
  Cla: 3.5, // complacência do átrio esquerdo (mL/mmHg)
  Cao: 1.9, // complacência arterial (mL/mmHg)
  R: 1.05, // resistência periférica (mmHg·s/mL)
  Qpv: 87, // retorno venoso pulmonar (mL/s)
};

export const CASES = {
  normal: { ...BASE },
  ea: { ...BASE, aoArea: 0.9, Es: 2.6, Ed: 0.16, V0: 14 }, // estenose aórtica grave + hipertrofia do VE
  ia: { ...BASE, aoLeak: 0.35, V0: 48, Ed: 0.045, Cao: 1.4, Es: 1.5 }, // insuficiência aórtica grave + VE dilatado
  em: { ...BASE, miArea: 0.9, Cla: 5.5 }, // estenose mitral grave + AE dilatado
  im: { ...BASE, miLeak: 0.6, Cla: 6.0, Es: 1.9 }, // insuficiência mitral primária grave
};

export const activation = (t) => {
  const phase = (t % BEAT) / BEAT;
  return phase < SYSTOLE ? Math.sin((Math.PI * phase) / SYSTOLE) : 0;
};

export function start(params) {
  return { p: params, t: 0, pla: 8, vv: 120, pao: 80, plv: 8, qm: 0, qa: 0, qmBack: 0, qaBack: 0, sm: 0, sa: 0, smb: 0, sab: 0, beat: null, cur: fresh() };
}

function fresh() {
  return { vmax: 0, vmin: 1e9, sv: 0, back: 0, back2: 0, gradSum: 0, gradN: 0, mgSum: 0, mgN: 0, plvMax: 0, paoMax: 0, paoMin: 1e9, plaMax: 0, plaMin: 1e9, fwdIn: 0 };
}

export function step(s, dt) {
  const { p } = s;
  const phaseNow = (s.t % BEAT) / BEAT;
  const kick = phaseNow > 0.88 ? 6 * Math.sin((Math.PI * (phaseNow - 0.88)) / 0.12) : 0;
  const e = p.Ed + (p.Es - p.Ed) * activation(s.t);
  const plv = e * (s.vv - p.V0);
  const dm = Math.max(s.pla + kick - plv, 0);
  const dmBack = Math.max(plv - s.pla, 0);
  const da = Math.max(plv - s.pao, 0);
  const daBack = Math.max(s.pao - plv, 0);
  const qm = GORLIN * p.miArea * Math.sqrt(dm);
  const qmBack = GORLIN * p.miLeak * Math.sqrt(dmBack);
  const qa = GORLIN * p.aoArea * Math.sqrt(da);
  const qaBack = GORLIN * p.aoLeak * Math.sqrt(daBack);
  s.pla = Math.max(0, s.pla + ((p.Qpv - qm + qmBack) / p.Cla) * dt);
  s.vv += (qm - qmBack - qa + qaBack) * dt;
  s.pao = Math.max(0, s.pao + ((qa - qaBack - s.pao / p.R) / p.Cao) * dt);
  s.plv = plv;
  s.dm = dm;
  s.da = da;
  s.dmBack = dmBack;
  s.daBack = daBack;
  s.qm = qm;
  s.qa = qa;
  s.qmBack = qmBack;
  s.qaBack = qaBack;
  // posição das portas: seguem o sentido do fluxo, com atraso de 15 ms
  const follow = 1 - Math.exp(-dt / 0.015);
  s.sm += ((qm > 2 ? 1 : 0) - s.sm) * follow;
  s.sa += ((qa > 2 ? 1 : 0) - s.sa) * follow;
  s.smb += ((qmBack > 2 ? 1 : 0) - s.smb) * follow;
  s.sab += ((qaBack > 2 ? 1 : 0) - s.sab) * follow;
  const was = s.was || (s.was = { m: false, a: false, mb: false });
  const m = qm > 2, a = qa > 2;
  const ph = (s.t % BEAT) / BEAT;
  const ev = s.ev || (s.ev = { mc: 0.0, ao: 0.04, ac: 0.4, mo: 0.46 });
  const fire = s.fired || (s.fired = []);
  if (was.m && !m) { ev.mc = ph; fire.push("S1"); }
  if (!was.m && m) { ev.mo = ph; fire.push("MO"); }
  if (!was.a && a) { ev.ao = ph; fire.push("AO"); }
  if (was.a && !a) { ev.ac = ph; fire.push("S2"); }
  was.m = m; was.a = a;
  const c = s.cur;
  c.vmax = Math.max(c.vmax, s.vv);
  c.vmin = Math.min(c.vmin, s.vv);
  c.sv += qa * dt;
  c.back += qaBack * dt;
  c.back2 += qmBack * dt;
  c.fwdIn += qm * dt;
  if (qa > 2) {
    c.gradSum += da;
    c.gradN += 1;
  }
  if (qm > 2) {
    c.mgSum += dm;
    c.mgN += 1;
  }
  c.plvMax = Math.max(c.plvMax, plv);
  c.paoMax = Math.max(c.paoMax, s.pao);
  c.paoMin = Math.min(c.paoMin, s.pao);
  c.plaMax = Math.max(c.plaMax, s.pla);
  c.plaMin = Math.min(c.plaMin, s.pla);
  const before = s.t;
  s.t += dt;
  if (Math.floor(s.t / BEAT) > Math.floor(before / BEAT)) {
    const edv = c.vmax;
    const esv = c.vmin;
    s.beat = {
      edv,
      esv,
      sv: c.sv,
      ef: edv > 0 ? (edv - esv) / edv : 0,
      co: Math.max(0, edv - esv - c.back - c.back2) * (60 / BEAT) / 1000,
      rf: edv > esv ? (c.back + c.back2) / (edv - esv) : 0,
      gradMean: c.gradN ? c.gradSum / c.gradN : 0,
      gradMi: c.mgN ? c.mgSum / c.mgN : 0,
      plvMax: c.plvMax,
      paoMax: c.paoMax,
      paoMin: c.paoMin,
      plaMax: c.plaMax,
      plaMean: 0,
      reg: c.back + c.back2,
    };
    s.cur = fresh();
  }
}

export function settle(s, seconds, dt = 0.0005) {
  for (let i = 0; i < seconds / dt; i++) step(s, dt);
}

export const BEAT_SECONDS = BEAT;
