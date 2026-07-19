# Contributing to Daily Memories

感谢你参与 Daily Memories。本指南约定仓库的贡献流程、提交规范、开发架构、接口协议、角色接入方式、测试要求和 Supabase 交付边界。

开始开发前请先阅读本文和 [`README.md`](README.md)；涉及后端、身份或私有数据的改动，还应阅读 [`supabase/README.md`](supabase/README.md) 与 [`supabase/DEPLOYMENT.md`](supabase/DEPLOYMENT.md)。参与协作即表示同意保持尊重、聚焦技术事实，不公开他人的身份、凭据或私密内容。若后续添加 `CODE_OF_CONDUCT.md`，以该文件为正式行为准则。

## 1. 什么才算完成

一个功能只有在以下工作均完成后，才能在代办、提交说明或 PR 中标记为“完成”：

1. 需求边界和目标角色已经明确。
2. 实现沿用现有模块与稳定接口，没有绕过 Repository、StoragePort 或统一角色判断。
3. 单元测试、数据库测试和必要的浏览器回归已经通过。
4. 没有提交密码、访问令牌、service-role key、签名 URL 或真实测试数据。
5. 临时账号、上传对象、礼物进度和测试 session 已清理。
6. 文档、代办状态和部署记录与实际结果一致。

仅完成本地代码不等于 Supabase 功能已经上线。Supabase 相关功能必须按“Supabase 功能的双阶段交付”章节管理。

## 2. 贡献流程

### 2.1 开始开发前

1. 搜索已有 Issue、PR、报告和代办，避免重复实现或覆盖已经确定的产品决策。
2. 检查 `git status`，确认未提交修改的归属；仓库中的现有修改默认属于原开发者。
3. 小型、明确且不改变产品口径的修复可直接实现；大型功能、数据模型变更、展示内容变化或破坏性迁移应先建立 Issue 或取得维护者确认。
4. 明确功能属于双方共享、Mel 专属、Ray 专属、账号个人状态还是角色席位状态。
5. 涉及 Supabase 时，先确认本次任务只要求代码、开发云项目验证，还是已经授权生产迁移。

### 2.2 提交 Issue

Bug Issue 应包含：

- 简明标题和受影响模块。
- 可复现步骤、实际结果与预期结果。
- 浏览器、视口、commit 和目标环境。
- 已脱敏的错误信息、截图或录像。
- 是否涉及 Mel/Ray 角色、Supabase、Storage 或数据清理。

功能建议应说明使用场景、目标角色、状态生命周期、验收标准，以及是否改变现有展示内容。安全漏洞、真实凭据和隐私数据不得发布到公开 Issue；请直接联系仓库维护者，并只提供复现所需的最少信息。

### 2.3 提交 Pull Request

1. 从最新目标分支创建语义清晰的工作分支。
2. 保持 PR 单一目的，并按功能块组织 commits。
3. 在 PR 描述中关联 Issue，说明角色边界、实现、测试、截图或 Chrome 验收结果。
4. 有 Supabase 改动时列出 migration 文件，并显式标记云端状态和 Steven-Qu-04 的交接事项。
5. 使用 Draft PR 表示尚未达到验收条件；测试、清理和文档齐全后再请求审查。
6. 根据审查意见追加小提交或按维护者要求整理历史，不自行覆盖他人提交。

## 3. 当前技术栈与目录职责

项目采用无框架静态前端和原生 ES Modules：

- `index.html`：页面结构、可访问名称和固定展示内容。
- `styles.css`：页面、组件、响应式和角色专属元素的视觉状态。
- `script.js`：站点导航、登录入口、生日信、礼物流程及页面级协调。
- `js/glimmer-controller.js`：微光收集、Gallery、STATS 和对应 DOM 状态。
- `js/glimmer-model.js`、`js/glimmer-stats.js`：可独立测试的业务纯函数。
- `js/feature-access.js`：角色和功能访问规则的唯一前端入口。
- `js/glimmer-repository.js`：认证、业务 RPC 和上传状态机的统一数据层。
- `js/storage/storage-port.js`：对象存储的稳定端口协议。
- `js/storage/*-adapter.js`：具体存储服务适配器；UI 不得直接依赖它们。
- `js/app-services.js`：Supabase client、Repository 和 Storage adapter 的组装入口。
- `supabase/migrations/`：按顺序、不可回写的数据库迁移。
- `supabase/tests/`：pgTAP 和远端安全事务测试。
- `tests/`：Node 内置测试运行器执行的前端、Repository 和 adapter 测试。

依赖与常用命令由 `package.json` 管理：

```sh
npm install
npm test
npm run build:vendor
npm run supabase:start
npm run db:reset
npm run db:test
```

Supabase 本地命令依赖 Docker。若 Docker 不可用，应明确记录阻塞，并用安全的远端 dry-run、lint 或整体回滚事务补充验证；不得把替代验证描述成“本地空库重置已通过”。

