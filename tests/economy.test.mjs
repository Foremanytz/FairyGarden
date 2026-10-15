import test from 'node:test';
import assert from 'node:assert/strict';
import { FG, K, central, fairies, run, idleAll, noBrew, clearTile } from './helpers.mjs';

const meadowOnly = (s, cells) => { for (const k in s.tiles) if (s.tiles[k].t === 'meadow') s.tiles[k].t = 'grass'; for (const [q, r] of cells) clearTile(s, q, r, 'meadow'); };

test('野生月光花：每格最多 3 朵，每朵 8 秒，採完每 40 秒長回 1 朵', () => {
  assert.equal(FG.WILD_MAX, 3); assert.equal(FG.WILD_TIME, 8); assert.equal(FG.WILD_REGROW, 40);
  const s = FG.newGame(1);
  idleAll(s); noBrew(s);
  meadowOnly(s, [[2, 0]]);
  const tile = s.tiles[K(2, 0)];
  assert.equal(tile.wild, 3);
  const t = central(s), [f] = fairies(s);
  t.storage = { '花蜜': 10 };
  FG.cmd.setTask(s, f.id, { kind: 'collect', item: '月光花' });
  run(s, 10);
  assert.equal(tile.wild, 2);
  run(s, 16);
  assert.equal(tile.wild, 0);
  run(s, 3);
  assert.match(f.msg, /月光花/);
  FG.cmd.setTask(s, f.id, { kind: 'idle' });
  run(s, 41);
  assert.ok(tile.wild >= 1);
});

test('一瓶滋養露撐 6 次採收；滋養用完後生長變慢', () => {
  const s = FG.newGame(2);
  idleAll(s);
  clearTile(s, 3, 0);
  const farm = s.ents[FG.spawnBuilding(s, 'farm', 3, 0)];
  farm.fert = 0;
  assert.equal(FG.ops.deliver(s, farm.id, '滋養露', 1), 1);
  assert.equal(farm.fert, 6);
  for (let i = 0; i < 6; i++) { FG.ops.plant(s, farm); farm.growth = 1; assert.equal(FG.ops.harvest(s, farm), 4); }
  assert.equal(farm.fert, 0);
  FG.ops.plant(s, farm);
  run(s, 35);
  assert.ok(farm.growth < 1);
});

test('一顆結界晶讓結界產出 40 單位', () => {
  assert.equal(FG.CRYSTAL_UNITS, 40);
  const s = FG.newGame(2);
  idleAll(s);
  clearTile(s, 3, 0);
  const b = s.ents[FG.spawnBuilding(s, 'barrier', 3, 0)];
  b.charge = 1;
  let made = 0;
  for (let i = 0; i < 42; i++) { b.buf = 0; run(s, 5); made += b.buf; }
  assert.ok(made >= 40 && made <= 41, String(made));
  assert.equal(b.charge, 0);
});

test('花蜜只能由花蜜釀造台製作', () => {
  const s = FG.newGame(2);
  const t = central(s);
  t.storage = { '月石': 10, '木枝': 10 };
  const slot = t.devices.findIndex(d => !d);
  FG.cmd.addDevice(s, t.id, slot, 'transmuter');
  assert.equal(FG.cmd.setRecipe(s, t.id, slot, 'nectar').ok, false);
  assert.notEqual(t.devices[slot].recipe, 'nectar');
  const brew = t.devices.findIndex(d => d && d.type === 'brewer');
  assert.equal(FG.cmd.setRecipe(s, t.id, brew, 'nectar').ok, true);
});

test('收益：10 分鐘內 1 隻精靈顧 3 塊花田，月光花淨產量至少是採野生的 2 倍', () => {
  const sim = setup => {
    const s = FG.newGame(1);
    idleAll(s); noBrew(s);
    meadowOnly(s, [[6, -2], [6, -3], [7, -3], [7, -2], [5, -2], [6, -1]]);
    const t = central(s), [f] = fairies(s);
    t.storage = { '花蜜': 30, '月光花': 3 }; t.cap = 999;
    setup(s, f);
    run(s, 600);
    return t.storage['月光花'] - 3;
  };
  const farmed = sim((s, f) => { for (const [q, r] of [[2, 0], [1, 1], [2, -1]]) { clearTile(s, q, r); FG.spawnBuilding(s, 'farm', q, r); } FG.cmd.setTask(s, f.id, { kind: 'farm' }); });
  const wild = sim((s, f) => FG.cmd.setTask(s, f.id, { kind: 'collect', item: '月光花' }));
  assert.ok(wild > 0, 'wild ' + wild);
  assert.ok(farmed >= 2 * wild, `farmed ${farmed} wild ${wild}`);
});

test('維護：材料到齊後要有精靈在場施工；兩隻一起施工比較快', () => {
  assert.deepEqual([FG.BUILD_TIME.farm, FG.BUILD_TIME.barrier, FG.BUILD_TIME.anchor, FG.BUILD_TIME.flower], [5, 10, 10, 30]);
  const s = FG.newGame(1);
  idleAll(s);
  clearTile(s, 2, 0);
  const bp = FG.cmd.placeBlueprint(s, 'farm', 2, 0);
  FG.ops.deliver(s, bp.id, '木枝', 2);
  run(s, 10);
  assert.equal(s.ents[bp.id].type, 'blueprint');
  const [f, g] = fairies(s);
  FG.cmd.setTask(s, f.id, { kind: 'build' }); FG.cmd.setTask(s, g.id, { kind: 'build' });
  run(s, 4.5);
  assert.equal(s.ents[bp.id].type, 'farm');
});
