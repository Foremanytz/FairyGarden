# Fairy Garden

精靈花園：用積木腳本經營的魔法自動化農場。單一 `index.html`，以 Chrome 開啟即可遊玩（目標解析度 1920×1080）。

- 第一章 中央魔法塔：藍圖建造、種植採收、塔內釀造花蜜、精靈腳本
- 第二章 擴充與維護：塔內空間擴充、元素轉化器、魔力收集結界、設施維護、第二座塔
- 第三章 流動通道：光之錨與高空通道、跨塔加工鏈

進度存在瀏覽器 localStorage。

## 測試

```bash
node --test tests/core.test.mjs          # 核心邏輯
node tests/smoke.mjs <截圖資料夾>          # 瀏覽器冒煙測試（需要 Playwright）
```
