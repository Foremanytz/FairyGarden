// 冒煙測試：1920×1080 開啟 index.html，走過主要畫面，確認主控台沒有錯誤；截圖輸出到第一個參數的資料夾
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
let pw; try { pw = require('playwright'); } catch { pw = require(process.env.PW_PATH || '/opt/node-tools/node_modules/playwright'); }
const out = process.argv[2] || '.';
const url = 'file://' + fileURLToPath(new URL('../index.html', import.meta.url));
const browser = await pw.chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
await page.goto(url);
await page.screenshot({ path: out + '/0-menu.png' });
await page.click('button[data-go="new"][data-lv="1"]');
await page.click('#dialog button');
// 放農田藍圖、給精靈套範本
await page.click('#tools button[data-tool="build:farm"]');
for (const [dx, dy] of [[90, 60], [-90, 60], [0, 120]]) await page.mouse.click(960 + dx, 540 + dy);
await page.keyboard.press('Escape');
const fid = await page.evaluate(() => Object.keys(FGUI.s.fairies)[0]);
await page.evaluate(id => { FGUI.sel = { kind: 'fairy', id }; FGUI.sideHtml = ''; }, fid);
await page.waitForTimeout(300);
await page.click('#side button[data-act="edit"]');
await page.selectOption('#edTpl', { label: '搬木枝去蓋藍圖' });
await page.screenshot({ path: out + '/1-editor.png' });
await page.click('#edApply');
await page.click('#speed button[data-speed="4"]');
await page.waitForTimeout(6000);
const built = await page.evaluate(() => FGUI.s.stats.built.farm || 0);
await page.evaluate(() => { const t = FG.centralOf(FGUI.s); FGUI.sel = { kind: 'ent', id: t.id }; FGUI.sideHtml = ''; });
await page.waitForTimeout(400);
await page.screenshot({ path: out + '/2-level1.png' });
// 第 3 關：通道
await page.click('#btnMenu');
await page.evaluate(() => { const st = { unlocked: 3, saves: {} }; localStorage.setItem('fairygarden.v1', JSON.stringify(st)); });
await page.reload();
await page.click('button[data-go="new"][data-lv="3"]');
await page.click('#dialog button');
await page.evaluate(() => {
  const s = FGUI.s, c = FG.centralOf(s);
  const b = Object.values(s.ents).find(e => e.type === 'barrier' && FG.hex.dist(e, c) <= 7);
  b.buf = 10; FG.cmd.buildChannel(s, [b.id, c.id], null);
});
await page.click('#speed button[data-speed="2"]');
await page.waitForTimeout(3000);
await page.screenshot({ path: out + '/3-level3.png' });
await page.click('#layers button[data-layer="sky"]');
await page.waitForTimeout(500);
await page.screenshot({ path: out + '/4-sky.png' });
await browser.close();
console.log('farms built in ~24s game time:', built);
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'NO CONSOLE ERRORS');
process.exit(errors.length ? 1 : 0);
