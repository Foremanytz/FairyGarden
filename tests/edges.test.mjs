// 邊界與防呆：由變異測試的存活點補上
import test from 'node:test';
import assert from 'node:assert/strict';
import { FG, K, central, fairies, run, idleAll, noBrew, clearTile, onlyForestAt, atHome } from './helpers.mjs';

const putAt = (s, f, q, r) => { const p = FG.hex.toXY(q, r); f.x = p.x; f.y = p.y; f.atKey = K(q, r); };

test('指令拒絕不合法的操作', () => {
  const s = FG.newGame(1);
  const t = central(s), [f] = fairies(s);
  assert.equal(FG.cmd.assignHome(s, f.id, 'nope').ok, false);
  clearTile(s, 3, 0);
  const farm = FG.spawnBuilding(s, 'farm', 3, 0);
  assert.equal(FG.cmd.assignHome(s, f.id, farm).ok, false);
  assert.equal(FG.cmd.assignHome(s, f.id, t.id).ok, true);
  const empty = t.devices.findIndex(d => !d);
  assert.equal(FG.cmd.removeDevice(s, t.id, empty).ok, false);
  assert.equal(FG.cmd.setLimit(s, t.id, empty, 3).ok, false);
  assert.equal(FG.cmd.setKeep(s, t.id, empty, 3).ok, false);
  assert.equal(FG.cmd.addDevice(s, t.id, empty, 'transmuter').ok, false);
  const brew = t.devices.findIndex(d => d && d.type === 'brewer');
  assert.equal(FG.cmd.setRecipe(s, t.id, brew, 'crystal').ok, false);
  assert.equal(FG.cmd.setRecipe(s, t.id, brew, 'nope').ok, false);
  t.storage = { '木枝': 20, '月光花': 20 };
  assert.equal(FG.cmd.addDevice(s, t.id, brew, 'brewer').ok, false);
  assert.equal(FG.cmd.addDevice(s, t.id, t.slots, 'brewer').ok, false);
  assert.equal(FG.cmd.addDevice(s, t.id, -1, 'brewer').ok, false);
  assert.equal(FG.cmd.demolish(s, t.id).ok, false);
});

test('設備：設定配方會重置進度；拆設備退回材料', () => {
  const s = FG.newGame(2);
  idleAll(s);
  const t = central(s);
  t.storage = { '月石': 10, '木枝': 10 };
  const slot = t.devices.findIndex(d => !d);
  FG.cmd.addDevice(s, t.id, slot, 'transmuter');
  assert.equal(t.storage['月石'], 7);
  assert.equal(FG.cmd.setRecipe(s, t.id, slot, 'nourish').ok, true);
  assert.equal(t.devices[slot].recipe, 'nourish');
  assert.equal(FG.cmd.removeDevice(s, t.id, slot).ok, true);
  assert.equal(t.storage['月石'], 10);
  assert.equal(t.devices[slot], null);
});

test('乙太空間最多 9 格', () => {
  const s = FG.newGame(2);
  const t = central(s);
  while (t.slots < 9) { t.storage = { '月石': 60, '月光花': 60 }; assert.equal(FG.cmd.expandEther(s, t.id).ok, true); }
  t.storage = { '月石': 60, '月光花': 60 };
  assert.equal(FG.cmd.expandEther(s, t.id).ok, false);
  assert.equal(t.slots, 9);
});

test('魔法之花之間至少相隔 4 格', () => {
  const s = FG.newGame(2);
  clearTile(s, 3, 0); clearTile(s, 4, 0);
  assert.equal(FG.cmd.canPlace(s, 'flower', 3, 0).ok, false);
  assert.equal(FG.cmd.canPlace(s, 'flower', 4, 0).ok, true);
});

test('拆除：藍圖全額退回、建築退一半、相關通道一起移除', () => {
  const s = FG.newGame(3);
  idleAll(s); noBrew(s);
  const t = central(s);
  t.storage = {};
  clearTile(s, 0, 3); clearTile(s, 0, 4);
  const bp = FG.cmd.placeBlueprint(s, 'barrier', 0, 4);
  FG.ops.deliver(s, bp.id, '月石', 2);
  assert.equal(FG.cmd.demolish(s, bp.id).ok, true);
  assert.equal(t.storage['月石'], 2);
  const b = FG.spawnBuilding(s, 'barrier', 0, 3);
  FG.cmd.buildChannel(s, [b, t.id], null);
  assert.equal(Object.keys(s.channels).length, 1);
  FG.cmd.demolish(s, b);
  assert.equal(t.storage['月石'], 2 + 1);
  assert.equal(t.storage['木枝'], 1);
  assert.equal(Object.keys(s.channels).length, 0);
  assert.equal(s.tiles[K(0, 3)].ents.length, 0);
});

