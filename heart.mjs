import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "./kit/iso-kit.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const theme = process.argv.includes("--light") ? "light" : "dark";
const panel = JSON.parse(readFileSync(join(HERE, "content3d.json"), "utf8"));
const rig = readFileSync(join(HERE, "rig.mjs"), "utf8").replace(/^export /gm, "");
const live = readFileSync(join(HERE, "heart-live.js"), "utf8");
const uri = (file) => "data:image/png;base64," + readFileSync(join(HERE, "assets", file)).toString("base64");

const stage = `<div class="iso-stage hl-stage" role="img" aria-label="Coração em 3D: arraste para girar, role para aproximar"><canvas data-heart></canvas></div>`;

const figure = k.plateHtml({
  fig: "Fig 1",
  title: "Coração esquerdo · valvopatias",
  hint: "arraste para girar · roda do mouse aproxima",
  readout: "PAE 8 · PVE 8 · PAo 80 mmHg",
  keys: [
    { mark: "lit", label: "Sangue oxigenado (vermelho) e venoso (azul)" },
    { mark: "raised", label: "Jato regurgitante em laranja" },
  ],
  caption:
    "O volume das câmaras, as válvulas, o ciclo e os sopros vêm do mesmo modelo hemodinâmico (câmera lenta). Os gráficos abaixo acompanham o modelo em tempo real.",
  body: stage,
});

// linhas da imagem de soprologia (pixels da imagem original 495×619)
const ROWS = { normal: [162, 222], ea: [225, 287], im: [290, 350], ia: [353, 414], em: [414, 474] };

const css = `
<style>
.hl-stage{position:relative;aspect-ratio:16/10;min-height:340px;touch-action:none;cursor:grab}
.hl-stage:active{cursor:grabbing}
.hl-stage canvas{position:absolute;inset:0;width:100%;height:100%;display:block}
.hl-label{position:absolute;transform:translate(-50%,-50%);font:600 11px/1 var(--anatomy-mono);color:var(--anatomy-strong);background:color-mix(in srgb,var(--anatomy-card) 78%,transparent);padding:3px 6px;border:1px solid var(--anatomy-lo);pointer-events:none;white-space:nowrap}
.hl-label[data-kind="valve"]{color:var(--anatomy-muted);font-weight:500}
.hc-bar{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0 0;align-items:center}
.hc-bar button,.hc-bar select{font:inherit;font-size:13px;color:var(--anatomy-text);background:var(--anatomy-card);border:1px solid var(--anatomy-lo);padding:7px 12px;cursor:pointer;border-radius:0}
.hc-bar button[aria-pressed="true"]{color:var(--anatomy-strong);border-color:var(--anatomy-hi);box-shadow:inset 0 -2px 0 var(--anatomy-red)}
.hc-bar button.hc-hot[aria-pressed="true"]{background:color-mix(in srgb,var(--anatomy-red) 22%,var(--anatomy-card));border-color:var(--anatomy-red)}
.hc-bar button:focus-visible,.hc-bar select:focus-visible,.hc-bar input:focus-visible{outline:2px solid var(--anatomy-hi);outline-offset:2px}
.hc-bar label{font-size:12.5px;color:var(--anatomy-muted);display:flex;gap:8px;align-items:center}
.hc-bar input[type=range]{width:150px;accent-color:var(--anatomy-red)}
.hc-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px;margin:12px 0 0}
.hc-card{background:var(--anatomy-card);box-shadow:0 0 0 1px var(--anatomy-lo);padding:14px 16px}
.hc-card h3{margin:0 0 8px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--anatomy-muted);font-weight:600}
.hc-card p,.hc-card li{margin:0 0 6px;color:var(--anatomy-text);font-size:13.5px;line-height:1.55}
.hc-card ul{margin:0;padding-left:18px}
.hc-card b{color:var(--anatomy-strong);font-weight:600}
.hc-num{display:grid;grid-template-columns:auto 1fr auto;gap:2px 12px;font-family:var(--anatomy-mono);font-size:12.5px;color:var(--anatomy-text)}
.hc-num span:nth-child(3n){color:var(--anatomy-strong);text-align:right}
.hc-flag{font-style:normal;display:inline-block;font-size:11px;padding:1px 6px;border:1px solid var(--anatomy-red);margin-left:6px;color:var(--anatomy-red)}
.hc-note{margin-top:10px;padding:10px 12px;border-left:2px solid var(--anatomy-red);background:var(--anatomy-card);font-size:12.5px;color:var(--anatomy-muted)}
.hc-charts{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(0,0.85fr);gap:12px;margin:12px 0 0}
@media(max-width:760px){.hc-charts{grid-template-columns:1fr}}
.hc-chart{background:#fff;box-shadow:0 0 0 1px var(--anatomy-lo);position:relative;line-height:0}
.hc-chart img{display:block;width:100%;height:auto}
.hc-title{display:flex;justify-content:space-between;align-items:baseline;margin:0 0 6px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--anatomy-muted);font-weight:600;line-height:1.4}
.hc-title b{color:var(--anatomy-strong);letter-spacing:0;text-transform:none;font-size:13px}
.hc-ov{position:absolute;inset:0;pointer-events:none}
.hc-cursor{position:absolute;width:0;border-left:2px solid #e5484d;box-shadow:0 0 0 1px #ffffffaa}
.hc-band{position:absolute;background:#e5484d2e;border-left:1px solid #e5484d88;border-right:1px solid #e5484d88}
.hc-row{position:absolute;border:2px solid #e5484d;background:#e5484d1f;left:0;right:0}
.hc-pcg{margin:12px 0 0;background:var(--anatomy-card);box-shadow:0 0 0 1px var(--anatomy-lo);padding:12px 16px;--pcg-ink:var(--anatomy-strong)}
.hc-pcg canvas{display:block;width:100%;height:84px;background:color-mix(in srgb,var(--anatomy-page) 70%,transparent)}
.hc-pcg small{color:var(--anatomy-muted);font-size:12px}
</style>`;

