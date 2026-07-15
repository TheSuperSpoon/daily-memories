# 微光收集后端工程计划（Supabase Storage 版本）

> 这是 `backend develop.md` 的独立副本方案。  
> 第一版只使用 Supabase Auth、Postgres 和 Supabase Storage，不依赖 Cloudflare Worker/R2。  
> 目标：一个编码 Agent 在一天内完成双人注册、跨设备同步、私有图片上传/查看及 24 小时内删除的可运行闭环。

本方案必须保持存储后端可替换。Supabase Storage 是第一版适配器，不是业务层依赖；未来接入 Cloudflare R2 时复用 Auth、数据模型、上传状态机、repository 契约、页面和绝大多数测试。

## 1. 第一版范围

- 用户使用邮箱、显示名和密码自行注册。
- 最多两个成员账户；第一个自动获得 `ray`，第二个获得 `mel`，第三个用户由数据库 Hook 拒绝。
- 每人每天最多上传一张图片；两人都上传后当天显示完整。
- 图片保存到私有 Supabase Storage bucket，数据库只保存对象路径和业务元数据。
- 同一空间的两人可以查看彼此图片，只有 owner 能在上传后的滚动 24 小时内删除自己的图片。
- 业务日期按 `Asia/Shanghai` 计算，数据库时间使用 `timestamptz`。
- 第一版实现服务端补签奖励账本；图片压缩、EXIF 清理和旧 `localStorage` 自动迁移留到后续。

“账号”默认指邮箱登录账号，显示名可以自定义。如果必须使用不含 `@` 的用户名登录，需要另做用户名到邮箱的服务端映射，不纳入本副本。

## 2. 架构

```text
Browser
  └─ Auth / business repository
       ├─ Auth：注册、邮箱确认、登录、刷新、退出、找回密码
       ├─ Postgres：读取 glimmers、调用受控 RPC
       └─ StoragePort（稳定接口）
            └─ SupabaseStorageAdapter（第一版）
                 └─ @supabase/supabase-js Storage

Supabase
  ├─ auth.users：账号与密码哈希
  ├─ public tables：双人槽位、成员、图片业务元数据
  ├─ RLS / RPC / Auth Hook：授权及业务约束
  └─ private bucket `glimmers`：图片对象
```

UI 和日历逻辑不得直接调用 `.storage.from(...)`。所有文件操作必须经过 `StoragePort`；Supabase SDK 只能出现在 `SupabaseStorageAdapter` 内。将来新增 `R2StorageAdapter` 后，通过配置或服务端返回的 provider 选择实现。

浏览器可以持有项目 URL 和 publishable key。任何 service-role key 都不得进入前端、仓库或日志。当前方案不需要在浏览器外保存 service-role key。

## 3. 目标目录

```text
daily-memories/
├─ index.html
├─ script.js
├─ backend develop.md
├─ backend develop - supabase storage.md
├─ supabase/
│  ├─ config.toml
│  ├─ migrations/
│  │  └─ <timestamp>_supabase_storage_backend.sql
│  ├─ tests/
│  │  └─ backend_test.sql
│  └─ seed.sql
├─ js/
│  ├─ supabase-client.js
│  ├─ glimmer-repository.js
│  └─ storage/
│     ├─ storage-port.js
│     ├─ supabase-storage-adapter.js
│     └─ storage-adapter-factory.js
├─ .env.example
└─ .gitignore
```

## 4. 数据模型

### 4.1 类型与表