test('交付：數量為 0 或對象不存在時不收；農田只收滋養露且不超過上限', () => {
  const s = FG.newGame(2);
  idleAll(s);
  const t = central(s);
  assert.equal(FG.ops.deliver(s, t.id, '木枝', 0), 0);
  assert.equal(FG.ops.deliver(s, 'nope', '木枝', 3), 0);
  clearTile(s, -3, 0);
  const farm = s.ents[FG.spawnBuilding(s, 'farm', -3, 0)];
  farm.fert = FG.FERT_MAX;
  assert.equal(FG.ops.deliver(s, farm.id, '滋養露', 2), 0);
  assert.equal(FG.ops.deliver(s, farm.id, '木枝', 2), 0);
  farm.fert = 3;
  assert.equal(FG.ops.deliver(s, farm.id, '滋養露', 5), 2);
  assert.equal(farm.fert, FG.FERT_MAX);
});

test('目標：在水邊的花才算數；設備數量依類型計算', () => {
  const s = FG.newGame(2);
  idleAll(s);
  const near = s.goals.find(g => g.kind === 'buildNear');
  const dev = s.goals.find(g => g.kind === 'device');
  for (const k in s.tiles) if (s.tiles[k].t === 'water') s.tiles[k].t = 'grass';
  clearTile(s, 6, 0); clearTile(s, 0, 6); clearTile(s, 0, 8, 'water');
  FG.spawnBuilding(s, 'flower', 6, 0); Object.values(s.ents).find(e => e.q === 6 && e.r === 0).built = true;
  assert.equal(FG.goalProgress(s, near)[0], 0);
  FG.spawnBuilding(s, 'flower', 0, 6); Object.values(s.ents).find(e => e.q === 0 && e.r === 6).built = true;
  assert.equal(FG.goalProgress(s, near)[0], 1);
  assert.equal(FG.goalProgress(s, dev)[0], 0);
});

test('收集：還站在森林、手上沒滿就繼續採；只剩 1 單位的結界也會去收', () => {
  const s = FG.newGame(2);
  idleAll(s); noBrew(s);
  onlyForestAt(s, 2, 0);
  const [f, g] = fairies(s);
  putAt(s, f, 2, 0); f.hold = { item: '木枝', n: 2 };
  FG.cmd.setTask(s, f.id, { kind: 'collect', item: '木枝' });
  run(s, 0.2);
  assert.equal(f.act.op, 'gather');
  clearTile(s, -3, 0);
  const b = s.ents[FG.spawnBuilding(s, 'barrier', -3, 0)];
  b.buf = 1; b.charge = 0; b.t = -1000;
  FG.cmd.setTask(s, g.id, { kind: 'collect', item: '陽光' });
  run(s, 6);
  assert.equal(b.buf, 0);
  assert.equal(central(s).storage['陽光'], 1);
});

test('採集中資源被蓋掉：精靈停止並說明', () => {
  const s = FG.newGame(1);
  idleAll(s);
  onlyForestAt(s, 1, 0);
  const [f] = fairies(s);
  FG.cmd.setTask(s, f.id, { kind: 'collect', item: '木枝' });
  run(s, 1);
  assert.equal(f.act.op, 'gather');
  s.tiles[K(1, 0)].t = 'grass';
  run(s, 0.2);
  assert.notEqual(f.act && f.act.op, 'gather');
});

test('種植：手上 1 朵時仍可採收（湊滿 5 朵）', () => {
  const s = FG.newGame(1);
  idleAll(s); noBrew(s);
  clearTile(s, 2, 0);
  const farm = s.ents[FG.spawnBuilding(s, 'farm', 2, 0)];
  farm.planted = true; farm.growth = 1;
  const [f] = fairies(s);
  putAt(s, f, 2, 0); f.hold = { item: '月光花', n: 1 };
  FG.cmd.setTask(s, f.id, { kind: 'farm' });
  run(s, 1.5);
  assert.deepEqual(f.hold, { item: '月光花', n: 5 });
});

