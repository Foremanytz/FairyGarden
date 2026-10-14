import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FG, K, central, fairies, run, idleAll, noBrew, clearTile } from './helpers.mjs';

test('六角格：距離、鄰居、直線', () => {
  assert.equal(FG.hex.dist({ q: 0, r: 0 }, { q: 2, r: -1 }), 2);
  assert.equal(FG.hex.dist({ q: 0, r: 0 }, { q: -3, r: 3 }), 3);
  assert.equal(FG.hex.neighbors({ q: 0, r: 0 }).length, 6);
  assert.equal(FG.hex.line({ q: 0, r: 0 }, { q: 4, r: -2 }).length, 5);
});

test('改名：不再出現魔法塔、法力花、塔內空間；月光花圖示為 🌙', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  for (const w of ['魔法塔', '法力花', '塔內空間']) assert.equal(html.includes(w), false, w);
  assert.equal(FG.ITEMS['月光花'].icon, '🌙');
  assert.equal(central(FG.newGame(1)).name, '中央魔法之花');
});

test('第 1 關：中央魔法之花在原點、兩隻精靈以它為家且預設待命', () => {
  const s = FG.newGame(1);
  const t = central(s);
  assert.deepEqual([t.q, t.r], [0, 0]);
  assert.equal(fairies(s).length, 2);
  for (const f of fairies(s)) { assert.equal(f.home, t.id); assert.equal(f.task.kind, 'idle'); }
  assert.ok(s.goals.length >= 3);
});

test('第 2、3 關可建立；第 3 關有兩朵魔法之花且開放流動通道', () => {
  assert.ok(FG.newGame(2).unlocked.includes('barrier'));
  const s3 = FG.newGame(3);
  assert.equal(FG.flowers(s3).length, 2);
  assert.ok(s3.unlocked.includes('channel'));
});

test('藍圖：放置規則與搬入材料後完工', () => {
  const s = FG.newGame(1);
  clearTile(s, 3, 0); clearTile(s, 3, 1, 'water');
  assert.equal(FG.cmd.placeBlueprint(s, 'farm', 3, 1).ok, false);
  const r = FG.cmd.placeBlueprint(s, 'farm', 3, 0);
  assert.equal(r.ok, true);
  assert.equal(FG.cmd.placeBlueprint(s, 'farm', 3, 0).ok, false);
  assert.equal(FG.ops.deliver(s, r.id, '木枝', 5), 2);
  assert.equal(s.ents[r.id].type, 'farm');
  assert.equal(s.stats.built.farm, 1);
});

test('農田：播種、生長、採收得 3 朵月光花', () => {
  const s = FG.newGame(1);
  clearTile(s, 3, 0);
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
  idleAll(s);
  clearTile(s, -3, 0);
  const id = FG.spawnBuilding(s, 'farm', -3, 0);
  s.ents[id].fert = 0;
  FG.ops.plant(s, s.ents[id]);
  run(s, 35);
  assert.equal(FG.ops.harvest(s, s.ents[id]), 0);
});

test('釀造台：2 月光花 → 1 花蜜，遵守產量上限與保留原料', () => {
  const s = FG.newGame(1);
  idleAll(s);
  const t = central(s);
  const dev = t.devices.find(d => d && d.type === 'brewer');
  dev.keep = 0; dev.limit = 2;
  t.storage['月光花'] = 20; t.storage['花蜜'] = 0;
  run(s, 30);
  assert.equal(t.storage['花蜜'], 2);
  dev.keep = 10; dev.limit = 99;
  t.storage['月光花'] = 11;
  run(s, 30);
  assert.equal(t.storage['月光花'], 11);
});

test('召喚精靈與擴充乙太空間會扣資源', () => {
  const s = FG.newGame(1);
  const t = central(s);
  t.storage['花蜜'] = 10; t.storage['月光花'] = 10;
  assert.equal(FG.cmd.summonFairy(s, t.id).ok, true);
  assert.equal(fairies(s).length, 3);
  assert.ok(t.storage['花蜜'] < 10);

  const s2 = FG.newGame(2);
  const t2 = central(s2);
  const slots = t2.slots;
  t2.storage = { '月光花': 2 };
  assert.equal(FG.cmd.expandEther(s2, t2.id).ok, false);
  t2.storage = { '月石': 20, '月光花': 20 };
  assert.equal(FG.cmd.expandEther(s2, t2.id).ok, true);
  assert.equal(t2.slots, slots + 1);
  assert.ok(t2.storage['月石'] < 20);
});

test('轉化器：可設定配方並產出', () => {
  const s = FG.newGame(2);
  idleAll(s); noBrew(s);
  const t = central(s);
  t.storage = { '月石': 10, '木枝': 10, '陽光': 4 };
  const slot = t.devices.findIndex(d => !d);
  assert.equal(FG.cmd.addDevice(s, t.id, slot, 'transmuter').ok, true);
  assert.equal(FG.cmd.setRecipe(s, t.id, slot, 'crystal').ok, true);
  run(s, 15);
  assert.ok(t.storage['結界晶'] >= 1);
});

test('魔力收集結界：依地形產出元素，結界晶補充能量', () => {
  const s = FG.newGame(2);
  idleAll(s);
  clearTile(s, -4, 1, 'rock');
  const id = FG.spawnBuilding(s, 'barrier', -4, 1);
  const b = s.ents[id];
  assert.equal(b.elem, '風語');
  run(s, 13);
  assert.ok(b.buf >= 2);
  const c0 = b.charge;
  assert.equal(FG.ops.deliver(s, id, '結界晶', 1), 1);
  assert.ok(b.charge > c0);
});

test('流動通道：起訖距離限制，元素沿通道送進魔法之花', () => {
  const s = FG.newGame(3);
  idleAll(s); noBrew(s);
  const t = central(s);
  clearTile(s, 0, 3);
  const bid = FG.spawnBuilding(s, 'barrier', 0, 3);
  s.ents[bid].buf = 5;
  const far = FG.flowers(s).find(e => !e.central);
  assert.ok(FG.hex.dist(s.ents[bid], far) > 7);
  assert.equal(FG.cmd.buildChannel(s, [bid, far.id], null).ok, false);
  assert.equal(FG.cmd.buildChannel(s, [bid, t.id], null).ok, true);
  const before = t.storage['陽光'] || 0;
  run(s, 10);
  assert.ok((t.storage['陽光'] || 0) > before);
});

test('訂單交付扣庫存；全部目標完成即過關', () => {
  const s = FG.newGame(1);
  idleAll(s);
  const order = s.goals.find(g => g.kind === 'order');
  const t = central(s);
  t.storage = { [order.item]: order.n + 2 };
  assert.equal(FG.cmd.fulfillOrder(s, order.id).ok, true);
  assert.equal(t.storage[order.item], 2);
  assert.equal(order.done, true);
  assert.equal(s.complete, false);
  for (const g of s.goals) g.done = true;
  run(s, 1);
  assert.equal(s.complete, true);
});

test('存檔版本 2；讀檔後模擬結果一致；拒絕舊版存檔', () => {
  const s = FG.newGame(1);
  clearTile(s, 1, 0, 'forest');
  const [f] = fairies(s);
  FG.cmd.setTask(s, f.id, { kind: 'collect', item: '木枝' });
  run(s, 7);
  assert.equal(s.v, 2);
  const s2 = FG.load(FG.save(s));
  run(s, 20); run(s2, 20);
  assert.equal(FG.save(s), FG.save(s2));
  assert.throws(() => FG.load(JSON.stringify({ v: 1, tiles: {} })));
});