## 4. 稳定开发协议

### 4.1 UI 与业务层

- 用户输入必须通过 `textContent`、属性赋值等安全 DOM API 渲染，禁止直接拼入 `innerHTML`。
- 页面跳转统一经过现有页面协调函数；新增页面应使用 `.page` 和 `.is-active` 约定，不得用更高优先级的默认 `display` 让未激活页面进入布局流。
- 角色专属 UI 在身份未加载、加载失败或 session 失效时必须默认隐藏。
- 退出、账号切换和 session 失效必须清理身份、角色专属页面、弹层、请求状态及内存缓存，并回到安全的默认页面。
- 不改变展示文案的任务不得顺手修改文案、图片或视觉内容。确有必要时，应在需求或代办中单独说明并获得确认。

### 4.2 Repository 协议

- 页面与 Controller 只调用 Repository，不直接调用 Supabase RPC、表或 Storage SDK。
- Repository 将供应商错误转换为稳定业务错误码，不能把 SDK 原始结构泄漏给 UI。
- 异步流程必须处理过期请求和账号切换，旧 session 的响应不能覆盖新身份状态。
- 新 RPC 或 DTO 应保持明确、可测试且与供应商无关；变更既有签名时必须同步 migration、Repository、调用方和测试。

### 4.3 StoragePort 协议

上传继续采用 `begin -> adapter.upload -> finalize` 状态机。业务层依赖统一 asset DTO：

```text
provider + bucket + object_key + content_type + size_bytes
```

数据库不得保存公开 URL或短期签名 URL。新增 S3、R2 或其他服务时，应新增 adapter 并复用 StoragePort 合约，不得让页面出现供应商分支。

### 4.4 日期、权限和服务端真值

- 业务日以空间时区 `Asia/Shanghai` 和服务端返回的 `local_today` 为准。
- 删除窗口、成员关系、角色、奖励余额、每日唯一性和上传完成状态以数据库为准。
- 前端隐藏只是产品/UI 门控；真正需要防越权的能力必须由 RLS、RPC 或 Storage policy 再次验证。

### 4.5 Supabase 数据库协议

- 所有 `public` 业务表开启 RLS，并显式审计 `anon`、`authenticated` 和 `public` 权限。
- `security definer` 函数必须固定安全的 `search_path`，优先使用 `set search_path = ''` 和完整限定表名。
- RPC 先从 `auth.uid()` 推导成员和角色，再验证目标 `space_id`；禁止信任客户端传入的 owner、role、奖励数或 object key。
- 业务枚举、允许键、MIME、大小和状态转换同时使用数据库约束或服务端白名单保护。
- 默认撤销 RPC 对 `public`、`anon` 的执行权，仅向确有需要的角色授权。
- 需要原子性、幂等或并发保护的流程必须放在数据库事务函数中，不能拆成多个可被客户端穿插调用的表写入。
- 稳定错误码使用大写下划线形式，例如 `FEATURE_FORBIDDEN`、`INVALID_GIFT_ID`；Repository 负责映射，UI 不解析数据库自然语言错误。

## 5. 新板块如何接入现有框架

新增页面或功能模块前，先判断它属于以下哪一种：

1. **双方共享功能**：Ray 与 Mel 都可使用，但写操作仍按 owner、space 和服务端规则校验。
2. **角色专属功能**：只对 `ray` 或 `mel` 开放，前后端都必须验证 `space_members.role`。
3. **账号个人状态**：跟随具体 Auth 用户，使用 `user_id` 存储。
4. **角色席位状态**：账号重建后仍应继承，使用 `(space_id, role)` 存储。

接入步骤：

1. 从 `get_glimmer_dashboard(space_id)` 和 `getGlimmerIdentity()` 获取身份上下文。
2. 在 `js/feature-access.js` 增加纯函数规则，并覆盖 `mel`、`ray`、未登录和加载失败用例。
3. 页面初始化时默认隐藏专属入口，身份确认后再显示。
4. 数据读取或写入经过独立 service/Repository；不允许在 UI 中比较邮箱、显示名或写死 Auth UUID。
5. 后端从 `auth.uid()` 查询目标空间成员关系，再验证角色；不能信任前端提交的角色。
6. 直接调用、深链接、刷新、退出和账号切换都必须走同一访问规则。
7. 增加窄屏与桌面端验证，确认隐藏元素不留下空白占位，未激活页面不进入布局流。

以当前 Mel 专属能力为例：

- 礼物、最终 Gift 页、STATS 和生日信统一使用 `canAccessMelFeature()` 或其派生规则。
- 礼物进度属于角色席位状态，存储在 `(space_id, role)` 上。
- Gift 页还需要同时满足“Mel 角色”和“5 个礼物已集齐”。
- STATS 当前是产品/UI 门控；Ray 已能读取双方共享的微光数据，因此不能将它描述为严格的数据保密边界。