const ui = `
<div class="hc-bar" role="group" aria-label="Visualização">
  <button class="hc-hot" data-blood aria-pressed="false">Sangue (volume)</button>
  <button class="hc-hot" data-flow aria-pressed="false">Fluxo (partículas)</button>
  <button data-cut aria-pressed="false">Corte (valvas)</button>
  <button data-labels aria-pressed="true">Rótulos</button>
  <button data-view>Recentrar</button>
  <button data-play aria-pressed="true">Pausar</button>
  <label>Velocidade <select data-speed><option value="4" selected>4× mais lento</option><option value="2">2× mais lento</option><option value="1">Tempo real</option></select></label>
</div>
<div class="hc-bar" role="group" aria-label="Ausculta">
  <button class="hc-hot" data-audio aria-pressed="false">🔊 Auscultar</button>
  <button data-beats aria-pressed="true">Bulhas (B1, B2)</button>
  <button data-murmurs aria-pressed="true">Sopros</button>
  <small style="color:var(--anatomy-muted)">O áudio é sintetizado pelo modelo: o sopro nasce do fluxo pela valva doente.</small>
</div>
<div class="hc-bar" role="group" aria-label="Condição">
${Object.entries(panel.cases).map(([id, c], i) => `<button data-case="${id}" aria-pressed="${i === 0}">${i + 1} · ${c.button}</button>`).join("")}
<label>Gravidade <input type="range" min="0" max="100" value="100" data-sev aria-label="Gravidade da lesão"><span data-sevtxt>grave</span></label>
</div>

<div class="hc-charts">
  <div>
    <div class="hc-title"><span>Ciclo cardíaco (Wiggers)</span><b data-phase>–</b></div>
    <div class="hc-chart" data-wig><img src="${uri("wiggers.png")}" alt="Ciclo cardíaco: pressões, volume ventricular, ECG e fonocardiograma">
      <div class="hc-ov"><div class="hc-band" data-wband></div><div class="hc-cursor" data-wcur></div></div></div>
  </div>
  <div>
    <div class="hc-title"><span>Sopros por valvopatia</span><b data-sopro>–</b></div>
    <div class="hc-chart" data-sop><img src="${uri("soprologia.png")}" alt="Soprologia: fonocardiograma de cada valvopatia">
      <div class="hc-ov"><div class="hc-row" data-srow></div><div class="hc-cursor" data-scur></div></div></div>
  </div>
</div>
<div class="hc-pcg"><div class="hc-title" style="margin-bottom:4px"><span>Fonocardiograma gerado pelo modelo</span><small>B1 · B2 · sopros, na mesma escala de tempo do ciclo</small></div><canvas data-pcg width="1000" height="84"></canvas></div>

<div class="hc-grid">
  <div class="hc-card"><h3>Fisiopatologia</h3><div data-sec="physio"></div></div>
  <div class="hc-card"><h3>Números do modelo (ao vivo)</h3><div class="hc-num" data-nums></div><p style="margin-top:8px;font-size:12px;color:var(--anatomy-muted)">Modelo didático de parâmetros concentrados. Fluxo pelo orifício: Q = 44,3 · A · √ΔP.</p></div>
  <div class="hc-card"><h3>Gravidade e critérios</h3><div data-sec="criteria"></div></div>
  <div class="hc-card"><h3>Manejo</h3><div data-sec="management"></div></div>
</div>
<div class="hc-note">${panel.disclaimer}</div>
<script type="module">
const cases = ${JSON.stringify(panel.cases)};
const SOP = { normal: "Normal", ea: "Estenose aórtica: sopro em diamante", im: "Insuficiência mitral: holossistólico", ia: "Insuficiência aórtica: protodiastólico", em: "Estenose mitral: estalido + ruflar diastólico" };
const ROWS = ${JSON.stringify(ROWS)};
const $ = (s) => document.querySelector(s);
const send = (n, d) => window.dispatchEvent(new CustomEvent(n, { detail: d }));
let current = "normal";
const fill = (c) => {
  $('[data-sec="physio"]').innerHTML = c.physio.map((t) => "<p>" + t + "</p>").join("");
  $('[data-sec="criteria"]').innerHTML = "<ul>" + c.criteria.map((t) => "<li>" + t + "</li>").join("") + "</ul>";
  $('[data-sec="management"]').innerHTML = "<ul>" + c.management.map((t) => "<li>" + t + "</li>").join("") + "</ul>";
};
const sev = $("[data-sev]"), sevtxt = $("[data-sevtxt]");
const sevLabel = () => { const v = Number(sev.value); sevtxt.textContent = current === "normal" ? "–" : v >= 75 ? "grave" : v >= 40 ? "moderada" : v > 5 ? "leve" : "sem lesão"; };
const place = () => {
  const [y0, y1] = ROWS[current] || ROWS.normal;
  const row = $("[data-srow]");
  row.style.top = (y0 / 619 * 100) + "%"; row.style.height = ((y1 - y0) / 619 * 100) + "%";
  $("[data-sopro]").textContent = SOP[current];
};
const pick = (id) => {
  current = id;
  document.querySelectorAll("[data-case]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.case === id)));
  fill(cases[id]); place(); sevLabel();
  send("heart-case", id);
};
document.querySelectorAll("[data-case]").forEach((b) => b.addEventListener("click", () => pick(b.dataset.case)));
sev.addEventListener("input", () => { sevLabel(); send("heart-sev", Number(sev.value) / 100); });
const toggle = (sel, ev, on) => {
  const b = $(sel); let v = on;
  const apply = () => { b.setAttribute("aria-pressed", String(v)); send(ev, v); };
  b.addEventListener("click", () => { v = !v; apply(); });
  return () => { v = !v; apply(); };
};
const flip = { blood: toggle("[data-blood]", "heart-blood", false), flow: toggle("[data-flow]", "heart-flow", false), cut: toggle("[data-cut]", "heart-cut", false), labels: toggle("[data-labels]", "heart-labels", true), audio: toggle("[data-audio]", "heart-audio", false), beats: toggle("[data-beats]", "heart-beats", true), murmurs: toggle("[data-murmurs]", "heart-murmurs", true) };
let playing = true;
const pb = $("[data-play]");
const togglePlay = () => { playing = !playing; pb.setAttribute("aria-pressed", String(playing)); pb.textContent = playing ? "Pausar" : "Retomar"; send("heart-play", playing); };
pb.addEventListener("click", togglePlay);
$("[data-view]").addEventListener("click", () => send("heart-view"));
$("[data-speed]").addEventListener("change", (e) => send("heart-speed", Number(e.target.value)));
const ids = Object.keys(cases);
window.addEventListener("keydown", (e) => {
  if (e.target.closest && e.target.closest("input,select")) return;
  if (/^[1-5]$/.test(e.key)) pick(ids[Number(e.key) - 1]);
  const m = { b: "blood", f: "flow", c: "cut", s: "audio" }[e.key.toLowerCase()];
  if (m) flip[m]();
  if (e.key === " " && !(e.target.closest && e.target.closest("button"))) { e.preventDefault(); togglePlay(); }
});
// destaques que acompanham o ciclo
const WIG = { w: 452, h: 347, top: 70, bot: 318, edges: [100, 108, 158, 166, 190, 232, 264] };
const SOPG = { w: 495, h: 619, top: 148, bot: 487 };
const wcur = $("[data-wcur]"), wband = $("[data-wband]"), scur = $("[data-scur]"), phase = $("[data-phase]");
const setV = (el, x, W, top, bot, H) => { el.style.left = (x / W * 100) + "%"; el.style.top = (top / H * 100) + "%"; el.style.height = ((bot - top) / H * 100) + "%"; };
window.addEventListener("heart-cycle", (e) => {
  const c = e.detail;
  setV(wcur, c.wx, WIG.w, WIG.top, WIG.bot, WIG.h);
  const a = WIG.edges[c.seg], b = WIG.edges[c.seg + 1];
  wband.style.left = (a / WIG.w * 100) + "%"; wband.style.width = ((b - a) / WIG.w * 100) + "%";
  wband.style.top = (WIG.top / WIG.h * 100) + "%"; wband.style.height = ((WIG.bot - WIG.top) / WIG.h * 100) + "%";
  setV(scur, c.sx, SOPG.w, SOPG.top, SOPG.bot, SOPG.h);
  if (phase.textContent !== c.name) phase.textContent = c.name;
});
const f = (v, d = 0) => (Number.isFinite(v) ? v.toFixed(d) : "–");
window.addEventListener("heart-metrics", (e) => {
  const { state, metrics } = e.detail;
  const b = metrics && metrics.b;
  if (!b) return;
  const p = state.p;
  const row = (a, v, u, flag) => "<span>" + a + "</span><span>" + (flag ? '<i class="hc-flag">' + flag + "</i>" : "") + "</span><span>" + v + " " + u + "</span>";
  $("[data-nums]").innerHTML = [
    row("Área valva aórtica", f(p.aoArea, 1), "cm²", p.aoArea <= 1.0 ? "grave" : ""),
    row("Gradiente médio VE–Ao", f(b.gradMean), "mmHg", b.gradMean >= 40 ? "≥ 40" : ""),
    row("Área valva mitral", f(p.miArea, 1), "cm²", p.miArea <= 1.5 ? "grave" : ""),
    row("Gradiente médio AE–VE", f(b.gradMi), "mmHg", b.gradMi >= 10 ? "≥ 10" : ""),
    row("ORE refluxo aórtico", f(p.aoLeak, 2), "cm²", p.aoLeak >= 0.3 ? "grave" : ""),
    row("ORE refluxo mitral", f(p.miLeak, 2), "cm²", p.miLeak >= 0.4 ? "grave" : ""),
    row("Fração regurgitante", f(b.rf * 100), "%", b.rf >= 0.5 ? "≥ 50 %" : ""),
    row("Pressão máx. VE", f(b.plvMax), "mmHg", ""),
    row("Aorta (sist/diast)", f(b.paoMax) + "/" + f(b.paoMin), "mmHg", ""),
    row("Pressão máx. AE", f(b.plaMax), "mmHg", ""),
    row("Volume diast. final VE", f(b.edv), "mL", ""),
    row("Fração de ejeção", f(b.ef * 100), "%", ""),
    row("Débito cardíaco efetivo", f(b.co, 1), "L/min", ""),
  ].join("");
});
fill(cases.normal); place(); sevLabel();
</script>`;

const script = `${rig}\n${live}`;
const html = k.pageHtml({ title: "Coração esquerdo 3D", theme, width: 1000, body: figure + css + ui, script });
const out = theme === "light" ? "coracao-3d-light.html" : "coracao-3d.html";
writeFileSync(join(HERE, out), html);
console.log("wrote", out, (html.length / 1024).toFixed(0) + " KB");