test('種植：月光花達上限但沒有成熟的田時，說明是在等收成', () => {
  const s = FG.newGame(1);
  idleAll(s); noBrew(s);
  clearTile(s, 2, 0);
  const farm = s.ents[FG.spawnBuilding(s, 'farm', 2, 0)];
  farm.planted = true; farm.growth = 0.1;
  const t = central(s), [f] = fairies(s);
  t.storage = { '月光花': t.cap };
  FG.cmd.setTask(s, f.id, { kind: 'farm' });
  run(s, 1);
  assert.match(f.msg, /生長中/);
});

test('建造：家裡只有部分材料時先搬有的，並說明缺什麼', () => {
  const s = FG.newGame(2);
  idleAll(s);
  const t = central(s);
  t.storage = { '木枝': 5 };
  clearTile(s, -3, 0);
  const bp = FG.cmd.placeBlueprint(s, 'barrier', -3, 0);
  const [f] = fairies(s);
  FG.cmd.setTask(s, f.id, { kind: 'build' });
  run(s, 20);
  assert.equal(s.ents[bp.id].have['木枝'], 2);
  assert.equal(t.storage['木枝'], 3);
  assert.match(f.msg, /月石/);
});

test('運送：目的地該物品已達上限時待命', () => {
  const s = FG.newGame(3);
  idleAll(s);
  const c = central(s), lake = FG.flowers(s).find(e => !e.central);
  c.storage = { '月石': 10 }; lake.storage = { '月石': lake.cap };
  const f = fairies(s).find(x => x.home === c.id);
  FG.cmd.setTask(s, f.id, { kind: 'haul', item: '月石', at: { flower: lake.id } });
  run(s, 3);
  assert.match(f.msg, /上限/);
  assert.equal(c.storage['月石'], 10);
});

test('補給途中改指令單，不會中斷補給', () => {
  const s = FG.newGame(1);
  idleAll(s); noBrew(s);
  const t = central(s), [f] = fairies(s);
  t.storage = { '花蜜': 2 };
  f.energy = 5;
  run(s, 0.1);
  assert.equal(f.act.op, 'refuel');
  FG.cmd.setTask(s, f.id, { kind: 'collect', item: '木枝' });
  assert.equal(f.act.op, 'refuel');
});

test('結界累積最多 10 單位', () => {
  const s = FG.newGame(2);
  idleAll(s);
  clearTile(s, -3, 0);
  const b = s.ents[FG.spawnBuilding(s, 'barrier', -3, 0)];
  b.charge = 5;
  run(s, 80);
  assert.equal(b.buf, 10);
});

test('採收會消耗滋養；已播種的田不能再播', () => {
  const s = FG.newGame(2);
  idleAll(s);
  clearTile(s, -3, 0);
  const farm = s.ents[FG.spawnBuilding(s, 'farm', -3, 0)];
  farm.fert = 4;
  assert.equal(FG.ops.plant(s, farm), true);
  assert.equal(FG.ops.plant(s, farm), false);
  farm.growth = 1;
  FG.ops.harvest(s, farm);
  assert.equal(farm.fert, 3);
});

test('活力：工作時每秒消耗 1，待命時每秒 0.3', () => {
  const s = FG.newGame(1);
  idleAll(s); noBrew(s);
  onlyForestAt(s, 1, 0);
  const [f, g] = fairies(s);
  FG.cmd.setTask(s, f.id, { kind: 'collect', item: '木枝' });
  run(s, 10);
  assert.ok(f.energy < 92 && f.energy > 88, String(f.energy));
  assert.ok(g.energy > 96 && g.energy < 98, String(g.energy));
});

test('同一個目標只派一隻精靈（成熟的田、缺滋養的田、結界）', () => {
  const s = FG.newGame(2);
  idleAll(s); noBrew(s);
  for (const e of Object.values(s.ents)) if (e.type === 'farm') { e.fert = FG.FERT_MAX; e.planted = true; e.growth = 0.1; }
  clearTile(s, -3, 0); clearTile(s, -5, 0);
  const farm = s.ents[FG.spawnBuilding(s, 'farm', -3, 0)];
  farm.planted = true; farm.growth = 1;
  const [a, b, c, d] = fairies(s);
  FG.cmd.setTask(s, a.id, { kind: 'farm' }); FG.cmd.setTask(s, b.id, { kind: 'farm' });
  run(s, 0.3);
  const goingFarm = [a, b].filter(f => f.act && f.act.op === 'move' && f.act.key === K(-3, 0)).length;
  assert.equal(goingFarm, 1);
  const bar = s.ents[FG.spawnBuilding(s, 'barrier', -5, 0)];
  bar.buf = 10;
  FG.cmd.setTask(s, c.id, { kind: 'collect', item: '陽光' }); FG.cmd.setTask(s, d.id, { kind: 'collect', item: '陽光' });
  run(s, 0.3);
  assert.equal([c, d].filter(f => f.act && f.act.op === 'move' && f.act.key === K(-5, 0)).length, 1);
});

