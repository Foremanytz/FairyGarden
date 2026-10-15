// 繪圖量測：固定四個情境，輸出每格畫面的繪圖指令數與 JS 耗時，供各優化階段比較改前改後
// 用法：node tests/perf.mjs [寬x高]   預設 1920x1080
// 注意：無頭瀏覽器沒有真實顯示卡，耗時只能比較同一台機器的相對變化；指令數則與機器無關
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
let pw; try { pw = require('playwright'); } catch { pw = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright'); }
const [w, h] = (process.argv[2] || '1920x1080').split('x').map(Number);
const url = 'file://' + fileURLToPath(new URL('../index.html', import.meta.url));
const browser = await pw.chromium.launch();
const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
// 計數：包住 Canvas 2D 的主要繪圖方法
await page.addInitScript(() => {
  const P = CanvasRenderingContext2D.prototype, C = window.__calls = {};
  for (const m of ['fill', 'stroke', 'fillRect', 'fillText', 'strokeText', 'createRadialGradient', 'createLinearGradient']) {
    const o = P[m]; P[m] = function (...a) { C[m] = (C[m] || 0) + 1; return o.apply(this, a); };
  }
});
await page.goto(url);
await page.click('button[data-go="new"][data-lv="1"]');
await page.click('#dialog button');
await page.keyboard.press('F3');

const SCENES = [
  ['開局', () => {}],
  ['縮到最小看全圖', () => { FGUI.cam.z = 0.4; }],
  ['粒子滿載', () => {
    FGUI.cam.z = 1; FGUI.parts.length = 0;
    for (let i = 0; i < 900; i++) FGUI.parts.push({ x: Math.random() * 16 - 8, y: Math.random() * 10 - 5, lift: 20, vx: 0, vy: 0, vl: 0, life: 1e6, max: 1e6, size: 2, color: '#ffaaee' });
  }],
  ['12 隻精靈施工', () => {
    FGUI.parts.length = 0; FGUI.speed = 0;
    const s = FGUI.s, base = Object.values(s.fairies)[0];
    for (let i = 0; i < 12; i++) {
      const id = 'perf' + i;
      s.fairies[id] = Object.assign(JSON.parse(JSON.stringify(base)), { id, slot: i, x: (i % 4) * 1.5 - 2, y: Math.floor(i / 4) * 1.5 - 1, act: { op: 'construct', t: 0, dur: 1e6 } });
    }
  }],
];

const rows = [];
for (const [name, setup] of SCENES) {
  await page.evaluate(setup);
  await page.waitForTimeout(1500);
  rows.push(await page.evaluate(async name => {
    for (const k in window.__calls) window.__calls[k] = 0;
    const t0 = performance.now();
    let frames = 0; await new Promise(r => { const loop = () => { frames++; if (performance.now() - t0 < 2000) requestAnimationFrame(loop); else r(); }; requestAnimationFrame(loop); });
    const c = window.__calls, per = k => Math.round((c[k] || 0) / frames), st = FGUI.perf.stats || {};
    return { 情境: name, FPS: +(st.fps || 0).toFixed(1), '平均ms': +(st.avg || 0).toFixed(2), '最慢5%ms': +(st.p95 || 0).toFixed(2), 粒子: st.parts,
      fill: per('fill'), stroke: per('stroke'), fillRect: per('fillRect'), 文字: per('fillText') + per('strokeText'), 放射漸層: per('createRadialGradient'), 線性漸層: per('createLinearGradient') };
  }, name));
}
const res = await page.evaluate(() => FGUI.perf.stats.res);
console.log(`視窗 ${w}×${h}，畫布 ${res}`);
console.table(rows);
await browser.close();
