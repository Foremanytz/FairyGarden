import test from 'node:test';
import assert from 'node:assert/strict';
import { FG, K, central, fairies, run, idleAll, noBrew, clearTile, onlyForestAt } from './helpers.mjs';

test('層級：花田、魔法之花在地面層；結界、光之錨在低空層', () => {
  assert.equal(FG.LAYER.farm, 'ground');
  assert.equal(FG.LAYER.flower, 'ground');
  assert.equal(FG.LAYER.barrier, 'air');
  assert.equal(FG.LAYER.anchor, 'air');
});

test('結界可以和花田疊在同一格', () => {
  const s = FG.newGame(3);
  clearTile(s, 3, 0);
  const farm = FG.spawnBuilding(s, 'farm', 3, 0);
  const r1 = FG.cmd.placeBlueprint(s, 'barrier', 3, 0);
  assert.equal(r1.ok, true);
  assert.equal(FG.entOn(s, 3, 0, 'ground'), farm);
  assert.equal(FG.entOn(s, 3, 0, 'air'), r1.id);
});

test('魔法之花所在的格子不能再蓋任何建築（中央與其他花都一樣）', () => {
  const s = FG.newGame(3);
  const lake = FG.flowers(s).find(e => !e.central);
  for (const f of [central(s), lake]) for (const type of ['barrier', 'anchor', 'farm', 'flower']) {
    const r = FG.cmd.placeBlueprint(s, type, f.q, f.r);
    assert.equal(r.ok, false, type);
    assert.match(r.reason, /魔法之花/);
  }
  assert.deepEqual(s.tiles[K(0, 0)].ents, [central(s).id]);
});

test('魔法之花藍圖所在的格子也不能再蓋；低空有東西的格子不能蓋魔法之花', () => {
  const s = FG.newGame(3);
  clearTile(s, -6, 6); clearTile(s, 6, 3);
  assert.equal(FG.cmd.placeBlueprint(s, 'flower', -6, 6).ok, true);
  assert.equal(FG.cmd.placeBlueprint(s, 'barrier', -6, 6).ok, false);
  FG.spawnBuilding(s, 'anchor', 6, 3);
  const r = FG.cmd.placeBlueprint(s, 'flower', 6, 3);
  assert.equal(r.ok, false);
  assert.match(r.reason, /低空/);
});

test('同一格同一層不能放兩個；花田藍圖可以放在已有結界的格子', () => {
  const s = FG.newGame(3);
  clearTile(s, 3, 0);
  FG.spawnBuilding(s, 'barrier', 3, 0);
  assert.equal(FG.cmd.placeBlueprint(s, 'anchor', 3, 0).ok, false);
  assert.equal(FG.cmd.placeBlueprint(s, 'barrier', 3, 0).ok, false);
  const r = FG.cmd.placeBlueprint(s, 'farm', 3, 0);
  assert.equal(r.ok, true);
  assert.equal(FG.cmd.placeBlueprint(s, 'farm', 3, 0).ok, false);
});

test('結界不能蓋在水面上；光之錨可以', () => {
  const s = FG.newGame(3);
  clearTile(s, 3, 0, 'water');
  assert.equal(FG.cmd.canPlace(s, 'barrier', 3, 0).ok, false);
  assert.equal(FG.cmd.canPlace(s, 'farm', 3, 0).ok, false);
  assert.equal(FG.cmd.canPlace(s, 'anchor', 3, 0).ok, true);
});

test('森林上的結界不擋採木枝；結界產風語', () => {
  const s = FG.newGame(2);
  idleAll(s); noBrew(s);
  onlyForestAt(s, 1, 0);
  const b = s.ents[FG.spawnBuilding(s, 'barrier', 1, 0)];
  assert.equal(b.elem, '風語');
  const t = central(s), [f] = fairies(s);
  const before = t.storage['木枝'] || 0;
  FG.cmd.setTask(s, f.id, { kind: 'collect', item: '木枝' });
  run(s, 20);
  assert.ok((t.storage['木枝'] || 0) - before >= 5);
});

test('拆掉低空物件不影響地面物件，反之亦然', () => {
  const s = FG.newGame(3);
  clearTile(s, 3, 0);
  const farm = FG.spawnBuilding(s, 'farm', 3, 0);
  const bar = FG.spawnBuilding(s, 'barrier', 3, 0);
  assert.equal(FG.cmd.demolish(s, bar).ok, true);
  assert.equal(FG.entOn(s, 3, 0, 'ground'), farm);
  assert.equal(FG.entOn(s, 3, 0, 'air'), null);
  const bar2 = FG.spawnBuilding(s, 'barrier', 3, 0);
  FG.cmd.demolish(s, farm);
  assert.equal(FG.entOn(s, 3, 0, 'air'), bar2);
  assert.equal(FG.entOn(s, 3, 0, 'ground'), null);
});

test('花田上方的結界依地形產陽光，花田照常生長', () => {
  const s = FG.newGame(2);
  idleAll(s);
  clearTile(s, 3, 0);
  const farm = s.ents[FG.spawnBuilding(s, 'farm', 3, 0)];
  const b = s.ents[FG.spawnBuilding(s, 'barrier', 3, 0)];
  assert.equal(b.elem, '陽光');
  farm.fert = FG.FERT_MAX; FG.ops.plant(s, farm);
  run(s, 31);
  assert.equal(farm.growth, 1);
  assert.ok(b.buf >= 5);
});
