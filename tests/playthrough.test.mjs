// 可玩性：用一組「合理玩家」的指令單分配，三章都要在 40 分鐘遊戲時間內完成
import test from 'node:test';
import assert from 'node:assert/strict';
import { FG, central, fairies } from './helpers.mjs';

const LIMIT = 2400;
const FARM = { kind: 'farm', item: '月光花幼苗' };
const same = (a, b) => a.kind === b.kind && (a.item || null) === (b.item || null) && (a.to || null) === (b.to || null);
function assign(s, roles, homeId) {
  const fs = fairies(s).filter(f => !homeId || f.home === homeId);
  fs.forEach((f, i) => { const r = roles[i % roles.length]; if (!same(f.task, r)) FG.cmd.setTask(s, f.id, r); });
}
function tilesNear(s, c, dmin, dmax, types, pred) {
  return Object.values(s.tiles).filter(t => !t.ents.length && types.includes(t.t) && FG.hex.dist(t, c) >= dmin && FG.hex.dist(t, c) <= dmax && (!pred || pred(t)))
    .sort((a, b) => FG.hex.dist(a, c) - FG.hex.dist(b, c));
}
function place(s, type, list) { for (const t of list) { const r = FG.cmd.placeBlueprint(s, type, t.q, t.r); if (r.ok) return r.id; } return null; }
const count = (s, type) => Object.values(s.ents).filter(e => e.type === type).length;
const bps = s => Object.values(s.ents).filter(e => e.type === 'blueprint').length;
function common(s, maxFairies) {
  for (const g of s.goals) if (g.kind === 'order' && !g.done) FG.cmd.fulfillOrder(s, g.id);
  for (const t of FG.flowers(s)) {
    if (Object.values(t.storage).some(n => n >= t.cap - 5)) FG.cmd.expandStorage(s, t.id);
    // 木枝要留著蓋藍圖，不讓育苗室全部拿去做幼苗
    FG.cmd.setReserve(s, t.id, '木枝', 10);
  }
  const c = central(s);
  if (fairies(s).length < maxFairies && (c.storage['花蜜'] || 0) >= 6 && (c.storage['月光花'] || 0) >= 8) FG.cmd.summonFairy(s, c.id);
}
function play(level, policy) {
  const s = FG.newGame(level);
  const ctx = {};
  for (let t = 0; t < LIMIT && !s.complete; t += 2) { policy(s, ctx); for (let i = 0; i < 20; i++) FG.tick(s, 0.1); }
  return s;
}
// 像真人一樣看庫存分派：依序挑第一個「家裡還少於門檻」的物品來收集，都夠了就待命
function pick(c, prefs) {
  for (const [item, max] of prefs) if ((c.storage[item] || 0) < max) return { kind: 'collect', item };
  return { kind: 'idle' };
}
const report = s => s.goals.map(g => (g.done ? '✔' : '✘') + g.text + ' ' + FG.goalProgress(s, g).join('/')).join('\n');

test('第 1 章可在 40 分鐘內完成', () => {
  const s = play(1, (s, ctx) => {
    const c = central(s);
    if (!ctx.init) { ctx.init = 1; for (let i = 0; i < 3; i++) place(s, 'farm', tilesNear(s, c, 2, 3, ['grass'])); }
    common(s, 4);
    const wood = (c.storage['木枝'] || 0) > 15 ? FARM : { kind: 'collect', item: '木枝' };
    assign(s, bps(s) ? [{ kind: 'build' }, wood] : [FARM, wood, FARM, { kind: 'collect', item: '木枝' }]);
  });
  assert.ok(s.complete, report(s));
});

