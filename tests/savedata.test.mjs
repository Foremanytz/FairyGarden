import test from 'node:test';
import assert from 'node:assert/strict';
import { FG } from './helpers.mjs';

// 模擬瀏覽器的 localStorage：同一個瀏覽器裡還有其他網站、其他遊戲的資料
function fakeStorage(entries) {
  const m = new Map(entries);
  return {
    get length() { return m.size; },
    key: i => [...m.keys()][i] ?? null,
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: k => { m.delete(k); },
    clear: () => { throw new Error('不可呼叫 clear()'); },
    map: m,
  };
}
const OTHERS = [['otherGame.save', '{"lv":9}'], ['fairygarden', 'x'], ['xfairygarden.v1', 'y'], ['FairyGarden.v1', 'z'], ['theme', 'dark']];
const OWN = [['fairygarden.v1', '{"unlocked":2,"saves":{}}'], ['fairygarden.v1.broken', '{bad'], ['fairygarden.sound', '0']];

test('只認得鍵名以 fairygarden. 開頭的項目', () => {
  const ls = fakeStorage([OTHERS[0], OWN[0], OTHERS[1], OWN[1], OTHERS[2], OTHERS[3], OWN[2], OTHERS[4]]);
  assert.equal(FG.SAVE_PREFIX, 'fairygarden.');
  assert.deepEqual(FG.ownKeys(ls).sort(), OWN.map(e => e[0]).sort());
});

test('清空只刪本遊戲的鍵，其他網站的資料原封不動，也不呼叫 clear()', () => {
  // 本遊戲的鍵連續排列：逐一刪除時索引會位移，要確定一個都沒漏
  const ls = fakeStorage([...OWN, ...OTHERS]);
  const removed = FG.clearOwnKeys(ls);
  assert.deepEqual(removed.sort(), OWN.map(e => e[0]).sort());
  assert.deepEqual([...ls.map.entries()], OTHERS);
});

test('沒有本遊戲的資料時清空什麼都不做', () => {
  const ls = fakeStorage(OTHERS);
  assert.deepEqual(FG.clearOwnKeys(ls), []);
  assert.deepEqual([...ls.map.entries()], OTHERS);
  assert.deepEqual(FG.clearOwnKeys(fakeStorage([])), []);
});

test('存檔加上遊戲名稱、用途說明、主頁網址，原本的進度不變', () => {
  const st = { unlocked: 2, saves: { 1: '{"v":5}' } };
  const out = FG.withSaveInfo(st);
  assert.equal(out.homepage, 'https://github.com/Foremanytz/FairyGarden');
  assert.match(out.game, /花靈物語/);
  assert.match(out.about, /fairygarden\./);
  assert.match(out.about, /不影響其他網站/);
  assert.equal(out.unlocked, 2);
  assert.deepEqual(out.saves, st.saves);
  // 說明欄位排在最前面，打開存檔的人第一眼就看得到
  assert.deepEqual(Object.keys(out).slice(0, 3), ['game', 'about', 'homepage']);
  assert.deepEqual(JSON.parse(JSON.stringify(out)), out);
});

test('舊說明欄位會被換成目前的內容', () => {
  const out = FG.withSaveInfo({ game: '舊', about: '舊', homepage: 'http://old', unlocked: 1, saves: {} });
  assert.equal(out.homepage, FG.SAVE_INFO.homepage);
  assert.equal(out.game, FG.SAVE_INFO.game);
  assert.equal(out.about, FG.SAVE_INFO.about);
});