```sql
create type public.member_role as enum ('ray', 'mel');
create type public.upload_status as enum ('pending', 'ready');
create type public.storage_provider as enum ('supabase', 'r2');
create type public.reward_event_type as enum ('streak_earned', 'retro_spent');

create table public.spaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  timezone text not null default 'Asia/Shanghai',
  default_storage_provider public.storage_provider not null default 'supabase',
  created_at timestamptz not null default now()
);

create table public.registration_slots (
  slot smallint primary key check (slot in (1, 2)),
  role public.member_role not null unique,
  state text not null default 'open'
    check (state in ('open', 'claimed', 'locked')),
  user_id uuid unique references auth.users(id) on delete set null,
  claimed_at timestamptz,
  check ((state = 'claimed' and user_id is not null) or state <> 'claimed')
);

insert into public.registration_slots (slot, role)
values (1, 'ray'), (2, 'mel');

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 30),
  created_at timestamptz not null default now()
);

create table public.space_members (
  space_id uuid not null references public.spaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.member_role not null,
  created_at timestamptz not null default now(),
  primary key (space_id, user_id),
  unique (space_id, role)
);

create table public.glimmers (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  role public.member_role not null,
  glimmer_date date not null,
  note text not null default '' check (char_length(note) <= 500),
  status public.upload_status not null default 'pending',
  created_at timestamptz not null default now(),
  ready_at timestamptz,
  deleted_at timestamptz
);

create table public.glimmer_assets (
  id uuid primary key default gen_random_uuid(),
  glimmer_id uuid not null references public.glimmers(id) on delete cascade,
  provider public.storage_provider not null default 'supabase',
  bucket text not null,
  object_key text not null,
  content_type text not null,
  size_bytes bigint not null,
  checksum text,
  is_current boolean not null default true,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (provider, bucket, object_key),
  check (content_type in ('image/jpeg', 'image/png', 'image/webp', 'image/gif')),
  check (size_bytes between 1 and 10485760)
);

create unique index glimmer_assets_one_current
  on public.glimmer_assets (glimmer_id)
  where is_current and deleted_at is null;

create unique index glimmers_one_per_role_per_day
  on public.glimmers (space_id, glimmer_date, role)
  where deleted_at is null and status in ('pending', 'ready');

create index glimmers_timeline
  on public.glimmers (space_id, glimmer_date desc, created_at desc)
  where deleted_at is null and status = 'ready';

create table public.reward_ledger (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces(id) on delete cascade,
  event_type public.reward_event_type not null,
  amount smallint not null check (amount <> 0),
  streak_run_start date,
  streak_milestone smallint,
  target_date date,
  actor_id uuid references auth.users(id) on delete set null,
  idempotency_key text not null unique,
  created_at timestamptz not null default now(),
  check (
    (event_type = 'streak_earned' and amount = 1 and streak_run_start is not null
      and streak_milestone > 0 and streak_milestone % 10 = 0 and target_date is null)
    or
    (event_type = 'retro_spent' and amount = -1 and target_date is not null)
  )
);

create index reward_ledger_space_time
  on public.reward_ledger (space_id, created_at desc);

create unique index reward_one_card_per_run_milestone
  on public.reward_ledger (space_id, streak_run_start, streak_milestone)
  where event_type = 'streak_earned';

create unique index reward_one_spend_per_retro_date
  on public.reward_ledger (space_id, target_date)
  where event_type = 'retro_spent';
```

奖励余额不保存为可覆盖计数，而是 `sum(reward_ledger.amount)`。当前连续区间每达到10、20、30……天追加 `+1`；补签真正完成一个历史日期时追加 `-1`。断签后使用新的 `streak_run_start`，所以新一轮连续10天仍可获得奖励。

发卡和扣卡必须通过数据库事务函数执行：锁定 space，按 ready glimmers 重算连续区间和余额，再写入不可变账本。幂等键分别使用 `streak:{space_id}:{run_start}:{milestone}` 与 `retro:{space_id}:{target_date}`。客户端只可读取同空间账本，无 `INSERT/UPDATE/DELETE` 权限。

业务层使用中性的 `provider + bucket + object_key`，禁止保存 Supabase URL、R2 URL或签名 URL。对象 key 由数据库生成，不能接受客户端提供的任意 key：

```text
spaces/{space_id}/users/{auth.uid}/{yyyy}/{mm}/{glimmer_id}.{ext}
```

## 5. 两个成员的账号流程

Supabase 开启 email/password signup，并配置 Before User Created Postgres Hook：

1. 获取固定的 transaction advisory lock。
2. 检查 `registration_slots` 是否存在 `state = 'open'` 的槽位。
3. 有槽位则允许；两个槽位都被认领则返回 `REGISTRATION_LIMIT_REACHED`。

`auth.users after insert` 触发器再次获取同一把锁，使用 `for update skip locked` 原子认领第一个 open 槽位，并在同一事务中：

