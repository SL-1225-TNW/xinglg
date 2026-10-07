# 账号与云存档部署及验收

按方案 A → B → C → D 分阶段实现。游戏仍可离线双击游玩；网页未配置后端时明确显示云功能尚未开放。

## 已实现

- A：`save-repository.js` 抽出存档接口；游客、账号 UUID / 固定主槽独立缓存；旧 v2/v1 原始键保留并备份迁移；坏档保留；未来版本禁止降级写回；换号清空游戏内存和 HUD。
- B：本地打包 Supabase JS SDK 2.99.3（MIT，无运行时 CDN），邮箱验证码登录/自动注册、恢复会话、当前邮箱、退出/换号。首次启动先恢复身份再开放开始按钮；网络恢复超时时可以用已缓存身份访问自己的本地档。缓存身份不作为服务端授权依据。
- B 数据库：两表强制 RLS，匿名无访问权，玩家仅有自己的 SELECT 权限。RPC 由无登录、无 RLS 绕过能力的专用角色执行；显式检查 `auth.uid()`，不能指定其他玩家 UUID；禁止直接 INSERT/UPDATE/DELETE，防止绕过版本比较。
- C：本地记录以单个 localStorage 键原子保存 payload、UUID、槽、基准 revision、变更序号、指纹及待同步标记。先本地、后云端；超时和断网指数重试，online 事件重试；同一上传仅有一个在途请求。晚到的响应仅确认相应序号；换号后的旧响应忽略。
- C：服务端 advisory transaction lock 保护首次建档和并发更新，CAS 检查版本；mutation UUID 保证请求重试幂等。服务端时间与 revision 决定版本，savedAt 仅展示。成功更新前备份旧版本，最近 10 份；用户可从账号界面导出历史版本，使用现有导入功能恢复。
- C：游客首次绑定、已有账号进度选择、本机/云端冲突对比、游客单独导出；选择前保存双方本地备份。选择期间云端再变化会重新展示冲突。未来/损坏云档停止云写入。无机械合并。
- C：导入和重开先备份当前档；同来源另一个标签页改档时暂停本页写入，备份内存进度并提供导出/刷新，避免两个页面覆盖。
- D：Pages 复制所有新脚本；公开配置通过仓库变量生成，错误/管理员密钥会让构建失败；CI 自动检查数据库、协调器和浏览器合同回归。

## 生产接入顺序（需项目所有者提供 Supabase 项目）

1. 创建 Supabase 项目，记录 Project URL 和 **publishable key**。兼容旧 anon JWT。绝不把 secret / service_role / 数据库密码放在仓库、公开变量、浏览器或聊天记录中。
2. SQL Editor 执行 `supabase/migrations/202610070001_accounts.sql`。这是首次部署迁移；不要重复执行建表脚本。部署前核对专用角色 `moss_save_writer`、表 RLS 和 RPC 权限。
3. Authentication 开启 Email；生产配置自有 SMTP。修改 **Magic Link** 邮件模板，正文包含 `{{ .Token }}`，让玩家得到验证码，而不是只有链接。当前版本不消费 magic-link 回调；登录在原网页输入邮箱验证码完成。
4. Site URL 设置为 `https://sl-1225-tnw.github.io/xinglg/`；允许重定向 URL 仅包含实际生产/受控测试地址，不开放通配来源。配置验证码过期时间、邮件发送限流，确认邮件与网页文案一致。如启用验证码挑战，需要先补充相应挑战 UI；目前不支持 CAPTCHA 集成。
5. GitHub Settings → Secrets and variables → Actions → **Variables** 设置：
   - `MOSS_SUPABASE_URL`：Project URL。
   - `MOSS_SUPABASE_PUBLISHABLE_KEY`：publishable / anon 公开密钥。
   不需要数据库管理员密钥。两者均空时发布游客模式；缺一个或错误类型则部署失败。
6. 合并分支后 Pages 工作流生成生产公开配置并发布。单文件版始终内置空配置，作为无需联网的游客版，不携带生产会话。
7. 执行下面真实登录态验收，然后完成手机/平板/电脑与大陆网络实测。未完成这些步骤，不能宣称云存档已上线可用。

## 自动验证

```bash
npm ci --prefix tests
node tests/run-save-repository.cjs
node tests/run-save-coordinator.cjs
node tests/run-database.mjs
npx --prefix tests playwright install chromium
node tests/build-single-file.mjs
node tests/run-accounts.mjs
node tests/run-save-browser.mjs
node tests/single-file-smoke.mjs
node tests/run-fishing-economy.mjs
node tests/run-exploration.mjs
node tests/run-review-fixes.mjs
node tests/run-edge.mjs
```

`run-database` 在 PGlite 内运行真实 PostgreSQL 引擎和迁移，用 Auth 角色/UUID 上下文检查 RLS；它模拟 `auth.uid()`，没有验证实际 Supabase JWT 发放。
`run-accounts` 用真实 Chromium、原版 SDK 和模拟 Auth/REST 传输验证用户流程，包含 390×844 手机视口；它没有验证真实邮件。
`run-save-coordinator` 使用显式状态夹具覆盖迟到响应、离线、并发选择及未来版本。
可通过 `MOSS_CHROMIUM` 指定已有 Chromium 的绝对路径；默认用 Playwright 浏览器。

### 真实 Supabase Auth/RLS 验收

使用两个专用测试邮箱在网页完成 OTP 登录，取得短期 access token，**仅在本地环境变量中使用，不提交/记录 token**：
`MOSS_SUPABASE_URL`、`MOSS_SUPABASE_PUBLISHABLE_KEY`、`MOSS_TEST_TOKEN_A`、`MOSS_TEST_TOKEN_B`。

运行 `node tests/run-live-cloud.mjs`。它用真实 JWT 检查匿名拒绝、A/B 读取隔离、直接写入拒绝、并行 CAS、幂等及备份隔离。测试使用随机测试槽，绝不修改主槽。输出测试槽 UUID 后，由项目所有者在 SQL Editor 按槽清理测试记录。

## 人工小范围上线验收

- 用手机登录并游玩、保存，电脑/平板同账号登录并继续，核对天数、金币、农田、探索、委托、好感。
- 同设备 A 退出后 B 登录：开始界面、HUD、游戏状态和缓存均属于 B；回到 A 不丢档。
- 两台设备先离线各自修改，恢复网络：明确冲突，先分别导出，再选择；双方原始进度保留。再模拟选择期间第三次云变更，必须重新确认。
- 断网刷新恢复已登录缓存；验证码超时/错误、会话过期、云 API 超时、缓存容量不足均可导出。首次从未登录过的离线设备只能使用游客档。
- 执行历史版本导出→导入→同步，确认恢复后产生新 revision，而非回退服务端版本号；数据库每日备份/恢复流程由项目所有者按 Supabase 套餐配置并演练。
- 在大陆移动/联通/电信与常用邮箱实测送达、网络可达性和延迟；本地开发测试不能替代这些验收。

## 边界

一个账号默认一个主槽。退出登录只退出本设备，会留下独立本地缓存与离线队列；共享设备请使用独立系统/浏览器用户。浏览器本地缓存并非加密保险箱。存档不是防作弊系统。本地安全备份不自动删除，用户可先导出后再清理浏览器数据。若网络/邮件体验未达标，保持游客模式，不注入未经验证的生产配置。

参考：Supabase [OTP](https://supabase.com/docs/guides/auth/auth-email-passwordless)、[RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)、[数据库函数](https://supabase.com/docs/guides/database/functions)。
