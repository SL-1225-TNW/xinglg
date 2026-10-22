# 存档归一化 / 迁移锚点（game.js，提交 142127e 时）

行号会随提交漂移，**先 grep 再引用**：

```powershell
Select-String -Path game.js -Pattern '^function (normalize|migrate|sanitize|ensure)\w*'
```

## 根

| 行 | 符号 | 作用 |
| --- | --- | --- |
| 62 | `var SCHEMA_VERSION = 2;` | 版本号。改它 = 所有旧档判损坏，除结构级重写外不要动 |
| 1176 | `var state` | 运行时状态对象 |
| 1542 | `normalizeSave(raw)` | 读档主入口：版本不符 → `null`（判损坏），否则逐字段裁剪，最后交给各 `normalizeXxx` |
| 1873 | `migrateV1(old)` | 最老格式迁移 |
| 19818 | `migrateUnifiedSave(raw, s)` | 统一档迁移（结构级） |
| 1362 / 1456 | `newGameState()` 两处返回体 | 默认形状；新字段在这里写 `xxx: state.xxx \|\| newXxxState()` |
| 1934 | `var LoadResult` | 读档结果类型（ok / corrupt / migrated 之类） |

## 归一化函数清单

`normalizeCreditReview` 180、`normalizeCredit` 295、`normalizeSettlementAid` 1222、`normalizeSeasonStock` 1315、
`normalizeSettleHistory` 1703、`normalizeExploration` 2128、`normalizeTutorial` 8387、`normalizeEngSafety` 11010、
`normalizeEngDuty` 11126、`normalizePostTerms` 11279、`normalizeEngProject` 11833、`normalizeChar` 12498、
`normalizeMillLife` 17734、`normalizeMeadowLife` 18108、`normalizeFarmCare` 18220、`normalizeFarmPlan` 18567、
`normalizeWetlandLife` 18716、`normalizeProfessionalLife` 18735、`normalizeMilitaryLife` 18796、
`normalizeUniversity` 20930、`normalizeSouthGate` 21045、`normalizeIndustry` 21159、`normalizePalace` 21271、
`normalizePersonal` 21383、`normalizeConstruction` 22369。

## 裁剪与补齐

| 行 | 符号 | 说明 |
| --- | --- | --- |
| 1753 | `sanitizeInv(v)` | 背包：只留已知 id，数量夹取 |
| 1764 | `sanitizePlots(v)` | 田地：格数、生长阶段、水分逐格夹取 |
| 1794 | `sanitizeNodes(v)` | 资源节点（树/石/矿/浆果） |
| 1807 | `sanitizeStructures(v)` | 建筑/设备（果酱罐等） |
| 7883 | `ensureNpcRuntime()` | NPC 运行时补全（不是存档字段，但读档后要调） |
| 15623 | `ensurePondFish()` | 鱼塘补鱼 |
| 1053 | `migrateFishpondForOldSaves(s)` | 鱼塘旧档 |
| 14410 | `migrateTravelForOldSaves(s, legacy)` | 旅行/发现点旧档 |

## 兼容写法实例（2026-10 复核修的三处）

```js
/* 合同：老档没有 seizedOnce，但可能已扣押或有复核记录 —— 两种形状都视为"已扣押过" */
c.seizedOnce = raw.seizedOnce === true || c.seized.length > 0 || !!c.review;

/* 扣押证据：新数据带 debtAt 快照；老数据按当前欠款回填，仅用于展示 */
debtAt: isInt(s.debtAt) ? s.debtAt : creditDebt(c)

/* 委任来源：老档没有 source，按可见身份回推，不回写 */
if (!c.source) c.source = c.role === '驻地正式委任' ? 'career' : 'draft';

/* 军事：迁移时未点名未战斗的在途部队回营；绝不补写 musterDay/mustered */
campaign: { musterDay: isInt(r.musterDay) ? r.musterDay : 0, mustered: r.mustered === true || false }
```

对应测试：`tests/run-r5-review.mjs`（退还后再读档不重复扣押）、`tests/run-r5-military.mjs`
（旧档点名死锁、无战斗记录时医帐不误判）、`tests/run-r4-legacy-save.mjs`、`tests/run-save-invariants.mjs`。
