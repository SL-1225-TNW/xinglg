---
name: xinglu-render-performance
description: 苔芽农场的渲染与运行时口径——主循环、相机、视口缩放/DPR、地面分块烘焙、粒子与存档去抖。Use when the game 卡顿/掉帧/抖动, when touching frame()/drawScene()/resizeCanvas()/drawGround()/groundChunk(), when adding per-frame drawing (new decor, fx, overlays), or when a 缩放错位/画面被拉伸/half-pixel 抖动 bug appears on mobile or high-DPR screens.
---

# 苔芽农场 · 渲染与运行时口径

> 行号基准：2026-10-22；行号会漂移，先 grep 再用。

画面全部是**程序化像素绘制**（`px(g,x,y,w,h,col)` 就是 `fillRect`，game.js:17989），没有图片资源；
所以"多画一个像素"就是真实成本，"每帧重建一个 canvas"就是真实卡顿。

## 主循环

```js
var lastT = 0;
function frame(ts) {                     // game.js:20181
  requestAnimationFrame(frame);          // 自调度，不依赖外部定时器
  if (!state) return;
  var dt = lastT ? Math.min(0.1, (ts - lastT) / 1000) : 0;   // 夹到 100ms：切后台回来不会瞬移
  lastT = ts; clock += dt;
  tickPersonal(dt); tickPlayer(dt); tickNpc(dt); tickAnimals(dt);
  tickTime(dt); tickFishing(dt); tickParticles(dt);
  if (state.sceneId === 'farm') { ensurePondFish(); tickPondFish(dt); }
  tickTutorial(dt);
  drawScene(ctx, dt);
}
```

规矩：**tick 只算状态、drawScene 只画**。不要在主循环里 resize、写 `localStorage`、批量改 DOM
（存档走 `markDirty()`，去抖 `CFG.saveDebounceMs = 750`；HUD 走 `refreshHud()`，由事件触发）。

## 相机（drawScene，game.js:19557）

- 目标：`tX = clamp(ppos.x - VIEW_W/2, 0, maxX)`，`maxY` 那一侧还留 `-4` 的视觉偏移；小地图（`maxX===0`）用负偏移居中。
- 特殊取景：`city`（城堡高塔）与 `palace_grounds`（宫门立面）有**平滑偏置**，只挪 `tY`，不动坐标系、碰撞、点击映射；
  加类似取景必须遵守这一点，否则点击与站位会错。
- 平滑：`cam.x += (tX - cam.x) * Math.min(1, dt * 12)`。
- **`var ox = Math.round(cam.x), oy = Math.round(cam.y)`** 必须取整：不取整会在瓦片缝上出现半像素抖动/黑线。
- 世界实体统一 `g.translate(-ox, -oy)`，屏幕叠层在 `restore` 之后画。

## 视口与 DPR（resizeCanvas，game.js:20124）

- `dpr = clamp(devicePixelRatio || 1, 1, 3)`；`zoom` 按**设备像素对齐**量化再夹到 `fit`。
- 视野下限 `MIN_TILES_W = 24`、`MIN_TILES_H = 16`（game.js:34）；`VIEW_W/VIEW_H` 是逻辑瓦片尺寸，`Game.zoom` 是倍率。
- 只有**物理尺寸**（`canvas.width/height`）变化才重建缓冲；重建后必须重置 `ctx.imageSmoothingEnabled = false`
  （改 `canvas.width` 会清空并重置 context 状态）。
- 每帧都 `ctx.setTransform(zoom * dpr, 0, 0, zoom * dpr, 0, 0)`，别把变换留在栈上。
- 布局变量通过 CSS 自定义属性同步（`--zoom`、`--assist-top`、`--dock-h`），`updatePlayLayout()` 负责 DOM 侧。

## 地面分块烘焙

`groundChunks`/`groundChunkOrder`（game.js:18434）按场景缓存预渲染的地面块（`groundChunk`:18668、`drawGround`:18690）：

- `GROUND_CHUNK = 48` 格一块、`GROUND_CHUNK_CAP = 40` 块（LRU：`groundChunk()` 命中先 `splice` 再 `push`，超限 `delete store[order.shift()]`）。
- `drawGround(g, sceneId, R)` 只遍历**视野矩形 R** 覆盖的块，`g.drawImage(ch, …)` 一次一块 —— 大城市整张画布画不开，别再改成逐格重画。
- 地面块是静态的；**地形/buildings 变了要清缓存**：现成做法见室内门接线处（game.js:5401-5402）
  `delete map._roomCanvas; delete groundChunks[sceneId]; delete groundChunkOrder[sceneId];`。

## 其它上限

| 位置 | 值 | 说明 |
| --- | --- | --- |
| game.js:19414 | `PARTICLE_CAP = 120` | `addParticle`(19415) 超出先 `shift()`，别无限堆 |
| CFG | `saveDebounceMs: 750` | `markDirty` 去抖；`saveNow` 立即写 |
| CFG | `moveSpeed: 4` 格/秒、`tickMinutes: 10`、`tickSeconds: 7.5` | 时间与移动口径，测试里按它算等待 |
| `dt` | `Math.min(0.1, …)` | 10 fps 下限；低于它全部逻辑变慢而不是跳步 |

## 常见坑

- 每帧 `new` 对象/数组、每帧跑 `getComputedStyle`、每帧 `filter`/`sort` 大数组 → 卡在 GC 上。
- 在 draw 里改 `state`（既慢又让存档不可复现）。
- 把 `canvas.width/height` 当"当前显示尺寸"读（它是物理像素，且写入会清屏）；显示尺寸看 `VIEW_W/VIEW_H` 与 CSS。
- 混用 `Game.zoom` 与 `--zoom`：前者给绘制，后者给 DOM。
- 忘掉 `Math.round(ox/oy)`，或在小地图上用 `Math.floor` 居中 → 半边接缝。
- 给移动端加视口相关逻辑却只测桌面 1280×860；同时也用 390×844 触屏跑一遍。

## 怎么验证

- 现有套件：`tests/run-responsive-layout.mjs`、`tests/run-exploration-mobile.mjs`、
  `tests/run-r5-mobile-touch.mjs`（含"整程无横向溢出"）、`tests/run-main.mjs`（长时间游玩稳定性）。
- 手测：Playwright 里 `page.evaluate(() => { const t0 = performance.now(); /* 触发一帧绘制 */ return performance.now() - t0; })`；
  或在 `drawScene` 前后打点，记录 `dt` 的 P95；卡顿优先看"是否有每帧新对象"和"是否每帧重建缓冲"。
- 改完必跑：`node tests/run-ci.mjs --quick`，再至少跑 `run-main` 与 `run-r5-mobile-touch`，源码轮与单文件轮都要（内联后 CSS/DPR 行为也要一致）。
