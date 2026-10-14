import test from 'node:test';
import assert from 'node:assert/strict';
import { FG, central, fairies, run, idleAll, noBrew, clearTile, onlyForestAt, atHome } from './helpers.mjs';

test('倉庫上限：所有物品共用上限值、各自比較；放下時超過上限的部分消失', () => {
  const s = FG.newGame(1);
  const t = central(s);
  assert.equal(t.cap, FG.STORAGE_BASE);
  assert.equal(FG.STORAGE_BASE, 60);
  t.storage = { '月石': 58, '木枝': 60 };
  assert.equal(FG.ops.deliver(s, t.id, '月石', 5), 5);
  assert.equal(t.storage['月石'], 60);
  assert.equal(FG.ops.deliver(s, t.id, '露水', 5), 5);
  assert.equal(t.storage['露水'], 5);
  assert.equal(FG.room(t, '露水'), 55);
});

test('精靈放下物品：倉庫滿也會放，但不再累積', () => {
  const s = FG.newGame(1);
  idleAll(s); noBrew(s);
  onlyForestAt(s, 1, 0);
  const t = central(s), [f] = fairies(s);
  t.storage = { '木枝': 58 };
  FG.cmd.setTask(s, f.id, { kind: 'collect', item: '木枝' });
  run(s, 15);
  assert.equal(t.storage['木枝'], 60);
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
  t.storage = { '木枝': 60, '月光花': 60 };
  FG.cmd.setTask(s, f.id, { kind: 'collect', item: '木枝' });
  FG.cmd.setTask(s, g.id, { kind: 'farm' });
  run(s, 5);
  assert.ok(atHome(s, f) && atHome(s, g));
  assert.match(f.msg, /上限/);
  assert.match(g.msg, /上限/);
  assert.equal(farm.growth, 1);
  t.storage = { '木枝': 40, '月石': 60, '月光花': 40 };
  run(s, 20);
  assert.ok(t.storage['木枝'] > 40);
  assert.ok((s.stats.produced['月光花'] || 0) >= 3);
});

test('擴建倉庫：扣資源、上限 +30、成本遞增；資源不足失敗', () => {
  const s = FG.newGame(1);
  const t = central(s);
  t.storage = { '月石': 30, '木枝': 30 };
  const c1 = FG.cmd.storageCost(t);
  assert.equal(FG.cmd.expandStorage(s, t.id).ok, true);
  assert.equal(t.cap, FG.STORAGE_BASE + FG.STORAGE_STEP);
  assert.equal(FG.STORAGE_STEP, 30);
  assert.equal(t.storage['月石'], 30 - c1['月石']);
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
  const dev = t.devices.find(d => d && d.type === 'brewer');
  dev.keep = 0; dev.limit = 99;
  t.storage = { '月光花': 20, '花蜜': 60 };
  run(s, 10);
  assert.equal(t.storage['月光花'], 20);
  assert.equal(t.storage['花蜜'], 60);
  t.storage = { '月光花': 20, '花蜜': 50 };
  run(s, 10);
  assert.ok(t.storage['花蜜'] >= 51);
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
