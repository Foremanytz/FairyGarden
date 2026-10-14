// 冒煙測試：1920×1080 開啟 index.html，走過主要畫面，確認主控台沒有錯誤；截圖輸出到第一個參數的資料夾
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
let pw; try { pw = require('playwright'); } catch { pw = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright'); }
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
await page.waitForTimeout(400);
// 精靈列表：列數等於精靈數
const rows = await page.locator('#roster tbody tr').count();
const nf = await page.evaluate(() => Object.keys(FGUI.s.fairies).length);
assert.equal(rows, nf, 'roster rows');
// 放農田藍圖，用列表分派任務
await page.click('#tools button[data-tool="build:farm"]');
for (const [dx, dy] of [[90, 60], [-90, 60], [0, 120]]) await page.mouse.click(960 + dx, 540 + dy);
await page.keyboard.press('Escape');
const [f1, f2] = await page.evaluate(() => Object.keys(FGUI.s.fairies));
await page.selectOption(`#roster select[data-act="tkind"][data-fid="${f1}"]`, 'build');
await page.waitForTimeout(300);
await page.selectOption(`#roster select[data-act="tkind"][data-fid="${f2}"]`, 'collect');
await page.waitForTimeout(300);
await page.selectOption(`#roster select[data-act="titem"][data-fid="${f2}"]`, '木枝');
const tasks = await page.evaluate(([a, b]) => [FGUI.s.fairies[a].task, FGUI.s.fairies[b].task], [f1, f2]);
assert.equal(tasks[0].kind, 'build');
assert.deepEqual([tasks[1].kind, tasks[1].item], ['collect', '木枝']);
// 點名字：鏡頭移到精靈並選取（先暫停，避免精靈移動）
await page.click('#speed button[data-speed="0"]');
await page.evaluate(id => { const f = FGUI.s.fairies[id]; f.x = 5; f.y = 3; }, f1);
await page.click(`#roster button[data-act="focus"][data-fid="${f1}"]`);
const cam = await page.evaluate(() => [FGUI.cam.x, FGUI.cam.y, FGUI.sel && FGUI.sel.id]);
assert.ok(Math.abs(cam[0] - 5 * 34) < 1 && Math.abs(cam[1] - 3 * 34) < 1 && cam[2] === f1, 'focus camera');
await page.click('#speed button[data-speed="4"]');
await page.waitForTimeout(6000);
const built = await page.evaluate(() => FGUI.s.stats.built.farm || 0);
await page.evaluate(() => { const t = FG.centralOf(FGUI.s); FGUI.sel = { kind: 'ent', id: t.id }; FGUI.sideHtml = ''; FGUI.cam.x = 0; FGUI.cam.y = 0; });
await page.waitForTimeout(400);
await page.screenshot({ path: out + '/1-level1.png' });
// 第 3 關：通道與天空層
await page.click('#btnMenu');
await page.evaluate(() => localStorage.setItem('fairygarden.v1', JSON.stringify({ unlocked: 3, saves: {} })));
await page.reload();
await page.click('button[data-go="new"][data-lv="3"]');
await page.click('#dialog button');
await page.evaluate(() => {
  const s = FGUI.s, c = FG.centralOf(s);
  const b = Object.values(s.ents).find(e => e.type === 'barrier' && FG.hex.dist(e, c) <= 7);
  b.buf = 10; FG.cmd.buildChannel(s, [b.id, c.id], null);
  FGUI.sel = { kind: 'fairy', id: Object.keys(s.fairies)[0] };
  FG.cmd.setTask(s, Object.keys(s.fairies)[0], { kind: 'farm', radius: 5 });
});
await page.click('#speed button[data-speed="2"]');
await page.waitForTimeout(3000);
await page.screenshot({ path: out + '/2-level3.png' });
await page.click('#layers button[data-layer="sky"]');
await page.waitForTimeout(500);
await page.screenshot({ path: out + '/3-sky.png' });
await browser.close();
console.log('roster rows', rows, '/ fairies', nf, '; farms built in ~24s game time:', built);
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'NO CONSOLE ERRORS');
process.exit(errors.length ? 1 : 0);