test('第 2 章可在 40 分鐘內完成', () => {
  const s = play(2, (s, ctx) => {
    const c = central(s);
    if (!ctx.init) {
      ctx.init = 1;
      place(s, 'barrier', tilesNear(s, c, 3, 5, ['grass']));
      place(s, 'barrier', tilesNear(s, c, 3, 6, ['grass']));
      place(s, 'barrier', tilesNear(s, c, 2, 8, ['rock']));
    }
    common(s, 7);
    if (c.slots < 4 && (c.storage['月光花'] || 0) >= 14) FG.cmd.expandEther(s, c.id);
    c.devices.forEach((d, i) => { if (!d && FG.cmd.addDevice(s, c.id, i, 'transmuter').ok) FG.cmd.setRecipe(s, c.id, i, i % 2 ? 'crystal' : 'nourish'); });
    if (!ctx.flower && count(s, 'barrier') >= 3 && (c.storage['結界晶'] || 0) >= 2) {
      const water = Object.values(s.tiles).filter(t => t.t === 'water');
      ctx.flower = place(s, 'flower', tilesNear(s, c, 4, 12, ['grass'], t => water.some(w => FG.hex.dist(w, t) <= 3)));
    }
    assign(s, [FARM, bps(s) ? { kind: 'build' } : pick(c, [['月光花', 3], ['陽光', 12], ['木枝', 15]]), pick(c, [['月石', 15], ['木枝', 15]]),
      pick(c, [['露水', 6], ['陽光', 12]]), pick(c, [['土息', 6], ['陽光', 12]]), { kind: 'build' }, pick(c, [['木枝', 15], ['月石', 15]])], c.id);
  });
  assert.ok(s.complete, report(s));
});

test('第 3 章可在 40 分鐘內完成', () => {
  const s = play(3, (s, ctx) => {
    const c = central(s), lake = FG.flowers(s).find(t => !t.central && FG.hex.dist(t, { q: 9, r: -4 }) === 0);
    if (!ctx.init) {
      ctx.init = 1;
      for (const d of [3, 6]) { const p = FG.hex.line(c, lake)[d]; place(s, 'anchor', tilesNear(s, p, 0, 2, ['grass', 'rock', 'forest', 'meadow'])); }
      place(s, 'anchor', tilesNear(s, c, 3, 4, ['grass']));
      place(s, 'barrier', tilesNear(s, c, 2, 4, ['grass']));
      c.devices[2].recipe = 'stardust';
    }
    common(s, 8);
    // 想擴充乙太空間時，把月光花的保留量調高，免得被釀造台和育苗室用光
    c.reserve['月光花'] = c.slots < 5 ? 10 : 2;
    if (c.slots < 5 && (c.storage['月光花'] || 0) >= 8) FG.cmd.expandEther(s, c.id);
    // 一次只能施一道法，設備會分批裝好：每次挑還沒有的配方
    const want = ['crystal', 'prism', 'nourish'].filter(r => !c.devices.some(d => d && d.recipe === r));
    c.devices.forEach((d, i) => { if (!d && FG.cmd.addDevice(s, c.id, i, 'transmuter').ok) FG.cmd.setRecipe(s, c.id, i, want.shift() || 'crystal'); });
    if (!ctx.ch && count(s, 'anchor') >= 3) {
      ctx.ch = 1;
      const anchors = Object.values(s.ents).filter(e => e.type === 'anchor').sort((a, b) => FG.hex.dist(b, c) - FG.hex.dist(a, c));
      FG.cmd.buildChannel(s, [lake.id, ...anchors.filter(a => FG.hex.dist(a, c) > 4).slice(0, 2).map(a => a.id), c.id], '露水');
      for (const b of Object.values(s.ents).filter(e => e.type === 'barrier' && FG.hex.dist(e, c) <= 7)) FG.cmd.buildChannel(s, [b.id, c.id], null);
    }
    if (!ctx.flower && (c.storage['結界晶'] || 0) >= 2 && (c.storage['月石'] || 0) >= 10) {
      const meadow = Object.values(s.tiles).filter(t => t.t === 'meadow');
      ctx.flower = place(s, 'flower', tilesNear(s, c, 4, 16, ['grass', 'meadow'], t => meadow.some(m => FG.hex.dist(m, t) <= 2)));
    }
    assign(s, [FARM, bps(s) ? { kind: 'build' } : pick(c, [['月光花', 3], ['木枝', 15], ['月石', 15]]), pick(c, [['月光花', 10], ['月石', 15], ['木枝', 15]]),
      count(s, 'anchor') >= 3 ? pick(c, [['木枝', 20], ['月石', 15]]) : pick(c, [['陽光', 10]]), FARM, bps(s) ? { kind: 'build' } : pick(c, [['木枝', 15]])], c.id);
    assign(s, [pick(lake, [['露水', 15]]), pick(lake, [['陽光', 15]])], lake.id);
  });
  if (!s.complete) console.log(JSON.stringify(FG.flowers(s).map(t => [t.name, t.storage, t.devices.map(d => d && d.recipe + ':' + d.state), t.cap])), JSON.stringify(Object.values(s.fairies).map(f=>[f.task.kind,f.task.item,f.msg])));
  assert.ok(s.complete, report(s));
});
