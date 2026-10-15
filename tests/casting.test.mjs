import test from 'node:test';
import assert from 'node:assert/strict';
import { FG, central, run, idleAll } from './helpers.mjs';

const rich = t => { t.storage = { '月石': 60, '月光花': 60, '木枝': 60, '花蜜': 30 }; };

test('施法時間：擴充 8 秒、安裝 5 秒、擴建倉庫 6 秒', () => {
  assert.deepEqual([FG.CAST_TIME.ether, FG.CAST_TIME.device, FG.CAST_TIME.storage], [8, 5, 6]);
});

test('擴充乙太空間：按下就扣資源，8 秒後才增加格數與擴充次數', () => {
  const s = FG.newGame(2);
  idleAll(s);
  const t = central(s); rich(t);
  const slots = t.slots, cost = FG.cmd.etherCost(t);
  assert.equal(FG.cmd.expandEther(s, t.id).ok, true);
  assert.equal(t.storage['月石'], 60 - cost['月石']);
  run(s, 7.9);
  assert.equal(t.slots, slots);
  assert.equal(s.stats.expanded, 0);
  run(s, 0.2);
  assert.equal(t.slots, slots + 1);
  assert.equal(t.devices.length, slots + 1);
  assert.equal(s.stats.expanded, 1);
  assert.equal(t.cast, null);
});

test('安裝設備：格子立刻佔住，5 秒內不產出，之後開始運作', () => {
  const s = FG.newGame(2);
  idleAll(s);
  const t = central(s);
  t.storage = { '月石': 20, '木枝': 20, '陽光': 20 };
  const slot = t.devices.findIndex(d => !d);
  assert.equal(FG.cmd.addDevice(s, t.id, slot, 'transmuter').ok, true);
  assert.equal(t.storage['月石'], 17);
  assert.ok(t.devices[slot]);
  assert.equal(FG.cmd.addDevice(s, t.id, slot, 'transmuter').ok, false);
  FG.cmd.setRecipe(s, t.id, slot, 'crystal');
  run(s, 4.9);
  assert.equal(t.devices[slot].prog, 0);
  assert.equal(t.storage['結界晶'] || 0, 0);
  run(s, 6.5);
  assert.equal(t.storage['結界晶'], 1);
});

test('擴建倉庫：6 秒後上限才增加', () => {
  const s = FG.newGame(1);
  const t = central(s); rich(t);
  assert.equal(FG.cmd.expandStorage(s, t.id).ok, true);
  run(s, 5.9);
  assert.equal(t.cap, FG.STORAGE_BASE);
  run(s, 0.2);
  assert.equal(t.cap, FG.STORAGE_BASE + FG.STORAGE_STEP);
});

test('一朵花同時只能施一道法；失敗不扣資源', () => {
  const s = FG.newGame(2);
  idleAll(s);
  const t = central(s); rich(t);
  assert.equal(FG.cmd.expandStorage(s, t.id).ok, true);
  const left = { ...t.storage };
  const slot = t.devices.findIndex(d => !d);
  for (const r of [FG.cmd.expandEther(s, t.id), FG.cmd.addDevice(s, t.id, slot, 'transmuter'), FG.cmd.summonFairy(s, t.id), FG.cmd.expandStorage(s, t.id)]) {
    assert.equal(r.ok, false);
    assert.match(r.reason, /施法/);
  }
  assert.deepEqual(t.storage, left);
  run(s, 6.1);
  assert.equal(FG.cmd.expandEther(s, t.id).ok, true);
});

test('拆除設備是即時的：安裝中拆除會取消施法並退回材料', () => {
  const s = FG.newGame(2);
  idleAll(s);
  const t = central(s);
  t.storage = { '月石': 10, '木枝': 10 };
  const slot = t.devices.findIndex(d => !d);
  FG.cmd.addDevice(s, t.id, slot, 'transmuter');
  assert.equal(FG.cmd.removeDevice(s, t.id, slot).ok, true);
  assert.equal(t.devices[slot], null);
  assert.equal(t.cast, null);
  assert.equal(t.storage['月石'], 10);
  const brew = t.devices.findIndex(d => d && d.type === 'brewer');
  t.storage = { '月石': 60, '月光花': 60 };
  FG.cmd.expandEther(s, t.id);
  assert.equal(FG.cmd.removeDevice(s, t.id, brew).ok, true);
  assert.equal(t.cast.kind, 'ether');
});

test('存檔讀檔後施法進度接續', () => {
  const s = FG.newGame(2);
  idleAll(s);
  const t = central(s); rich(t);
  const slots = t.slots;
  FG.cmd.expandEther(s, t.id);
  run(s, 5);
  const s2 = FG.load(FG.save(s));
  const t2 = central(s2);
  run(s2, 2.9);
  assert.equal(t2.slots, slots);
  run(s2, 0.2);
  assert.equal(t2.slots, slots + 1);
});