test('營造：兩隻精靈不會搶同一塊缺滋養的田', () => {
  const s = FG.newGame(2);
  idleAll(s); noBrew(s);
  for (const e of Object.values(s.ents)) if (e.type === 'farm') e.fert = FG.FERT_MAX;
  clearTile(s, -3, 0);
  const farm = s.ents[FG.spawnBuilding(s, 'farm', -3, 0)]; farm.fert = 0;
  central(s).storage = { '滋養露': 4 };
  const [a, b] = fairies(s);
  FG.cmd.setTask(s, a.id, { kind: 'build' }); FG.cmd.setTask(s, b.id, { kind: 'build' });
  run(s, 1.2);
  assert.equal([a, b].filter(f => f.hold).length, 1);
});

test('收集：站在空草地上不會誤採，會飛去森林', () => {
  const s = FG.newGame(1);
  idleAll(s); noBrew(s);
  onlyForestAt(s, 1, 0); clearTile(s, 3, 0);
  const t = central(s), [f] = fairies(s);
  putAt(s, f, 3, 0);
  FG.cmd.setTask(s, f.id, { kind: 'collect', item: '木枝' });
  run(s, 20);
  assert.ok((t.storage['木枝'] || 0) > 4);
});

test('採集中森林上方放了結界藍圖：照樣繼續採集', () => {
  const s = FG.newGame(2);
  idleAll(s);
  onlyForestAt(s, 1, 0);
  const [f] = fairies(s);
  FG.cmd.setTask(s, f.id, { kind: 'collect', item: '木枝' });
  run(s, 1);
  assert.equal(f.act.op, 'gather');
  assert.equal(FG.cmd.placeBlueprint(s, 'barrier', 1, 0).ok, true);
  run(s, 0.2);
  assert.equal(f.act.op, 'gather');
});

test('L2 設備指令：空格不能設配方；負數或超出的格子不能安裝', () => {
  const s = FG.newGame(2);
  const t = central(s);
  t.storage = { '木枝': 20, '月光花': 20, '月石': 20 };
  const empty = t.devices.findIndex(d => !d);
  assert.equal(FG.cmd.setRecipe(s, t.id, empty, 'nectar').ok, false);
  assert.equal(FG.cmd.addDevice(s, t.id, -1, 'brewer').ok, false);
  assert.equal(FG.cmd.addDevice(s, t.id, t.slots, 'brewer').ok, false);
  assert.equal(FG.cmd.addDevice(s, t.id, 0, 'brewer').ok, false);
  assert.equal(FG.cmd.addDevice(s, t.id, empty, 'brewer').ok, true);
});

test('地圖：半徑 16 共 817 格；中心 2 格內都是草地；每朵花的設備格數等於格數', () => {
  const s = FG.newGame(1);
  assert.equal(Object.keys(s.tiles).length, 817);
  for (const t of Object.values(s.tiles)) if (FG.hex.dist(t, { q: 0, r: 0 }) <= 2) assert.equal(t.t, 'grass');
  for (const L of [1, 2, 3]) for (const t of FG.flowers(FG.newGame(L))) assert.equal(t.devices.length, t.slots);
});

test('訂單：不存在或已完成不能交付；剛好足量可以交付；庫存足夠也不會自動完成', () => {
  const s = FG.newGame(1);
  idleAll(s); noBrew(s);
  const t = central(s), order = s.goals.find(g => g.kind === 'order');
  assert.equal(FG.cmd.fulfillOrder(s, 'nope').ok, false);
  assert.equal(FG.cmd.fulfillOrder(s, s.goals.find(g => g.kind !== 'order').id).ok, false);
  t.storage = { [order.item]: order.n };
  run(s, 1);
  assert.equal(order.done, false);
  assert.equal(FG.cmd.fulfillOrder(s, order.id).ok, true);
  t.storage = { [order.item]: order.n };
  assert.equal(FG.cmd.fulfillOrder(s, order.id).ok, false);
  for (const g of s.goals) g.done = true;
  run(s, 1);
  const at = s.completeAt;
  run(s, 2);
  assert.equal(s.completeAt, at);
});