若未来增加 Ray 专属功能，建议增加对称的角色规则，而不是反向使用 `!canAccessMelFeature()`；后者会错误地把未登录或身份加载失败也视为 Ray。

## 6. 提交与分支规范

采用 Conventional Commits 风格，并按功能块拆分提交：

```text
feat(stats): add monthly comparison
fix(web): reset role-bound modal on sign-out
fix(db): enforce member role in gift RPC
test(db): cover account replacement inheritance
docs: record cloud migration handoff
refactor(storage): isolate provider adapter
chore: rebuild vendored Supabase client
```

分支名称建议使用 `feat/<short-name>`、`fix/<short-name>`、`test/<short-name>` 或 `docs/<short-name>`。共享分支上避免改写他人历史；禁止对受保护分支 force-push。若直接在协作分支开发，应先确认工作区中的既有修改归属，再决定暂存范围。

必要规则：

- 一个提交只解决一个可说明、可回滚的问题。
- 数据库迁移和直接验证该迁移的测试可以放在同一提交。
- 纯前端、数据库、测试和文档尽量分批提交，避免把无关改动混在一起。
- 提交前运行 `git diff --check`、相关测试并确认 `git status` 中没有意外文件。
- 不覆盖、重置或顺手格式化其他开发者的未提交改动。
- 已部署 migration 不得修改；修复必须新增时间戳更晚的 migration。
- 不提交 `supabase.txt`、`.env`、浏览器资料、测试密码、access token、数据库密码或 service-role key。
- `js/vendor/supabase.js` 只能通过 `npm run build:vendor` 生成；若产物改变，应注明依赖版本和生成命令。

提交说明或 PR 至少包含：

- 需求和角色边界。
- 主要实现及稳定接口是否变化。
- 执行过的测试与结果。
- 是否包含 Supabase migration。
- 云端状态：未迁移、待实测或已由负责人确认。
- 遗留风险、数据清理结果和必要的回滚方法。

## 7. 测试与验收

### 7.1 自动化测试

最低要求：

```sh
npm test
git diff --check
```

涉及数据库时，还应运行：

```sh
npm run db:reset
npm run db:test
supabase db lint --linked --schema public --level warning --fail-on warning
supabase db push --linked --dry-run
```

对开发云项目执行写测试时，应优先使用 `begin ... rollback` 的事务脚本。无法回滚的 Storage、Auth 或业务数据必须在测试后按精确 ID 清理，并记录清理结果。

### 7.2 浏览器角色矩阵

角色相关功能至少覆盖：

| 场景 | Mel | Ray | 未登录/失效 session |
| --- | --- | --- | --- |
| 专属入口 | 按需求显示 | 隐藏 | 隐藏 |
| 直接触发 | 允许或按附加条件判断 | 拒绝 | 拒绝 |
| Repository/RPC | 按角色允许 | 后端拒绝 | 认证失败 |
| 刷新 | 恢复正确身份和状态 | 恢复正确身份和状态 | 回登录页 |
| 退出/切换 | 清理角色状态 | 清理角色状态 | 保持安全默认态 |

双账号测试应使用不同 origin 隔离 session，例如 `localhost:<port>` 与 `127.0.0.1:<port>`；不要读取或修改浏览器 cookie、localStorage 或密码存储来伪造结果。

## 8. Supabase 功能的双阶段交付

任何包含以下内容的改动都属于“Supabase 后端功能”：

- `supabase/migrations/`、RLS、数据库约束、触发器、Auth Hook。
- RPC 签名、权限、Storage bucket 或 `storage.objects` policy。
- 云端 Auth、SMTP、redirect URL、项目链接和 schema cache。
- 需要真实云数据、账号或 Storage 才能证明的行为。

### 阶段 A：开发者代码完成

开发者负责：

- 新增不可变 migration 和对应测试。
- 从空库验证迁移；若环境受阻，明确记录替代验证和未覆盖项。
- 完成前端 Repository/adapter 接入与 mock 合约测试。
- 提供 migration 列表、dry-run 预期、测试命令、风险和回滚/清理说明。
- 在代办或 PR 中将状态写为：`代码完成，待 Steven-Qu-04 云端迁移和实测`。

此阶段不得写“已上线”“云端完成”或勾选最终 Supabase 验收。

### 阶段 B：Steven-Qu-04 云端迁移与实测

所有 Supabase 后端功能应在写成 Supabase 服务之后，等待 **Steven-Qu-04** 完成云端迁移和实测。由 Steven-Qu-04 负责或明确确认：

