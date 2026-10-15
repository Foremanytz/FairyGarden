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
const ver = await page.textContent('#menu .ver');
assert.match(ver, /版本更新：\d{4}-\d{2}-\d{2} \d{2}:\d{2}（台北時間）/, 'version stamp');
await page.click('button[data-go="new"][data-lv="1"]');
await page.click('#dialog button');
await page.waitForTimeout(400);
// 精靈列表：列數等於精靈數
const rows = await page.locator('#roster tbody tr').count();
const nf = await page.evaluate(() => Object.keys(FGUI.s.fairies).length);
assert.equal(rows, nf, 'roster rows');
// 量測面板：P 鍵打開會顯示數字，再按一次關閉
await page.keyboard.press('p'); await page.waitForTimeout(400);
assert.ok(await page.isVisible('#perf'), 'perf panel shown');
assert.match(await page.textContent('#perf'), /FPS\s+\d/, 'perf panel numbers');
await page.keyboard.press('p');
assert.ok(!(await page.isVisible('#perf')), 'perf panel hidden');
// 放農田藍圖，用列表分派任務
await page.click('#tools button[data-tool="build:farm"]');
for (const [dx, dy] of [[90, 60], [-90, 60], [0, 120]]) await page.mouse.click(960 + dx, 540 + dy);
await page.keyboard.press('Escape');
const [f1, f2] = await page.evaluate(() => Object.keys(FGUI.s.fairies));
await page.selectOption(`#roster select[data-act="tkind"][data-fid="${f1}"]`, 'build');
await page.waitForTimeout(300);
await page.selectOption(`#roster select[data-act="tkind"][data-fid="${f2}"]`, 'collect');
await page.waitForTimeout(300);
assert.equal(await page.inputValue(`#roster select[data-act="titem"][data-fid="${f2}"]`), '', 'item blank after choosing action');
assert.equal(await page.evaluate(id => FGUI.s.fairies[id].task.item, f2), null);
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
// 按鈕：按下與放開之間面板內容會變，連按 3 次「擴建倉庫」都要生效
await page.evaluate(() => { const t = FG.centralOf(FGUI.s); t.storage['花蜜'] = 30; t.storage['月光花'] = 30; t.storage['月石'] = 60; t.storage['木枝'] = 60; FGUI.sel = { kind: 'ent', id: t.id }; FGUI.sideHtml = ''; });
await page.waitForTimeout(400);
const cap0 = await page.evaluate(() => FG.centralOf(FGUI.s).cap);
const pressWithRerender = async sel => {
  const box = await page.locator(sel).boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.evaluate(() => { FG.centralOf(FGUI.s).storage['露水'] = (FG.centralOf(FGUI.s).storage['露水'] || 0) + 1; });
  await page.waitForTimeout(300); await page.mouse.up();
  await page.waitForTimeout(300);
};
for (let i = 0; i < 3; i++) {
  await pressWithRerender('#side button[data-act="expstore"]');
  assert.equal(await page.locator('#side .cast').count(), 1, 'storage cast progress shown');
  await page.evaluate(() => FG.tick(FGUI.s, 6.5)); await page.waitForTimeout(300);
}
assert.equal(await page.evaluate(() => FG.centralOf(FGUI.s).cap), cap0 + 3 * 30, 'expand storage x3');
// 召喚：開始施法，按鈕換成進度條；施法完成後精靈多一隻
const n0 = await page.evaluate(() => Object.keys(FGUI.s.fairies).length);
await pressWithRerender('#side button[data-act="summon"]');
assert.equal(await page.evaluate(() => FG.centralOf(FGUI.s).cast && FG.centralOf(FGUI.s).cast.kind), 'summon', 'summon casting');
await page.waitForTimeout(300);
assert.equal(await page.locator('#side .cast').count(), 1, 'cast progress shown');
await page.screenshot({ path: out + '/1b-summon.png' });
await page.evaluate(() => FG.tick(FGUI.s, 10.5));
assert.equal(await page.evaluate(() => Object.keys(FGUI.s.fairies).length), n0 + 1, 'summoned');
// 施工中的狀態文字、藍圖滑鼠提示
const bpPos = await page.evaluate(() => {
  const s = FGUI.s, t1 = s.tiles['3,1'], t2 = s.tiles['4,1']; FGUI.cam.x = 0; FGUI.cam.y = 0; FGUI.cam.z = 1;
  for (const t of [t1, t2]) { t.t = 'grass'; for (const id of t.ents) delete s.ents[id]; t.ents = []; }
  const ready = FG.cmd.placeBlueprint(s, 'farm', 3, 1); FG.ops.deliver(s, ready.id, '木枝', 2);
  FG.cmd.placeBlueprint(s, 'farm', 4, 1);
  FG.centralOf(s).storage['木枝'] = 0;
  for (const f of Object.values(s.fairies)) FG.cmd.setTask(s, f.id, { kind: 'build' });
  FGUI.collapse.roster = false; FGUI.rosterHtml = '';
  const w = FG.hex.toXY(4, 1), z = FGUI.cam.z;
  return [(w.x * 34 - FGUI.cam.x) * z + innerWidth / 2, (w.y * 34 - FGUI.cam.y) * z + innerHeight / 2 + 4];
});
await page.click('#speed button[data-speed="1"]');
await page.waitForTimeout(2500);
assert.ok((await page.textContent('#roster')).includes('建造花田中'), 'construct state text');
await page.evaluate(() => { const bp = Object.values(FGUI.s.ents).find(e => e.type === 'blueprint' && e.q === 4 && e.r === 1); bp.have = {}; });
await page.mouse.move(bpPos[0], bpPos[1]); await page.waitForTimeout(300);
assert.match(await page.textContent('#tip'), /還差 木枝×2/, 'blueprint tooltip');
await page.screenshot({ path: out + '/1c-dance.png' });
// 音效開關
const snd0 = await page.textContent('#btnSound');
await page.click('#btnSound');
assert.notEqual(await page.textContent('#btnSound'), snd0, 'sound toggle');
assert.equal(await page.evaluate(() => FGUI.sfx.on), snd0.includes('🔕'), 'sound state flipped');
await page.click('#btnSound');
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
// 同一格的花田與結界：重複點擊輪流選取
const [farmId, barId, sx, sy] = await page.evaluate(() => {
  const s = FGUI.s, t = s.tiles['2,1']; t.t = 'grass'; for (const id of t.ents) delete s.ents[id]; t.ents = [];
  const a = FG.spawnBuilding(s, 'farm', 2, 1), b = FG.spawnBuilding(s, 'barrier', 2, 1);
  const w = FG.hex.toXY(2, 1), z = FGUI.cam.z;
  return [a, b, (w.x * 34 - FGUI.cam.x) * z + innerWidth / 2, (w.y * 34 - FGUI.cam.y) * z + innerHeight / 2 + 8];
});
await page.click('#speed button[data-speed="0"]');
await page.mouse.click(sx, sy); const sel1 = await page.evaluate(() => FGUI.sel && FGUI.sel.id);
await page.mouse.click(sx, sy); const sel2 = await page.evaluate(() => FGUI.sel && FGUI.sel.id);
assert.deepEqual([sel1, sel2].sort(), [farmId, barId].sort(), 'click cycles layers');
// 圖層按鈕決定點到哪一層
const clickSel = async () => { await page.mouse.click(sx, sy); return page.evaluate(() => FGUI.sel && FGUI.sel.id); };
await page.click('#layers button[data-layer="ground"]');
assert.equal(await clickSel(), farmId, 'ground layer picks farm');
assert.equal(await clickSel(), farmId, 'ground layer stays on farm');
await page.click('#layers button[data-layer="air"]');
assert.equal(await clickSel(), barId, 'air layer picks barrier');
await page.click('#layers button[data-layer="sky"]');
assert.equal(await clickSel(), barId, 'channel layer picks channel node');
await page.click('#layers button[data-layer="all"]');
// 上方工具列：精靈列表、目標面板的開合
await page.click('#btnRoster');
assert.equal(await page.locator('#roster table').count(), 0, 'roster collapsed');
await page.click('#btnRoster');
await page.waitForTimeout(300);
assert.equal(await page.locator('#roster table').count(), 1, 'roster expanded');
await page.click('#btnGoals');
await page.waitForTimeout(300);
assert.equal(await page.locator('#goals .goal').count(), 0, 'goals collapsed');
await page.click('#btnGoals');
// 第二列：中央之花物資
await page.evaluate(() => { const c = FG.centralOf(FGUI.s); c.storage = { '木枝': c.cap, '月石': 3 }; FGUI.sel = null; });
await page.waitForTimeout(400);
assert.equal(await page.locator('#resbar .res').count(), 2, 'resbar items');
assert.equal(await page.locator('#resbar .res.full').count(), 1, 'resbar full item');
await page.click('#resbar');
assert.equal(await page.evaluate(() => FGUI.sel && FGUI.sel.id), await page.evaluate(() => FG.centralOf(FGUI.s).id), 'resbar selects central');
await page.click('#speed button[data-speed="2"]');
await page.waitForTimeout(3000);
await page.screenshot({ path: out + '/2-level3.png' });
await page.click('#layers button[data-layer="sky"]');
await page.waitForTimeout(500);
await page.screenshot({ path: out + '/3-sky.png' });
// 安全清空存檔：存檔帶說明欄位；清空只刪 fairygarden. 開頭的鍵，其他網站的資料留著
await page.click('#btnMenu');
const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('fairygarden.v1')));
assert.equal(saved.homepage, 'https://github.com/Foremanytz/FairyGarden', 'save info homepage');
assert.ok(saved.game && saved.about, 'save info fields');
await page.evaluate(() => { localStorage.setItem('otherSite.data', 'keep'); localStorage.setItem('fairygarden.sound', '1'); });
page.once('dialog', d => d.accept());
await page.click('#btnWipe');
const left = await page.evaluate(() => Object.keys(localStorage).sort());
assert.deepEqual(left, ['otherSite.data'], 'wipe keeps other sites');
assert.equal(await page.evaluate(() => localStorage.getItem('otherSite.data')), 'keep', 'other site value intact');
assert.equal(await page.locator('button[data-go="cont"]').count(), 0, 'no continue after wipe');
assert.equal(await page.locator('.card.locked').count(), 2, 'chapters relocked after wipe');
await page.screenshot({ path: out + '/4-wiped.png' });
await browser.close();
console.log('roster rows', rows, '/ fairies', nf, '; farms built in ~24s game time:', built);
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'NO CONSOLE ERRORS');
process.exit(errors.length ? 1 : 0);
