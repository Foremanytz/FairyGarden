import test from 'node:test';
import assert from 'node:assert/strict';
import { FG, central, fairies, run, idleAll, noBrew, clearTile, onlyForestAt, atHome } from './helpers.mjs';

test('指令單預設：目標地點為家、範圍 20', () => {
  const s = FG.newGame(1);
  const [f] = fairies(s);
  assert.equal(FG.cmd.setTask(s, f.id, { kind: 'collect', item: '木枝' }).ok, true);
  assert.equal(f.task.kind, 'collect');
  assert.equal(f.task.item, '木枝');
  assert.equal(f.task.at, null);
  assert.equal(f.task.radius, FG.DEFAULT_RADIUS);
  assert.equal(FG.DEFAULT_RADIUS, 20);
});

test('選了需要物品的動作，物品先留空，精靈待命並說明；選好物品才開工', () => {
  const s = FG.newGame(1);
  idleAll(s);
  onlyForestAt(s, 1, 0);
  const t = central(s), [f] = fairies(s);
  for (const kind of ['collect', 'haul']) {
    FG.cmd.setTask(s, f.id, { kind });
    assert.equal(f.task.item, null);
    run(s, 2);
    assert.match(f.msg, /請選擇物品/);
  }
  assert.equal(FG.cmd.setTask(s, f.id, { kind: 'collect', item: '不存在' }).ok, true);
  assert.equal(f.task.item, null);
  const before = t.storage['木枝'] || 0;
  FG.cmd.setTask(s, f.id, { kind: 'collect', item: '木枝' });
  run(s, 15);
  assert.ok((t.storage['木枝'] || 0) > before);
});

test('召喚的新精靈預設任務是營造', () => {
  const s = FG.newGame(2);
  const t = central(s);
  t.storage = { '花蜜': 10, '月光花': 10 };
  const r = FG.cmd.summonFairy(s, t.id);
  assert.equal(s.fairies[r.id].task.kind, 'build');
  assert.equal(FG.TASKS.build.name, '營造');
  assert.equal(FG.TASKS.maintain, undefined);
});

test('收集地形資源：採木枝送回家', () => {
  const s = FG.newGame(1);
  idleAll(s);
  onlyForestAt(s, 1, 0);
  const t = central(s), [f] = fairies(s);
  const before = t.storage['木枝'] || 0;
  FG.cmd.setTask(s, f.id, { kind: 'collect', item: '木枝' });
  run(s, 30);
  assert.ok((t.storage['木枝'] || 0) - before >= 5);
});

test('收集元素：只去產出該元素的結界', () => {
  const s = FG.newGame(2);
  idleAll(s); noBrew(s);
  const t = central(s);
  clearTile(s, -4, 1, 'rock'); clearTile(s, -3, 0, 'grass');
  const wind = s.ents[FG.spawnBuilding(s, 'barrier', -4, 1)];
  const sun = s.ents[FG.spawnBuilding(s, 'barrier', -3, 0)];
  wind.buf = 5; sun.buf = 5;
  const [f] = fairies(s);
  FG.cmd.setTask(s, f.id, { kind: 'collect', item: '陽光' });
  run(s, 15);
  assert.ok((t.storage['陽光'] || 0) >= 3);
  assert.ok(wind.buf >= 5);
  assert.equal(t.storage['土息'] || 0, 0);
});

test('範圍限制：範圍外的資源不去，待命並說明原因', () => {
  const s = FG.newGame(1);
  idleAll(s);
  onlyForestAt(s, 6, 0);
  const t = central(s), [f] = fairies(s);
  const before = t.storage['木枝'] || 0;
  FG.cmd.setTask(s, f.id, { kind: 'collect', item: '木枝', radius: 3 });
  run(s, 10);
  assert.equal(t.storage['木枝'] || 0, before);
  assert.ok(atHome(s, f));
  assert.match(f.msg, /範圍/);
  FG.cmd.setTask(s, f.id, { kind: 'collect', item: '木枝', radius: 8 });
  run(s, 30);
  assert.ok((t.storage['木枝'] || 0) > before);
});