test('解鎖與上限：未解鎖的建築、設備不能用；精靈最多 16 隻', () => {
  const s = FG.newGame(1);
  clearTile(s, 3, 0);
  assert.equal(FG.cmd.canPlace(s, 'barrier', 3, 0).ok, false);
  assert.equal(FG.cmd.canPlace(s, 'nope', 3, 0).ok, false);
  const t = central(s);
  t.storage = { '月石': 50, '木枝': 50 };
  assert.equal(FG.cmd.addDevice(s, t.id, 1, 'transmuter').ok, false);
  assert.equal(FG.cmd.addDevice(s, t.id, 1, 'nope').ok, false);
  while (fairies(s).length < 15) { t.storage = { '花蜜': 10, '月光花': 10 }; FG.cmd.summonFairy(s, t.id); }
  t.storage = { '花蜜': 10, '月光花': 10 };
  assert.equal(FG.cmd.summonFairy(s, t.id).ok, true);
  t.storage = { '花蜜': 10, '月光花': 10 };
  assert.equal(FG.cmd.summonFairy(s, t.id).ok, false);
});

test('通道：終點必須是另一朵花；起點消失時通道移除；花到花運送指定物品；只剩 1 單位也送', () => {
  const s = FG.newGame(3);
  idleAll(s); noBrew(s);
  const c = central(s), lake = FG.flowers(s).find(e => !e.central);
  clearTile(s, 0, 3); clearTile(s, 5, -2);
  const b = s.ents[FG.spawnBuilding(s, 'barrier', 0, 3)];
  const a = FG.spawnBuilding(s, 'anchor', 5, -2);
  assert.equal(FG.cmd.buildChannel(s, [b.id, a], null).ok, false);
  assert.equal(FG.cmd.buildChannel(s, [c.id, a, c.id], '月石').ok, false);
  b.buf = 1; b.charge = 0;
  const ch = FG.cmd.buildChannel(s, [b.id, c.id], null).id;
  c.storage = { '月石': 1 };
  lake.storage = {};
  FG.cmd.buildChannel(s, [c.id, a, lake.id], '月石');
  run(s, 12);
  assert.equal(c.storage['陽光'], 1);
  assert.equal(lake.storage['月石'], 1);
  delete s.ents[b.id];
  run(s, 0.2);
  assert.equal(s.channels[ch], undefined);
});

test('農田：沒播種不會長；有滋養的田 30 秒成熟（第 2 章）', () => {
  const s = FG.newGame(2);
  idleAll(s);
  clearTile(s, -3, 0); clearTile(s, -5, 0);
  const a = s.ents[FG.spawnBuilding(s, 'farm', -3, 0)];
  const b = s.ents[FG.spawnBuilding(s, 'farm', -5, 0)];
  b.fert = FG.FERT_MAX; FG.ops.plant(s, b);
  run(s, 31);
  assert.equal(a.growth, 0);
  assert.equal(b.growth, 1);
});

test('營造：滋養剩 6 的田也算缺滋養（剛好放得下一瓶）', () => {
  const s = FG.newGame(2);
  idleAll(s); noBrew(s);
  for (const e of Object.values(s.ents)) if (e.type === 'farm') e.fert = FG.FERT_MAX;
  clearTile(s, -3, 0);
  const farm = s.ents[FG.spawnBuilding(s, 'farm', -3, 0)]; farm.fert = FG.FERT_MAX - FG.NOURISH_HARVESTS;
  central(s).storage = { '滋養露': 2 };
  const [f] = fairies(s);
  FG.cmd.setTask(s, f.id, { kind: 'build' });
  run(s, 10);
  assert.equal(farm.fert, FG.FERT_MAX);
});

