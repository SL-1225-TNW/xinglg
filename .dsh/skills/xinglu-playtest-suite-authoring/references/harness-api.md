# tests/harness.mjs 接口清单（319 行，提交 142127e 时）

所有套件都用真实键盘/鼠标驱动；`page.evaluate` 只用于**读**状态和放合法夹具。

## 启动与存档

| 接口 | 说明 |
| --- | --- |
| `GAME_URL` | 默认 `index.html` 的 file:// 地址；`launch({url})` 会改写它，所以 `--single-file` 要在 `launch` 前算好 |
| `launch({ viewport?, touch?, url? })` | 返回 `{ browser, ctx, page, errors }`。viewport 默认 1280×860；`touch:true` 同时开 `hasTouch` 与 `isMobile`。`errors` 收集 console error 与 pageerror |
| `boot(page, { fresh = true, seed = null })` | `goto` → 等 `__MOSS__` →（seed 时 `localStorage['moss-farm-v1'] = seed`）→ reload → 点「开始新的游戏」→ 等 `#boot` 隐藏。`seed` 与 `fresh` 互斥用法：给 seed 时它点第一个按钮（继续游戏） |
| `isolatedPage(browser, setup, viewport?)` | 独立 context，避免旧页面卸载时的自动保存覆盖预置存档；`setup` 在 `__MOSS__` 存在后立即执行，然后 reload。做旧档/损坏档用例时用它 |
| `snap(page)` | 一份常用状态快照：day/time/coins/energy/scene/px/py/inv/plots/nodes/structures/shipping/questProgress/friend/bridge/recipes/weather/slots |
| `hud(page)` | `#hudDate .hud-value`、`#hudCoins .hud-value` 等 DOM 文本；验证"玩家看到什么"用它，验证"状态是什么"用 snap |

## 移动与交互（真实输入）

| 接口 | 说明 |
| --- | --- |
| `walkTo(page, tx, ty, timeout = 15000)` | 每步重新寻路、按住方向键走到格心再松键。**场景切换即返回 true**，调用方自己等淡入。路上遇到弹窗会先 `closeWin`。`WALK_DEBUG=1` 打印卡在哪格 |
| `walkAdjacent(page, tx, ty)` | 依次试 `[tx,ty-1] [tx,ty+1] [tx-1,ty] [tx+1,ty] [tx,ty]` 里第一个非实心格 |
| `interactWith(page, tx, ty)` | 走到旁边 → `faceTowards` → 按 `e` → 返回"是否开了窗口"。**注意**：进门类交互不弹窗而是换场景，返回值是 false，要另判 `sceneId` |
| `clickTile / hoverTile / useSpaceOn / pickTool(slot) / press(key, wait)` | 鼠标格点击、悬停、空格使用、数字键换工具、任意按键 |
| `faceTowards(page, tx, ty)` | 只在与目标相邻时按方向键转身 |
| `closeWin(page)` | Esc 关窗；连按两次兜底。**在窗口没开时按 Esc 会开出暂停菜单**，所以先判断 `winOpen` |
| `sleepAtFarmhouse(page) / sleepViaMenu(page)` | 两条真实的过夜路径（走到床边 vs 暂停菜单），返回是否成功 |
| `dismissSettlement(page)` | 日结算多页演出：点「开始新的一天」最多 8 次直到关窗。**只用于"把结算翻过去"**，不要用它做分页断言（分页要用 `winTitle` 的 `n/N`） |
| `fastForward(page)` | 把 `timeMinutes` 直接推到 22:00 前 0.5 分钟，等窗口出现；**这是改存档**，属于越界夹具 |
| `gotoScene(page, target, budgetMs=45000)` | 只覆盖 `farm↔town↔riverside` 三段 `SCENE_ROUTE`，其余地点要自己写（见下） |

## 读窗口

| 接口 | 说明 |
| --- | --- |
| `winOpen(page)` | `#windowLayer` 未隐藏 |
| `winTitle(page)` | `.win-title` 文本，分页窗口形如 `第 3 / 7 页 · 土壤肥力`；**页数从这里的 `n/N` 取** |
| `winText(page)` | 整个 `.win-body` 的 innerText。**坑**：分页窗口顶部有分页网格，每页标题都印在里面，所以"含某页文案"的断言恒真。要判当前页就读 `.win-body .section-title` / `.panel-box` |
| `clickWin(page, text, nth = 0)` | 点 `.win button` 里含该文案的第 nth 个 |
| `clickItemByName(page, name, nth = 0)` | 只在 `.win .grid.two .item` 里找（工具组排在物品组前面，不限定会点错同名工具） |

## M 地图旅行（写在需要跨远距离到达的套件里）

`harness.mjs` 没有全境旅行封装；`tests/run-r5-natural-entry.mjs` 的写法可直接照抄：

```js
await closeWin(p);
await p.keyboard.press('m');
await p.waitForTimeout(280);
let node = p.getByRole('button', { name: new RegExp('^' + name) });
if (!(await node.count())) {
  const zoom = p.getByRole('button', { name: '全境总图' });   // 城里按 M 先出街区图
  if (await zoom.count()) { await zoom.first().click(); await p.waitForTimeout(300); }
  node = p.getByRole('button', { name: new RegExp('^' + name) });
}
assert.ok(await node.count(), 'M 地图上没有「' + name + '」；当前窗口「' + await winTitle(p) + '」');
await node.first().click();
await p.waitForTimeout(220);
const blocked = (await p.locator('.travel-blocked').allTextContents().catch(() => [])).join(' ').trim();
const go = p.getByRole('button', { name: '传送过去', exact: true });
assert.ok(await go.count(), '「' + name + '」不能传送：' + (blocked || '无传送按钮'));
await go.first().click();
await p.waitForFunction(() => (!__MOSS__.sceneSwitch || !__MOSS__.sceneSwitch.busy), null, { timeout: 9000 }).catch(() => {});
```

要点：`travel-blocked` 就是"为什么进不去"的玩家可见原因，把它带进断言消息里，比只报"按钮找不到"有用得多。

## 两个惯用写法

**带诊断的按钮点击**（文案一改就能立刻定位）：

```js
async function clickWin(re) {
  const list = await btns();                       // 当前窗内所有按钮文案
  const i = list.findIndex(b => re.test(b));
  assert.ok(i >= 0, `找不到按钮 ${re}；现有：${list.join(' | ')}`);
  await p.locator('.win button').nth(i).click();
}
```

**合法夹具**：只写更早阶段已经验收过的事实（桥修好、工程验收、信任度、背包物品），
在 `page.evaluate` 里直接赋 `__MOSS__.state` 后调 `M.saveNow()`，并在文件头注明"这些不是本切片结论"。

## `__MOSS__` 调试面（game.js `window.__MOSS__ = {…}`，63 个键）

常用：`state`、`Game`、`ui`、`toasts`、`CFG`、`MAPS`、`ITEMS`、`SCENE_ORDER`、`registeredRegions`、
`findPath(scene, sx, sy, x, y)`、`tileToScreen(x, y)`、`isSolid(scene, x, y)`、`countSlots()`、
`saveNow()`、`questExitTile`、`doorTiles`、`nearestWalkable`，以及各子系统的 `xxxLifeState()` 与
`devMarket`、`openXxxSite` 这类刷新/调试入口（后者属于越界夹具，别当自然入口）。
