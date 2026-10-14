import test from 'node:test';
import assert from 'node:assert/strict';
import { loadFG } from './load-core.mjs';

const FG = loadFG();
const K = (q, r) => FG.hex.key(q, r);
const central = s => Object.values(s.ents).find(e => e.type === 'tower' && e.central);
const fairies = s => Object.values(s.fairies);
const run = (s, sec) => { for (let i = 0; i < sec * 10; i++) FG.tick(s, 0.1); };
const isolate = s => { for (const f of fairies(s)) f.prog = []; };

test('六角格：距離、鄰居、直線', () => {
  assert.equal(FG.hex.dist({ q: 0, r: 0 }, { q: 2, r: -1 }), 2);
  assert.equal(FG.hex.dist({ q: 0, r: 0 }, { q: -3, r: 3 }), 3);
  assert.equal(FG.hex.neighbors({ q: 0, r: 0 }).length, 6);
  assert.equal(FG.hex.line({ q: 0, r: 0 }, { q: 4, r: -2 }).length, 5);
});

test('第 1 關：中央魔法塔在原點、兩隻精靈以它為家、有目標', () => {
  const s = FG.newGame(1);
  const t = central(s);
  assert.ok(t);
  assert.deepEqual([t.q, t.r], [0, 0]);
  assert.equal(fairies(s).length, 2);
  for (const f of fairies(s)) assert.equal(f.home, t.id);
  assert.ok(s.goals.length >= 3);
});

test('第 2、3 關可建立；第 3 關有兩座塔且開放流動通道', () => {
  const s2 = FG.newGame(2);
  assert.ok(s2.unlocked.includes('barrier'));
  const s3 = FG.newGame(3);
  assert.equal(Object.values(s3.ents).filter(e => e.type === 'tower').length, 2);
  assert.ok(s3.unlocked.includes('channel'));
});

test('藍圖：放置規則與搬入材料後完工', () => {
  const s = FG.newGame(1);
  s.tiles[K(3, 0)].t = 'grass';
  s.tiles[K(3, 1)].t = 'water';
  assert.equal(FG.cmd.placeBlueprint(s, 'farm', 3, 1).ok, false);
  const r = FG.cmd.placeBlueprint(s, 'farm', 3, 0);
  assert.equal(r.ok, true);
  assert.equal(FG.cmd.placeBlueprint(s, 'farm', 3, 0).ok, false);
  const got = FG.ops.deliver(s, r.id, '木枝', 5);
  assert.equal(got, 2);
  assert.equal(s.ents[r.id].type, 'farm');
  assert.equal(s.stats.built.farm, 1);
});

test('農田：播種、生長、採收得 3 朵法力花', () => {
  const s = FG.newGame(1);
  s.tiles[K(3, 0)].t = 'grass';
  const id = FG.spawnBuilding(s, 'farm', 3, 0);
  assert.equal(FG.ops.plant(s, s.ents[id]), true);
  run(s, 10);
  assert.equal(FG.ops.harvest(s, s.ents[id]), 0);
  run(s, 25);
  assert.equal(FG.ops.harvest(s, s.ents[id]), 3);
  assert.equal(s.ents[id].planted, false);
});

test('第 2 關：沒有滋養的農田長得較慢', () => {
  const s = FG.newGame(2);
  isolate(s);
  s.tiles[K(-3, 0)].t = 'grass';
  delete s.tiles[K(-3, 0)].e;
  const id = FG.spawnBuilding(s, 'farm', -3, 0);
  s.ents[id].fert = 0;
  FG.ops.plant(s, s.ents[id]);
  run(s, 35);
  assert.equal(FG.ops.harvest(s, s.ents[id]), 0);
});

test('塔內釀造台：2 法力花 → 1 花蜜，並遵守產量上限', () => {
  const s = FG.newGame(1);
  isolate(s);
  const t = central(s);
  t.storage['法力花'] = 6; t.storage['花蜜'] = 0;
  run(s, 5);
  assert.equal(t.storage['花蜜'], 1);
  assert.equal(t.storage['法力花'], 4);
  const dev = t.devices.find(d => d && d.type === 'brewer');
  dev.limit = 1;
  run(s, 20);
  assert.equal(t.storage['花蜜'], 1);
});

test('精靈活力：低活力自動回家吃花蜜；沒花蜜時慢慢休息恢復', () => {
  const s = FG.newGame(1);
  const t = central(s);
  const [f, g] = fairies(s);
  f.prog = [{ op: 'forever', body: [{ op: 'wait', s: 1 }] }];
  g.prog = [];
  f.energy = 5;
  t.storage['花蜜'] = 4;
  t.storage['法力花'] = 0;
  run(s, 3);
  assert.ok(f.energy > 90);
  assert.equal(t.storage['花蜜'], 3);
  f.energy = 5; t.storage['花蜜'] = 0;
  run(s, 3);
  assert.ok(f.energy > 5 && f.energy < 50);
});

test('腳本：永遠重複採集木枝送回塔', () => {
  const s = FG.newGame(1);
  const t = central(s);
  s.tiles[K(1, 0)].t = 'forest';
  const [f, g] = fairies(s);
  g.prog = [];
  f.prog = [{ op: 'forever', body: [
    { op: 'goto', target: { kind: 'nearest', what: 'forest' } },
    { op: 'gather' },
    { op: 'goto', target: { kind: 'home' } },
    { op: 'drop' },
  ] }];
  const before = t.storage['木枝'] || 0;
  run(s, 60);
  assert.ok((t.storage['木枝'] || 0) - before >= 10);
});