test('種植：從家拿月光花播種、採收、送回家（每次收 4 朵）', () => {
  const s = FG.newGame(1);
  idleAll(s); noBrew(s);
  const t = central(s);
  t.storage = { '月光花': 6 };
  clearTile(s, 2, 0);
  const farm = s.ents[FG.spawnBuilding(s, 'farm', 2, 0)];
  const [f] = fairies(s);
  FG.cmd.setTask(s, f.id, { kind: 'farm' });
  run(s, 40);
  assert.ok((s.stats.produced['月光花'] || 0) >= 4);
  assert.ok(t.storage['月光花'] >= 8);
  assert.equal(farm.planted, true);
});

test('營造：自己判斷藍圖缺什麼材料，分批搬過去並施工到完工', () => {
  const s = FG.newGame(2);
  idleAll(s);
  const t = central(s);
  t.storage = { '月石': 10, '木枝': 10 };
  clearTile(s, -3, 0);
  const bp = FG.cmd.placeBlueprint(s, 'barrier', -3, 0);
  assert.equal(bp.ok, true);
  const [f] = fairies(s);
  FG.cmd.setTask(s, f.id, { kind: 'build' });
  run(s, 12);
  assert.equal(s.ents[bp.id].type, 'blueprint');
  assert.ok(s.ents[bp.id].work > 0);
  run(s, 25);
  assert.equal(s.ents[bp.id].type, 'barrier');
  assert.equal(t.storage['月石'], 7);
  assert.equal(t.storage['木枝'], 8);
});

test('營造：沒有藍圖時自動送滋養露給花田、結界晶給結界', () => {
  const s = FG.newGame(2);
  idleAll(s); noBrew(s);
  const t = central(s);
  for (const e of Object.values(s.ents)) if (e.type === 'farm') e.fert = FG.FERT_MAX;
  t.storage = { '滋養露': 3, '結界晶': 2 };
  clearTile(s, -3, 0); clearTile(s, -4, 1, 'rock');
  const farm = s.ents[FG.spawnBuilding(s, 'farm', -3, 0)]; farm.fert = 0;
  const bar = s.ents[FG.spawnBuilding(s, 'barrier', -4, 1)]; bar.charge = 0.5;
  const [f] = fairies(s);
  FG.cmd.setTask(s, f.id, { kind: 'build' });
  run(s, 25);
  assert.ok(farm.fert >= FG.NOURISH_HARVESTS);
  assert.ok(bar.charge > 1);
});

test('運送：搬到目標那朵魔法之花；目標不是花時待命', () => {
  const s = FG.newGame(3);
  idleAll(s); noBrew(s);
  const c = central(s), lake = FG.flowers(s).find(e => !e.central);
  c.storage = { '月石': 14 }; lake.storage = {};
  const f = fairies(s).find(x => x.home === c.id);
  FG.cmd.setTask(s, f.id, { kind: 'haul', item: '月石' });
  run(s, 3);
  assert.match(f.msg, /目標/);
  assert.equal(c.storage['月石'], 14);
  FG.cmd.setTask(s, f.id, { kind: 'haul', item: '月石', at: { flower: lake.id } });
  run(s, 60);
  assert.ok(lake.storage['月石'] >= 5);
  assert.ok(c.storage['月石'] <= 9);
});

test('做不了就待命：沒有藍圖時不動並說明，放了藍圖就開工', () => {
  const s = FG.newGame(1);
  idleAll(s);
  const t = central(s);
  t.storage = { '木枝': 4 };
  const [f] = fairies(s);
  FG.cmd.setTask(s, f.id, { kind: 'build' });
  run(s, 3);
  assert.ok(atHome(s, f));
  assert.match(f.msg, /營造/);
  clearTile(s, 3, 0);
  const bp = FG.cmd.placeBlueprint(s, 'farm', 3, 0);
  run(s, 25);
  assert.equal(s.ents[bp.id].type, 'farm');
});

test('活力：低活力回家吃花蜜，之後繼續原任務', () => {
  const s = FG.newGame(1);
  idleAll(s); noBrew(s);
  onlyForestAt(s, 1, 0);
  const t = central(s), [f] = fairies(s);
  t.storage = { '花蜜': 4 };
  FG.cmd.setTask(s, f.id, { kind: 'collect', item: '木枝' });
  f.energy = 5;
  run(s, 5);
  assert.ok(f.energy > 80);
  assert.equal(t.storage['花蜜'], 3);
  run(s, 20);
  assert.ok((t.storage['木枝'] || 0) >= 5);
});