- 把槽位更新为 `claimed` 并写入 user id。
- 从 `raw_user_meta_data.display_name` 创建 profile。
- 把用户加入唯一 space，角色取自槽位。

不能用前端计数限制人数。必须测试多个并发注册请求，最终严格只有两个用户和两个不同角色。

删除账户前先把槽位改为 `locked`。只有项目所有者通过 Supabase Dashboard/受控 SQL 才能显式恢复为 `open`，避免第三人自动顶替原成员。

## 6. Supabase Storage 配置

### 6.1 私有桶

创建 bucket `glimmers`：

- `public = false`。
- `file_size_limit = 10 MiB`。
- `allowed_mime_types = image/jpeg,image/png,image/webp,image/gif`。
- 禁止使用 `getPublicUrl`；私有图片用 authenticated download 或短期 signed URL。
- dev 与 prod 使用不同 Supabase 项目或至少不同 bucket，避免测试数据混入生产。

### 6.2 `storage.objects` RLS

Storage 默认不允许操作，需要显式策略：

- `INSERT`：仅 `authenticated`；`bucket_id = 'glimmers'`；路径必须属于当前用户；对应 `glimmers` pending 行必须存在且 owner 是 `auth.uid()`。
- `SELECT`：仅已登录且与对象对应 glimmer 属于同一 space 的成员；只允许 ready、未删除记录。
- `UPDATE`：第一版不允许，不使用 `upsert` 覆盖对象。
- `DELETE`：仅允许对象 owner，并要求对应 glimmer 未删除且 `created_at > now() - interval '24 hours'`；客户端只能通过 Storage `.remove()` 删除符合条件的对象。

策略判断以 `storage.objects.owner_id`、`auth.uid()`、`public.glimmer_assets.object_key` 和关联的 `public.glimmers` 联表为准，不只检查文件夹字符串。`owner_id` 才是当前字段，避免使用已废弃的 `owner`。

注意：`storage.objects` 只通过 Storage API 操作，不直接用 SQL 删除对象。第一版使用两步删除：已认证客户端在 DELETE policy 保护下调用 `.remove()` → RPC 确认对象已不存在并软删除业务元数据。每一步必须幂等，并由清理任务修复中间状态。

## 7. 业务 RPC 契约

### 7.1 稳定的存储端口

`storage-port.js` 定义唯一允许 repository 依赖的接口：

```js
// asset = { id, provider, bucket, object_key, content_type, size_bytes }
export class StoragePort {
  async upload(asset, file, options = {}) {}
  async exists(asset) {}
  async getReadableUrl(asset, options = {}) {}
  async remove(asset) {}
}
```

方法返回统一结果和错误码，如 `OBJECT_NOT_FOUND`、`UPLOAD_REJECTED`、`READ_FORBIDDEN`、`DELETE_FORBIDDEN`，不得把 Supabase/R2 SDK 的原始错误结构传播给 UI。上传进度、取消信号、重试策略通过 `options` 扩展，避免以后破坏接口。

`storage-adapter-factory.js` 按 `asset.provider` 返回适配器。第一版只注册 `supabase`；未知 provider 必须显式失败。业务 repository 负责 begin/finalize 状态机，适配器只负责对象操作，不判断“每天一张”、角色、连续天数或 24 小时规则。

### 7.2 `begin_glimmer_upload(space_id, date, content_type, size_bytes, note, mood)`

校验当前用户、空间成员关系、当天/日期规则、MIME、大小、note、mood 和每日唯一性。`mood` 可为 `happy | neutral | sad | tired | loved | null`。数据库推导 role，从 `spaces.default_storage_provider` 选择后端，创建 pending glimmer 与 asset，并生成 object key；客户端不能指定 provider。第一版默认返回 Supabase asset：

```json
{
  "id": "uuid",
  "asset": {
    "id": "uuid",
    "provider": "supabase",
    "bucket": "glimmers",
    "object_key": "spaces/.../image.jpg"
  }
}
```

repository 把 asset 交给 `StoragePort.upload()`；只有 Supabase 适配器内部执行：