test('腳本：重複 N 次與如果條件', () => {
  const s = FG.newGame(1);
  const t = central(s);
  s.tiles[K(1, 0)].t = 'forest';
  const [f, g] = fairies(s);
  g.prog = [];
  f.prog = [{ op: 'repeat', n: 2, body: [
    { op: 'goto', target: { kind: 'nearest', what: 'forest' } },
    { op: 'gather' },
    { op: 'goto', target: { kind: 'home' } },
    { op: 'drop' },
  ] }];
  const before = t.storage['木枝'] || 0;
  run(s, 60);
  assert.equal((t.storage['木枝'] || 0) - before, 10);

  f.prog = [{ op: 'if', cond: { kind: 'handEmpty' }, body: [{ op: 'take', item: '法力花', n: 2 }], else: [] }];
  FG.cmd.setScript(s, f.id, f.prog);
  run(s, 3);
  assert.deepEqual(f.hold, { item: '法力花', n: 2 });
});

test('空的永遠重複不會卡死', () => {
  const s = FG.newGame(1);
  for (const f of fairies(s)) f.prog = [{ op: 'forever', body: [] }];
  run(s, 2);
  assert.ok(true);
});

test('召喚精靈與擴充塔內空間會扣資源', () => {
  const s = FG.newGame(1);
  const t = central(s);
  t.storage['花蜜'] = 10; t.storage['法力花'] = 10;
  assert.equal(FG.cmd.summonFairy(s, t.id).ok, true);
  assert.equal(fairies(s).length, 3);
  assert.ok(t.storage['花蜜'] < 10);

  const s2 = FG.newGame(2);
  const t2 = central(s2);
  const slots = t2.slots;
  t2.storage['月石'] = 0;
  assert.equal(FG.cmd.expandTower(s2, t2.id).ok, false);
  t2.storage['月石'] = 50; t2.storage['法力花'] = 50;
  assert.equal(FG.cmd.expandTower(s2, t2.id).ok, true);
  assert.equal(t2.slots, slots + 1);
  assert.ok(t2.storage['月石'] < 50);
});

test('轉化器：可設定配方並產出', () => {
  const s = FG.newGame(2);
  isolate(s);
  const t = central(s);
  t.storage['月石'] = 20; t.storage['木枝'] = 20; t.storage['陽光'] = 4;
  const slot = t.devices.findIndex(d => !d);
  assert.equal(FG.cmd.addDevice(s, t.id, slot, 'transmuter').ok, true);
  assert.equal(FG.cmd.setRecipe(s, t.id, slot, 'crystal').ok, true);
  run(s, 15);
  assert.ok(t.storage['結界晶'] >= 1);
});

test('魔力收集結界：依地形產出元素，結界晶補充能量', () => {
  const s = FG.newGame(2);
  isolate(s);
  s.tiles[K(-4, 1)].t = 'rock';
  delete s.tiles[K(-4, 1)].e;
  const id = FG.spawnBuilding(s, 'barrier', -4, 1);
  const b = s.ents[id];
  assert.equal(b.elem, '風語');
  run(s, 13);
  assert.ok(b.buf >= 2);
  const c0 = b.charge;
  assert.equal(FG.ops.deliver(s, id, '結界晶', 1), 1);
  assert.ok(b.charge > c0);
});

test('流動通道：起訖距離限制，元素沿通道送進塔', () => {
  const s = FG.newGame(3);
  isolate(s);
  const t = central(s);
  s.tiles[K(0, 3)].t = 'grass';
  delete s.tiles[K(0, 3)].e;
  const bid = FG.spawnBuilding(s, 'barrier', 0, 3);
  s.ents[bid].buf = 5;
  const far = Object.values(s.ents).find(e => e.type === 'tower' && !e.central);
  assert.ok(FG.hex.dist(s.ents[bid], far) > 7);
  assert.equal(FG.cmd.buildChannel(s, [bid, far.id], null).ok, false);
  const r = FG.cmd.buildChannel(s, [bid, t.id], null);
  assert.equal(r.ok, true);
  const before = t.storage['陽光'] || 0;
  run(s, 10);
  assert.ok((t.storage['陽光'] || 0) > before);
});

test('訂單交付扣庫存；全部目標完成即過關', () => {
  const s = FG.newGame(1);
  isolate(s);
  const order = s.goals.find(g => g.kind === 'order');
  assert.ok(order);
  const t = central(s);
  t.storage[order.item] = order.n + 2;
  assert.equal(FG.cmd.fulfillOrder(s, order.id).ok, true);
  assert.equal(t.storage[order.item], 2);
  assert.equal(order.done, true);
  assert.equal(s.complete, false);
  for (const g of s.goals) g.done = true;
  run(s, 1);
  assert.equal(s.complete, true);
});

test('存檔讀檔後模擬結果一致', () => {
  const s = FG.newGame(1);
  s.tiles[K(1, 0)].t = 'forest';
  const [f] = fairies(s);
  f.prog = [{ op: 'forever', body: [
    { op: 'goto', target: { kind: 'nearest', what: 'forest' } },
    { op: 'gather' },
    { op: 'goto', target: { kind: 'home' } },
    { op: 'drop' },
  ] }];
  run(s, 7);
  const s2 = FG.load(FG.save(s));
  run(s, 20); run(s2, 20);
  assert.equal(FG.save(s), FG.save(s2));
});