1. 目标项目和环境正确，备份及回滚条件满足。
2. `supabase db push --linked --dry-run` 只包含预期 migration。
3. 应用 migration，并配置 Auth Hook、redirect URL、SMTP、bucket 等 Dashboard 项。
4. 执行数据库 lint、权限审计、schema cache/RPC 签名检查。
5. 使用真实 Mel/Ray 账号完成云端浏览器 smoke。
6. 清理临时数据，更新 `supabase/DEPLOYMENT.md`，记录日期、版本和结果。

只有 Steven-Qu-04 确认上述步骤后，状态才可改为：`云端迁移和实测完成`。

除非任务明确授权并指定目标开发项目，其他贡献者不得自行向远端或生产 Supabase 推送 migration。任何情况下都不得把 service-role key 放入浏览器或仓库。

## 9. Chrome control 实测规范

开发过程中建议使用 Codex 的 Chrome control 功能在真实 Chrome 中测试 localhost，尤其适用于：

- Mel/Ray 双账号、刷新、退出、账号切换和 session 传播。
- 隐藏入口、深链接、弹层、页面激活状态和权限失败路径。
- 桌面端与窄屏布局、滚动位置、空白占位和控制台错误。
- 完整业务链路，而不只是检查 DOM 是否存在。

使用时应：

1. 启动本地 HTTP server，不使用 `file://` 验证模块化前端。
2. 确认 Chrome control 插件及其 Chrome 扩展已启用并连接。
3. 确认环境提供浏览器控制执行接口（通常包括 Chrome browser binding 和 `mcp__node_repl__js`）。
4. 首次连接后读取 Chrome control 提供的完整接口文档，并为测试 session 命名。
5. 每次点击、填写或按键前先读取当前 DOM 状态并确认定位唯一；交互后验证最小必要状态。
6. 响应式测试使用 viewport capability，并在测试结束时恢复默认视口。
7. 结束时退出测试账号、删除临时业务数据、关闭测试标签和本地服务器。

如果缺少 Chrome control 或相关接口，不要静默改用无法覆盖真实 Chrome 状态的方案，也不要声称浏览器实测已完成。应在交付说明中提示维护者：

```text
当前环境缺少 Chrome control 接口。请在 Codex 中安装/启用 Chrome 插件，
确认 Chrome 扩展已连接，并开放浏览器控制执行接口；重新建立会话后再运行 localhost 实测。
```

如果插件存在但连接失败，先检查扩展是否启用、Chrome 是否正在运行、当前会话是否获得标签页控制权限；重新连接后仍失败，再记录为外部阻塞。只有用户明确同意时，才能改用其他浏览器表面作为补充，而且必须注明它不能替代所要求的 Chrome 验收。

## 10. 安全与数据纪律

- `supabase.txt` 仅是本地秘密来源，不得提交、复制到报告或在命令输出中打印。
- 浏览器只能使用 publishable key；service-role key 和数据库密码不得进入前端。
- 不在截图、日志、提交信息或 Markdown 中记录真实密码、access token、refresh token 或签名 URL。
- 测试 SQL 必须限定目标环境、目标 space 和目标记录；删除前先查询并确认精确对象。
- 远端写测试优先使用开发项目，禁止把测试数据混入生产。
- 身份授权不得依赖邮箱、显示名、前端按钮隐藏或固定 Auth UUID。
- 任何涉及账户删除、权限变更、生产迁移或不可恢复数据清理的动作，都必须获得明确授权。

## 11. 文档与交接

实现完成后按影响范围更新：

- `README.md`：面向使用者的当前行为和启动方式。
- `supabase/README.md`：本地后端前置条件和标准命令。
- `supabase/DEPLOYMENT.md`：仅记录实际完成的云端部署和验证。
- 对应 todo/report：记录决策、已完成项、环境阻塞和遗留风险。

若旧文档与代码冲突，以当前 migration、测试和实现为事实来源，并在同一改动中修正文档。交接给 Steven-Qu-04 时，应提供精确 commit、migration 文件名、dry-run 结果、测试结果、目标 Supabase 环境以及必须执行的云端 smoke 清单。

## 12. 提交前检查表

- [ ] 需求、共享/专属角色和状态生命周期已明确。
- [ ] 新板块复用了页面、Repository、StoragePort 和角色规则。
- [ ] 前端门控与后端授权均已实现。
- [ ] 未登录、Ray、Mel、刷新、退出和账号切换路径已覆盖。
- [ ] `npm test` 与 `git diff --check` 通过。
- [ ] 数据库改动有新 migration、测试和 dry-run 说明。
- [ ] Supabase 状态没有把“代码完成”误写成“云端完成”。
- [ ] Chrome 实测已完成；若接口缺失，已明确提示安装/连接方法和阻塞项。
- [ ] 临时账号、对象、进度、session、标签页和本地服务已清理。
- [ ] 没有提交秘密、真实凭据或无关改动。
- [ ] 文档、代办、部署记录和提交说明一致。
