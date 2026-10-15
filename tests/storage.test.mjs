import test from 'node:test';
import assert from 'node:assert/strict';
import { FG, central, fairies, run, idleAll, noBrew, clearTile, onlyForestAt, atHome } from './helpers.mjs';

test('倉庫上限：所有物品共用上限值、各自比較；放下時超過上限的部分消失', () => {
  const s = FG.newGame(1);
  const t = central(s);
  assert.equal(t.cap, FG.STORAGE_BASE);
  assert.equal(FG.STORAGE_BASE, 30);
  t.storage = { '月石': 28, '木枝': 30 };
  assert.equal(FG.ops.deliver(s, t.id, '月石', 5), 5);
  assert.equal(t.storage['月石'], 30);
  assert.equal(FG.ops.deliver(s, t.id, '露水', 5), 5);
  assert.equal(t.storage['露水'], 5);
  assert.equal(FG.room(t, '露水'), 25);
});

test('精靈放下物品：倉庫滿也會放，但不再累積', () => {
  const s = FG.newGame(1);
  idleAll(s); noBrew(s);
  onlyForestAt(s, 1, 0);
  const t = central(s), [f] = fairies(s);
  t.storage = { '木枝': 28 };
  FG.cmd.setTask(s, f.id, { kind: 'collect', item: '木枝' });
  run(s, 15);
  assert.equal(t.storage['木枝'], 30);
  assert.equal(f.hold, null);
});

test('該物品達上限時收集與種植的精靈不出門；有空位就恢復；別的物品滿了不影響', () => {
  const s = FG.newGame(1);
  idleAll(s); noBrew(s);
  onlyForestAt(s, 1, 0);
  clearTile(s, 2, 0);
  const farm = s.ents[FG.spawnBuilding(s, 'farm', 2, 0)];
  farm.planted = true; farm.growth = 1;
  const t = central(s), [f, g] = fairies(s);
  t.storage = { '木枝': 30, '月光花': 30 };
  FG.cmd.setTask(s, f.id, { kind: 'collect', item: '木枝' });
  FG.cmd.setTask(s, g.id, { kind: 'farm', item: '月光花幼苗' });
  run(s, 5);
  assert.ok(atHome(s, f) && atHome(s, g));
  assert.match(f.msg, /上限/);
  assert.match(g.msg, /上限/);
  assert.equal(farm.growth, 1);
  t.storage = { '木枝': 20, '月石': 30, '月光花': 20 };
  run(s, 20);
  assert.ok(t.storage['木枝'] > 20);
  assert.ok((s.stats.produced['月光花'] || 0) >= 4);
});

test('擴建倉庫：扣資源、上限 +10、成本遞增；資源不足失敗', () => {
  const s = FG.newGame(1);
  const t = central(s);
  t.storage = { '月石': 20, '木枝': 20 };
  const c1 = FG.cmd.storageCost(t);
  assert.equal(FG.cmd.expandStorage(s, t.id).ok, true);
  run(s, 6.1);
  assert.equal(t.cap, FG.STORAGE_BASE + FG.STORAGE_STEP);
  assert.equal(FG.STORAGE_STEP, 10);
  assert.equal(t.storage['月石'], 20 - c1['月石']);
  const c2 = FG.cmd.storageCost(t);
  assert.ok(c2['月石'] > c1['月石']);
  t.storage = { '月石': 1 };
  assert.equal(FG.cmd.expandStorage(s, t.id).ok, false);
  assert.equal(t.cap, FG.STORAGE_BASE + FG.STORAGE_STEP);
});

test('產物達倉庫上限時乙太空間的設備暫停', () => {
  const s = FG.newGame(1);
  idleAll(s);
  const t = central(s);
  t.devices.forEach(d => { if (d && d.type !== 'brewer') d.recipe = null; });
  t.storage = { '月光花': 20, '花蜜': 30 };
  run(s, 10);
  assert.equal(t.storage['月光花'], 20);
  assert.equal(t.storage['花蜜'], 30);
  t.storage = { '月光花': 20, '花蜜': 20 };
  run(s, 10);
  assert.ok(t.storage['花蜜'] >= 21);
});

test('通道：目的地的該物品達上限時起點停止送出', () => {
  const s = FG.newGame(3);
  idleAll(s); noBrew(s);
  const t = central(s);
  clearTile(s, 0, 3);
  const b = s.ents[FG.spawnBuilding(s, 'barrier', 0, 3)];
  b.buf = 10;
  FG.cmd.buildChannel(s, [b.id, t.id], null);
  t.storage = { '陽光': t.cap };
  run(s, 10);
  assert.equal(t.storage['陽光'], t.cap);
  assert.equal(b.buf, 10);
  t.storage = { '陽光': t.cap - 10 };
  run(s, 10);
  assert.ok(t.storage['陽光'] >= t.cap - 7);
  assert.ok(t.storage['陽光'] <= t.cap);
});

test('通道：從魔法之花出發時只送出超過保留量的部分', () => {
  const s = FG.newGame(3);
  idleAll(s); noBrew(s);
  const c = central(s), lake = FG.flowers(s).find(e => !e.central);
  lake.storage = { '露水': 9 }; c.storage = {};
  FG.cmd.setReserve(s, lake.id, '露水', 6);
  const anchors = [[3, -1], [6, -2]].map(([q, r]) => { clearTile(s, q, r); return FG.spawnBuilding(s, 'anchor', q, r); });
  assert.equal(FG.cmd.buildChannel(s, [lake.id, ...anchors.slice().reverse(), c.id], '露水').ok, true);
  run(s, 60);
  assert.equal(lake.storage['露水'], 6);
  assert.equal(c.storage['露水'], 3);
});

test('玩家蓋好的魔法之花：乙太空間 1 格空格，倉庫上限 30，帶預設保留量', () => {
  const s = FG.newGame(2);
  idleAll(s);
  clearTile(s, -6, 6);
  const bp = FG.cmd.placeBlueprint(s, 'flower', -6, 6);
  const e = s.ents[bp.id];
  for (const [k, n] of Object.entries(e.need)) e.have[k] = n;
  assert.equal(FG.ops.construct(s, bp.id, e.time), true);
  const t = s.ents[bp.id];
  assert.equal(t.type, 'flower');
  assert.deepEqual(t.devices, [null]);
  assert.equal(t.slots, 1);
  assert.equal(t.cap, 30);
  assert.deepEqual(t.reserve, { '花蜜': 4, '月光花': 2, '木枝': 6 });
});
