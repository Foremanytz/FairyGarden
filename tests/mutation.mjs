// 變異測試：只變異 index.html 的 <script id="fg-core">（「工具」區段之後的程式邏輯），
// 每個變異跑一次全部單元測試，算殺死率。用法：node tests/mutation.mjs [樣本數=120] [種子=1]
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const htmlPath = fileURLToPath(new URL('../index.html', import.meta.url));
const orig = readFileSync(htmlPath, 'utf8');
const N = +(process.argv[2] || 120), seed0 = +(process.argv[3] || 1);
const start = orig.indexOf('// ---------- 工具 ----------'), end = orig.indexOf('globalThis.FG = {');
const OPS = [[' < ', ' <= '], [' <= ', ' < '], [' > ', ' >= '], [' >= ', ' > '], [' === ', ' !== '], [' !== ', ' === '],
  [' && ', ' || '], [' || ', ' && '], [' + 1', ' - 1'], [' - 1', ' + 1'], ['true', 'false'], ['false', 'true'], ['(!', '(']];
const mutants = [];
let pos = start;
for (const line of orig.slice(start, end).split('\n')) {
  const t = line.trim();
  if (t && !t.startsWith('//') && !/emit\(|fx\.push|throw new Error/.test(t)) {
    for (const [a, b] of OPS) { let i = line.indexOf(a); while (i >= 0) { mutants.push({ at: pos + i, a, b, line: t.slice(0, 90) }); i = line.indexOf(a, i + 1); } }
  }
  pos += line.length + 1;
}
let r = seed0; const rnd = () => (r = (r * 1103515245 + 12345) % 2147483648) / 2147483648;
const pick = mutants.map(m => [rnd(), m]).sort((x, y) => x[0] - y[0]).slice(0, N).map(x => x[1]);
const tests = ['tests/core.test.mjs', 'tests/tasks.test.mjs', 'tests/storage.test.mjs', 'tests/edges.test.mjs', 'tests/layers.test.mjs', 'tests/economy.test.mjs', 'tests/playthrough.test.mjs'];
let killed = 0; const survived = [];
try {
  for (const m of pick) {
    writeFileSync(htmlPath, orig.slice(0, m.at) + m.b + orig.slice(m.at + m.a.length));
    let dead = false;
    try { execFileSync('node', ['--test', ...tests], { stdio: 'pipe', timeout: 60000 }); } catch { dead = true; }
    if (dead) killed++; else survived.push(m);
  }
} finally { writeFileSync(htmlPath, orig); }
for (const m of survived) console.log('SURVIVED', JSON.stringify(m.a), '→', JSON.stringify(m.b), '|', m.line);
const rate = killed / pick.length;
console.log(`candidates ${mutants.length}, sampled ${pick.length}, killed ${killed}, survived ${survived.length}`);
console.log('GATE_RESULT: ' + JSON.stringify({ tool: 'tests/mutation.mjs', mutants: pick.length, killed, rate: +rate.toFixed(3), threshold: 0.8, pass: rate >= 0.8 }));
process.exit(rate >= 0.8 ? 0 : 1);