```js
await supabase.storage
  .from(asset.bucket)
  .upload(asset.object_key, file, {
    contentType: file.type,
    upsert: false
  })
```

### 7.3 `finalize_glimmer_upload(id)`

只允许 owner 完成自己的 pending 记录。必须按 asset provider 校验对象存在；Supabase 第一版确认对应 `storage.objects` 行的 bucket、key、owner、MIME 与申请一致，再更新为 ready。重复调用返回同一 ready 记录。

### 7.4 `list_glimmers(space_id, from, to, owner_id, limit, cursor)`

- 日期为闭区间，最大跨度 366 天。
- `limit` 默认 50、最大 100。
- 每条 glimmer DTO 包含可空的 `mood` 字段。
- 使用 `(glimmer_date, created_at, id)` 游标分页。
- 只返回 ready 且未删除记录。
- RLS 保证只能查看同一 space。

### 7.5 读取图片

repository 调用 `StoragePort.getReadableUrl(asset)`。Supabase 适配器优先使用当前 session 下载并生成 object URL；如需直接给 `<img>` 使用则创建 600 秒 signed URL。URL 到期后重新生成，不能保存进数据库。R2 适配器未来可用 Worker 返回的短期 GET URL，UI 无需改变。

### 7.6 删除对象 / `complete_glimmer_delete(id)`

- 只允许 owner。
- 使用服务端 `created_at > now() - interval '24 hours'` 判断，不能相信浏览器时间。
- repository 调用 `StoragePort.remove(asset)`；Supabase 适配器用 `.remove([objectKey])`，`storage.objects` DELETE policy 再次执行 owner 和 24 小时校验。
- complete RPC 确认对象不存在后写入 `deleted_at`。
- 重复删除视为成功；失败状态可以被定时清理任务重试。

如果项目采用 Supabase Edge Function，可把删除三步封装在一个函数内并使用 service-role key；service-role 只能放在 Edge Function secret 中，绝不能下发浏览器。

### 7.7 `grant_streak_rewards(space_id)` / `complete_retro_glimmer(space_id, target_date, ...)`

- `grant_streak_rewards` 锁定 space，从 ready glimmers 重算当前连续区间，为未发放的10天里程碑追加 `streak_earned +1`。
- `complete_retro_glimmer` 锁定同一 space，确认目标是过去未完整日期、补签后两人记录齐全且账本余额大于0，再在同一事务追加 `retro_spent -1`。
- 两个函数都以账本唯一键保证重试和并发幂等；浏览器不能传入 amount、run start 或 milestone 作为可信值。
- 补签上传对象仍通过 StoragePort；最终业务状态与扣卡在数据库事务中完成，失败可安全重试。

## 8. 前端改造

1. 使用 `supabase.txt` 中的项目 URL 和 publishable key 初始化客户端。
2. 增加邮箱、显示名、密码、确认密码注册表单；调用 `signUp({ email, password, options: { data: { display_name }}})`。
3. 处理邮箱确认、重复邮箱、弱密码、注册已满、登录失败和找回密码。
4. 使用 `signInWithPassword` 登录，监听 auth state 并恢复 session。
5. 把 `getGlimmerData/saveGlimmerData` 替换为异步 repository；UI 只调用 repository，不直接调用 Supabase Storage。
6. 实现 `StoragePort`、Supabase adapter 和 factory；上传前检查 MIME 和 10 MiB 大小，再按 begin → adapter.upload → finalize 执行。
7. 上传失败时删除 pending 记录或等待清理，不把失败项显示为已完成。
8. 列表通过 glimmers 表获取，图片按需 download/签名，避免一次加载全年原图。
9. 服务端数据是日期、角色、删除窗口和完成状态的唯一真值。
10. note 使用 `textContent` 等安全 DOM API渲染，禁止把用户内容直接拼接进 `innerHTML`。
11. 背包卡数从奖励账本余额读取；移除本地 `retroCards/rewardedTens` 增减逻辑，补签完成统一调用服务端事务。

## 9. Agent 单日完成阶段

Agent 按顺序执行，每阶段验证通过后才进入下一阶段。缺少 Supabase 登录授权、SMTP 或生产域名时，完成代码和本地测试，并明确把部署标为外部阻塞，不能声称已上线。

