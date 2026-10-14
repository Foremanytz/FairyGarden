// 從 index.html 抽出 <script id="fg-core">（純邏輯、不碰 DOM）放進 vm 執行，回傳 FG
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const htmlPath = fileURLToPath(new URL('../index.html', import.meta.url));

export function loadFG() {
  const html = readFileSync(htmlPath, 'utf8');
  const m = html.match(/<script id="fg-core">([\s\S]*?)<\/script>/);
  if (!m) throw new Error('index.html 缺少 <script id="fg-core">');
  // 在同一個 realm 執行，物件原型與測試端一致（deepStrictEqual 才不會誤判）
  vm.runInThisContext(m[1], { filename: 'index.html#fg-core' });
  return globalThis.FG;
}
