import test from 'node:test';
import assert from 'node:assert/strict';
import { FG, central, fairies, run, idleAll, noBrew, onlyForestAt } from './helpers.mjs';

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

test('召喚：按下就扣資源，施法 10 秒後精靈才出現', () => {
  assert.equal(FG.SUMMON_TIME, 10);
  assert.equal(FG.CAST_TIME.summon, 10);
  const s = FG.newGame(1);
  idleAll(s); noBrew(s);
  const t = central(s);
  t.storage = { '花蜜': 10, '月光花': 10 };
  assert.equal(FG.cmd.summonFairy(s, t.id).ok, true);
  assert.equal(t.storage['花蜜'], 10 - FG.SUMMON_COST['花蜜']);
  assert.equal(t.cast.kind, 'summon');
  run(s, 9);
  assert.equal(fairies(s).length, 2);
  run(s, 1.1);
  assert.equal(fairies(s).length, 3);
  assert.equal(t.cast, null);
});

test('召喚：施法中不能再召喚，也不會再扣資源', () => {
  const s = FG.newGame(1);
  const t = central(s);
  t.storage = { '花蜜': 20, '月光花': 20 };
  FG.cmd.summonFairy(s, t.id);
  const left = { ...t.storage };
  const r = FG.cmd.summonFairy(s, t.id);
  assert.equal(r.ok, false);
  assert.deepEqual(t.storage, left);
});

test('召喚：新精靈出現在自己的待機點，不在花的正中心', () => {
  const s = FG.newGame(1);
  idleAll(s);
  const t = central(s);
  t.storage = { '花蜜': 10, '月光花': 10 };
  const before = new Set(Object.keys(s.fairies));
  FG.cmd.summonFairy(s, t.id);
  run(s, 10.1);
  const f = fairies(s).find(x => !before.has(x.id));
  const sp = FG.standbyXY(s, f), c = FG.posOf(t);
  assert.ok(dist(f, sp) < 0.05);
  assert.ok(dist(sp, c) > 0.5);
});

test('召喚：存檔讀檔後施法進度接續', () => {
  const s = FG.newGame(1);
  idleAll(s);
  const t = central(s);
  t.storage = { '花蜜': 10, '月光花': 10 };
  FG.cmd.summonFairy(s, t.id);
  run(s, 6);
  const s2 = FG.load(FG.save(s));
  run(s2, 3);
  assert.equal(fairies(s2).length, 2);
  run(s2, 1.1);
  assert.equal(fairies(s2).length, 3);
});

test('待機點：每隻精靈不同，都在自家花的周圍', () => {
  const s = FG.newGame(2);
  const t = central(s);
  const pts = fairies(s).map(f => FG.standbyXY(s, f));
  for (let i = 0; i < pts.length; i++) {
    const d = dist(pts[i], FG.posOf(t));
    assert.ok(d > 0.5 && d < 1.6, String(d));
    for (let j = i + 1; j < pts.length; j++) assert.ok(dist(pts[i], pts[j]) > 0.3);
  }
});

test('待機點：待命或任務做不了時，精靈停在自己的待機點', () => {
  const s = FG.newGame(1);
  idleAll(s);
  const [f, g] = fairies(s);
  FG.cmd.setTask(s, g.id, { kind: 'build' });
  run(s, 3);
  assert.ok(dist(f, FG.standbyXY(s, f)) < 0.05);
  assert.ok(dist(g, FG.standbyXY(s, g)) < 0.05);
  assert.match(g.msg, /維護/);
});

test('待機點：要拿取或放下時會飛到花的中心處理', () => {
  const s = FG.newGame(1);
  idleAll(s); noBrew(s);
  onlyForestAt(s, 2, 0);
  const t = central(s), [f] = fairies(s);
  run(s, 2);
  const before = t.storage['木枝'] || 0;
  FG.cmd.setTask(s, f.id, { kind: 'collect', item: '木枝' });
  run(s, 20);
  assert.ok((t.storage['木枝'] || 0) > before);
});