### 阶段 1：审计与初始化（30 分钟）

- [ ] 检查仓库、Git 状态、Supabase CLI 和项目连接信息。
- [ ] 建立 migration、tests、client、repository、StoragePort、adapter 和 factory 文件。
- [ ] 更新 `.gitignore`，确认无 service-role key。

完成标准：本地 Supabase 工具可运行，配置缺口已记录。

### 阶段 2：表、注册 Hook 与 RLS（90 分钟）

- [ ] 创建全部表、类型、索引、双人槽位和唯一 space。
- [ ] 实现注册上限 Hook、成员触发器和 profiles RLS。
- [ ] 实现 glimmers RLS 与 begin/finalize/list/delete RPC。
- [ ] 创建 reward ledger，并实现连续里程碑发卡与补签完成扣卡事务。

完成标准：空库 migration 一次成功；两个成员注册成功，第三个用户和并发超额注册失败；越权 SQL 测试通过；奖励并发请求不会重复发放或扣除。

### 阶段 3：Storage 私有桶与策略（60 分钟）

- [ ] 创建 `glimmers` 私有桶和类型/大小限制。
- [ ] 编写 `storage.objects` INSERT/SELECT/DELETE 策略。
- [ ] 验证用户不能上传到他人路径、不能覆盖文件、第三人不能读取。

完成标准：两个成员可以按规则上传和互看，匿名/越权访问被拒绝，bucket 不公开。

### 阶段 4：注册登录和数据层（75 分钟）

- [ ] 接入注册、邮箱确认、登录、session、退出、忘记密码。
- [ ] repository 封装业务 RPC，只依赖 StoragePort；Supabase SDK 文件操作仅存在于 Supabase adapter。
- [ ] 替换 `localStorage` 业务数据源。
- [ ] 卡数和补签状态接入奖励账本/RPC，删除本地奖励计数写入。

完成标准：刷新可恢复 session；账号上限提示明确；未登录看不到数据。

### 阶段 5：图片主链路 UI（90 分钟）

- [ ] 接入 begin → upload → finalize、进度和重试。
- [ ] 接入时间线、日期查询、图片按需读取。
- [ ] 接入 owner 24 小时内删除及所有错误状态。
- [ ] 用服务端数据重算日历、连续天数和成长阶段。

完成标准：两个浏览器可上传并互看；刷新不丢数据；超时或非 owner 删除失败。

### 阶段 6：测试与安全修复（75 分钟）

- [ ] 运行 SQL、前端和端到端测试。
- [ ] 并发测试注册、同日上传和重复删除。
- [ ] 测试 XSS、伪造 object path、超大文件、错误 MIME、断网和 session 过期。
- [ ] 修复阻断及高风险问题并回归。

完成标准：主链路没有已知阻断/高风险缺陷，测试结果有记录。

### 阶段 7：部署与冒烟（45 分钟）

- [ ] 应用生产 migration，启用 Auth Hook、邮箱注册及 redirect URL。
- [ ] 配置私有 bucket、Storage policies、SMTP 和正式站点 origin。
- [ ] 发布前端并执行注册、登录、上传、查看和删除冒烟测试。
- [ ] 输出改动、命令、测试、地址、限制和后续任务。

完成标准：生产主链路通过；前端只有 publishable key；日志无 token、邮箱密码或签名 URL。

## 10. 必测场景

- 同时发起至少 3 个注册，最终只能认领两个槽位且角色各一个。
- 匿名用户和第三个普通成员不能读数据库记录或私有对象。
- Ray 可以读取 Mel 的 ready 图片，但不能删除 Mel 的图片。
- 同一角色同一天第二次上传被唯一约束拒绝。
- 同一连续区间的10天里程碑并发请求只写一条 `+1`；断签后新一轮10天可再次获得卡。
- 余额为0不能补签；同一历史日期并发完成只写一条 `-1`；客户端不能直接修改或删除账本。
- pending 没有对应对象时不能 finalize。
- 23:59:59 内可删，24:00:00 后 API 拒绝。
- 修改浏览器时钟、role、space id、object path 都不能绕过规则。
- 使用 fake StoragePort 跑 repository 合约测试，证明 UI/业务流程不依赖 Supabase SDK 返回结构。
- signed URL 到期后失效；私有 bucket 的 `getPublicUrl` 不能读取对象。
- note 中的 HTML/脚本只显示文本，不执行。
- Storage 上传成功但 finalize 失败、删除对象成功但完成 RPC 失败，都能安全重试或清理。