test('交付：滋養露只給第 2 章以後的農田；結界只收結界晶', () => {
  const s1 = FG.newGame(1);
  clearTile(s1, 3, 0);
  const farm1 = FG.spawnBuilding(s1, 'farm', 3, 0);
  assert.equal(FG.ops.deliver(s1, farm1, '滋養露', 1), 0);
  const s = FG.newGame(2);
  clearTile(s, -3, 0); clearTile(s, -5, 0);
  const bar = FG.spawnBuilding(s, 'barrier', -3, 0), farm = FG.spawnBuilding(s, 'farm', -5, 0);
  assert.equal(FG.ops.deliver(s, bar, '木枝', 1), 0);
  assert.equal(FG.ops.deliver(s, bar, '滋養露', 1), 0);
  assert.equal(FG.ops.deliver(s, farm, '結界晶', 1), 0);
});

test('沒有花蜜時休息，活力慢慢回升', () => {
  const s = FG.newGame(1);
  idleAll(s); noBrew(s);
  const t = central(s), [f] = fairies(s);
  t.storage = {};
  f.energy = 5;
  run(s, 4);
  assert.ok(f.energy > 9 && f.energy < 20, String(f.energy));
  assert.match(f.msg, /花蜜/);
});

test('範圍：剛好在範圍邊界上的資源算在內', () => {
  const s = FG.newGame(1);
  idleAll(s); noBrew(s);
  onlyForestAt(s, 4, 0);
  const t = central(s), [f] = fairies(s);
  FG.cmd.setTask(s, f.id, { kind: 'collect', item: '木枝', radius: 4 });
  run(s, 15);
  assert.ok((t.storage['木枝'] || 0) > 4);
});

test('種植：收成 3 朵就先送回家；家裡沒種子時說明', () => {
  const s = FG.newGame(1);
  idleAll(s); noBrew(s);
  clearTile(s, 2, 0); clearTile(s, 3, 0);
  FG.spawnBuilding(s, 'farm', 2, 0); FG.spawnBuilding(s, 'farm', 3, 0);
  const t = central(s), [f, g] = fairies(s);
  putAt(s, f, 2, 0); f.hold = { item: '月光花', n: 3 };
  FG.cmd.setTask(s, f.id, { kind: 'farm' });
  run(s, 0.1);
  assert.equal(f.act.op, 'move');
  assert.equal(f.act.key, K(0, 0));
  t.storage = {};
  FG.cmd.setTask(s, g.id, { kind: 'farm' });
  run(s, 0.2);
  assert.match(g.msg, /可以播種/);
});

test('運送：目標設成自己的家也算無效', () => {
  const s = FG.newGame(3);
  idleAll(s);
  const c = central(s), f = fairies(s).find(x => x.home === c.id);
  c.storage = { '月石': 5 };
  FG.cmd.setTask(s, f.id, { kind: 'haul', item: '月石', at: { flower: c.id } });
  run(s, 2);
  assert.match(f.msg, /另一朵/);
  assert.equal(c.storage['月石'], 5);
});

test('設備：原料剛好夠（保留 0）就會開工', () => {
  const s = FG.newGame(1);
  idleAll(s);
  const t = central(s), d = t.devices.find(x => x && x.type === 'brewer');
  d.keep = 0; d.limit = 10;
  t.storage = { '月光花': 2 };
  run(s, 5);
  assert.equal(t.storage['花蜜'], 1);
  assert.equal(t.storage['月光花'], 0);
});

test('預訂：採收完成後釋放，別的精靈可以接手', () => {
  const s = FG.newGame(1);
  idleAll(s); noBrew(s);
  clearTile(s, 2, 0);
  const farm = s.ents[FG.spawnBuilding(s, 'farm', 2, 0)];
  farm.planted = true; farm.growth = 1;
  const [f] = fairies(s);
  FG.cmd.setTask(s, f.id, { kind: 'farm' });
  run(s, 3);
  assert.equal(Object.keys(s.claims).length, 0);
});

test('結界：花海上產得比較快；沒有能量時變慢', () => {
  const s = FG.newGame(2);
  idleAll(s);
  clearTile(s, -3, 0, 'meadow'); clearTile(s, -5, 0, 'grass'); clearTile(s, -7, 0, 'grass');
  const m = s.ents[FG.spawnBuilding(s, 'barrier', -3, 0)], g = s.ents[FG.spawnBuilding(s, 'barrier', -5, 0)], z = s.ents[FG.spawnBuilding(s, 'barrier', -7, 0)];
  assert.equal(m.fast, true); assert.equal(g.fast, false);
  z.charge = 0;
  run(s, 12);
  assert.ok(m.buf > g.buf);
  assert.equal(z.buf, 0);
});