test('中央魔法之花收到物資時發出事件（給畫面播放音效）', () => {
  const s = FG.newGame(3);
  const c = central(s), lake = FG.flowers(s).find(e => !e.central);
  FG.fx.length = 0;
  FG.ops.deliver(s, c.id, '木枝', 2);
  FG.ops.deliver(s, lake.id, '月石', 2);
  const ev = FG.fx.filter(e => e.type === 'store');
  assert.equal(ev.length, 1);
  assert.equal(ev[0].item, '木枝');
  c.storage = { '木枝': c.cap }; FG.fx.length = 0;
  FG.ops.deliver(s, c.id, '木枝', 2);
  assert.equal(FG.fx.filter(e => e.type === 'store').length, 0);
});

// 魔法之花：建造費＝原建造費＋召喚費，完工直接生出一隻住在新花的精靈
const flowerSite = s => { const t = s.tiles[FG.hex.key(6, 0)]; t.t = 'grass'; for (const id of t.ents) delete s.ents[id]; t.ents = []; return t; };
const finishFlower = s => {
  flowerSite(s);
  const r = FG.cmd.placeBlueprint(s, 'flower', 6, 0); assert.equal(r.ok, true);
  const bp = s.ents[r.id]; bp.have = { ...bp.need };
  assert.equal(FG.ops.construct(s, bp.id, bp.time), true);
  return s.ents[r.id];
};

test('魔法之花：建造費含召喚一隻精靈的費用', () => {
  assert.deepEqual(FG.BUILDS.flower.cost, { '木枝': 10, '月石': 10, '結界晶': 2, '花蜜': 3, '月光花': 4 });
  const s = FG.newGame(2);
  flowerSite(s);
  const r = FG.cmd.placeBlueprint(s, 'flower', 6, 0);
  assert.deepEqual(s.ents[r.id].need, FG.BUILDS.flower.cost);
});

test('魔法之花：完工直接新增一隻精靈，家是新花', () => {
  const s = FG.newGame(2);
  const n = fairies(s).length;
  const t = finishFlower(s);
  assert.equal(t.type, 'flower');
  assert.equal(fairies(s).length, n + 1);
  const f = fairies(s).find(x => x.home === t.id);
  assert.ok(f);
  assert.equal(f.task.kind, 'build');
  assert.equal(f.task.radius, FG.DEFAULT_RADIUS);
  assert.equal(t.storage['花蜜'] || 0, 0);
  assert.equal(t.storage['月光花'] || 0, 0);
});

test('魔法之花：精靈已滿時照樣完工，召喚費放進新花倉庫', () => {
  const s = FG.newGame(2);
  const c = central(s);
  c.storage = { '花蜜': 99, '月光花': 99 };
  while (fairies(s).length < FG.FAIRY_MAX - 1) { FG.cmd.summonFairy(s, c.id); c.cast.t = c.cast.dur; FG.tick(s, 0.01); }
  FG.cmd.summonFairy(s, c.id);   // 第 16 隻施法中，也算進上限
  assert.equal(fairies(s).length, FG.FAIRY_MAX - 1);
  const t = finishFlower(s);
  assert.equal(fairies(s).length, FG.FAIRY_MAX - 1);
  assert.equal(fairies(s).some(f => f.home === t.id), false);
  assert.equal(t.storage['花蜜'], FG.SUMMON_COST['花蜜']);
  assert.equal(t.storage['月光花'], FG.SUMMON_COST['月光花']);
});

test('魔法之花：精靈差一隻就滿時，完工的精靈是第 16 隻', () => {
  const s = FG.newGame(2);
  const c = central(s);
  c.storage = { '花蜜': 99, '月光花': 99 };
  while (fairies(s).length < FG.FAIRY_MAX - 1) { FG.cmd.summonFairy(s, c.id); c.cast.t = c.cast.dur; FG.tick(s, 0.01); }
  const t = finishFlower(s);
  assert.equal(fairies(s).length, FG.FAIRY_MAX);
  assert.equal(t.storage['花蜜'] || 0, 0);
});