## 11. 上线前确认

- 正式站点 URL、登录回调 URL 和 Supabase 项目 region。
- 是否开启邮箱确认；推荐开启并配置自定义 SMTP。
- 账号是否接受邮箱形式；本计划默认接受。
- 删除窗口是否为滚动 24 小时；本计划默认是。
- 是否允许 GIF；默认允许，若需降低存储和安全风险可移除。
- Supabase 项目当前 Storage 容量、流量和文件限制是否满足预期。

## 12. 后续增强
- 图片压缩、缩略图、EXIF/定位信息清理。
- 一次性导入旧 `localStorage` base64 图片。
- Storage orphan/pending 定时清理、监控告警和备份恢复演练。
- 流量或成本增长后，按下述兼容迁移流程接入 Cloudflare R2。

## 13. Cloudflare R2 兼容迁移路径

迁移不得修改 `glimmers` 业务主表含义，也不得让 UI 感知 URL 或 SDK 差异：

1. 新增 `R2StorageAdapter`，实现与 Supabase adapter 相同的 StoragePort 合约。
2. 新增最小 Cloudflare Worker，只处理 R2 PUT/GET/DELETE 短期签名和对象 HEAD；认证继续使用 Supabase access token。
3. 在服务端配置新增上传的默认 provider，先仅对测试账户或 staging 返回 `r2` asset。
4. 后台逐个复制旧对象到 R2；为同一 glimmer 插入第二条 `glimmer_assets(provider='r2', is_current=false)`。
5. 对比 size/checksum，并从 R2 实际读取验证；成功后用事务切换 `is_current`，前端下次查询自动选择 R2 adapter。
6. 保留 Supabase 对象一段回滚窗口。若 R2 读取失败，把 current asset 切回 Supabase，不回滚业务数据。
7. 稳定期后批量删除旧 Supabase 对象并软删除对应 asset；最后再收紧旧 Storage policies。

为了保证上述路径可执行，第一版必须满足：

- 数据库永远保存 object key，不保存供应商域名或临时 URL。
- `list_glimmers` 返回统一 asset DTO，包含 provider/bucket/key/MIME/size，不返回 SDK 对象。
- repository 和 UI 的测试使用 fake adapter；Supabase/R2 各自跑同一份 adapter contract tests。
- provider 切换通过配置和数据库记录完成，不通过前端硬编码。
- 上传状态机和幂等键属于业务层，不能藏在 Supabase adapter 内。
- 迁移脚本必须可断点续传，以 asset id 为幂等键，并记录复制、校验、切换和清理状态。

## 14. 官方文档

- [Supabase Auth](https://supabase.com/docs/guides/auth)
- [Supabase Password Auth](https://supabase.com/docs/guides/auth/passwords)
- [Before User Created Hook](https://supabase.com/docs/guides/auth/auth-hooks/before-user-created-hook)
- [Postgres Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase Storage Quickstart](https://supabase.com/docs/guides/storage/quickstart)
- [Storage buckets 与私有访问](https://supabase.com/docs/guides/storage/buckets/fundamentals)
- [Storage access control](https://supabase.com/docs/guides/storage/security/access-control)
- [Storage object ownership](https://supabase.com/docs/guides/storage/security/ownership)
- [Storage helper functions](https://supabase.com/docs/guides/storage/schema/helper-functions)
- [JavaScript createSignedUrl](https://supabase.com/docs/reference/javascript/file-buckets-createsignedurl)

第一日交付主链路为：**前两位成员自助注册 → 第三位成员被原子拒绝 → 登录 → 创建 pending 元数据 → 上传私有 Storage → finalize → 连续10天账本发卡 → 服务端事务补签扣卡 → 双方查看 → owner 在 24 小时内删除**。
