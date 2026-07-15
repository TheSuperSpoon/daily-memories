# 微光收集后端工程实施计划

> 状态：可执行草案  
> 适用范围：当前静态前端（`index.html`、`script.js`）的“微光收集”模块  
> 技术栈：Supabase Auth + Supabase Postgres + Cloudflare Worker + Cloudflare R2  
> 目标：替换 `localStorage` 中的图片数据，实现两位用户安全登录、跨设备同步、私有图片上传/查看，以及上传后 24 小时内删除。

## 1. 已确认的产品规则与实施假设

原始需求：注册/登录、上传图片、24 小时内删除、按用户和时间范围查看多张图片。当前前端还包含“每天 Ray/Mel 各一张、两张齐全算完成、连续天数、补签卡、成长阶段”等规则。

第一版按以下规则实施；若产品规则改变，应先修改本节和数据库约束：

- 系统仅供一个私密双人空间使用，成员角色固定为 `ray`、`mel`。
- 每位成员每天最多上传一张图片；同一天两人均上传后，该日为完成状态。
- 普通上传只允许当天；补签卡通过服务端不可变奖励账本发放和消费，不能继续由浏览器自行增减。
- “一天内删除”解释为以服务端 `created_at` 为准的滚动 24 小时，且只能删除自己的图片。
- 图片桶保持私有；数据库只保存 R2 `object_key`，不保存永久公开 URL，也不保存图片二进制。
- 日期统一按 `Asia/Shanghai` 计算业务日，数据库时间统一存 `timestamptz`（UTC）。
- 浏览器中的 Supabase publishable key 可以公开；Supabase service-role key、R2 Access Key/Secret 只能放在 Worker secrets 中。
- 开放邮箱 + 密码自助注册，用户自行定义登录邮箱、密码和显示名；全站最多两个业务成员账号。
- 第一个成功注册者自动分配 `ray`，第二个自动分配 `mel`；第三个及之后的注册必须由服务端拒绝。人数限制不能依赖前端查询或按钮隐藏。
- 若用户所说的“账号”特指不带邮箱的用户名，需要另做用户名登录代理；第一版使用 Supabase 原生且可找回密码的“邮箱即登录账号”。

## 2. 总体架构

```text
Browser
  └─ Auth / business repository
       ├─ Supabase Auth：登录、刷新 session、退出
       ├─ Supabase REST：在 RLS 保护下读取业务元数据
       └─ StoragePort（稳定接口）
            └─ R2StorageAdapter（调用 Worker API）

Cloudflare Worker
  ├─ 认证、输入校验、统一错误与 API 契约
  └─ ObjectStorePort（服务端稳定接口）
       └─ R2ObjectStore（签名、HEAD、DELETE）

Supabase Postgres：用户资料、空间成员、图片元数据、服务端约束
Cloudflare R2：原始图片对象（private）
```

上传采用三步流程：申请上传 → 浏览器直传 R2 → 确认上传。这样图片流量不经过 Worker，R2 凭据也不会暴露。预签名 URL 是 bearer token，必须短时、单对象、单操作授权。

查看流程：浏览器先查询有权限的元数据，再按需向 Worker 批量申请短期 GET URL。不要把预签名 URL持久化到数据库。

UI、日历和业务 repository 不得直接依赖 R2、S3 SDK 或 Worker 的内部响应。浏览器文件操作全部经过 `StoragePort`，Worker 对象操作全部经过 `ObjectStorePort`。未来增加 Supabase Storage、S3 或其他对象存储时，只新增适配器并复用相同业务状态机。

## 3. 仓库目标结构

```text
daily-memories/
├─ index.html
├─ script.js
├─ backend develop.md
├─ supabase/
│  ├─ config.toml
│  ├─ migrations/
│  │  └─ <timestamp>_initial_backend.sql
│  └─ seed.sql                 # 仅本地测试数据，不含真实凭据
├─ worker/
│  ├─ src/index.ts
│  ├─ src/auth.ts
│  ├─ src/supabase.ts
│  ├─ src/storage/object-store-port.ts
│  ├─ src/storage/r2-object-store.ts
│  ├─ src/storage/object-store-factory.ts
│  ├─ test/
│  ├─ package.json
│  ├─ tsconfig.json
│  └─ wrangler.jsonc
├─ js/
│  ├─ glimmer-repository.js
│  └─ storage/
│     ├─ storage-port.js
│     ├─ r2-storage-adapter.js
│     └─ storage-adapter-factory.js
├─ .env.example                # 仅变量名/示例值
└─ .gitignore
```

## 4. 数据模型与数据库迁移

### 4.1 表

使用 Supabase 自带的 `auth.users` 保存账户和密码哈希，不创建自制密码表。

```sql
create type public.member_role as enum ('ray', 'mel');
create type public.upload_status as enum ('pending', 'ready');
create type public.storage_provider as enum ('supabase', 'r2');
create type public.reward_event_type as enum ('streak_earned', 'retro_spent');

create table public.spaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  timezone text not null default 'Asia/Shanghai',
  default_storage_provider public.storage_provider not null default 'r2',
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

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 30),
  created_at timestamptz not null default now()
);

create table public.registration_slots (
  slot smallint primary key check (slot in (1, 2)),
  role public.member_role not null unique,
  state text not null default 'open' check (state in ('open', 'claimed', 'locked')),
  user_id uuid unique references auth.users(id) on delete set null,
  claimed_at timestamptz,
  check ((state = 'claimed' and user_id is not null) or state <> 'claimed')
);

insert into public.registration_slots (slot, role)
values (1, 'ray'), (2, 'mel');

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
  provider public.storage_provider not null default 'r2',
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

create index glimmers_owner_time
  on public.glimmers (owner_id, created_at desc);

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

奖励余额不单独存列，统一按 `sum(amount)` 计算。连续记录每达到 10、20、30……天时插入 `+1`；一次补签真正使目标日期完整时插入 `-1`。断签后新一轮连续记录使用新的 `streak_run_start`，因此重新连续 10 天可以再次获得奖励。

发卡和扣卡只能通过数据库事务函数执行：锁定对应 space，重新从 ready glimmers 计算连续区间和余额，再插入账本。扣卡前必须验证余额大于 0、目标日期早于今天且尚未完整；补签完成、扣卡和图片元数据状态更新必须在同一事务中提交。`idempotency_key` 建议分别使用 `streak:{space_id}:{run_start}:{milestone}` 和 `retro:{space_id}:{target_date}`，重复请求返回原结果而不是重复记账。

`reward_ledger` 对成员只开放同空间 `SELECT`；客户端没有 `INSERT/UPDATE/DELETE` 权限。账本记录不可修改或删除。

`role` 不接受浏览器自由指定。注册触发器按空余槽位分配角色，创建图片记录的数据库函数再从 `space_members` 推导当前用户角色。业务层只使用 `provider + bucket + object_key`，不保存供应商域名或临时 URL。对象 key 格式固定为：

```text
spaces/{space_id}/users/{user_id}/{yyyy}/{mm}/{glimmer_id}.{ext}
```

### 4.2 RLS

所有 `public` 表执行 `enable row level security`。最小策略如下：

- `spaces SELECT`：仅空间成员可见。
- `space_members SELECT`：仅同空间成员可见。
- `glimmers SELECT`：仅同空间成员可读，且只返回 `ready`、未删除记录。
- `glimmer_assets SELECT`：仅当关联 glimmer 对当前成员可见时返回，且默认只返回 `is_current = true` 资产。
- `glimmers INSERT/UPDATE/DELETE`：不直接授予浏览器；由受控 RPC/Worker 完成。
- `profiles SELECT`：只允许两位已注册成员互相查看；用户只能修改自己的显示名。
- 显式检查 `auth.uid() is not null`，不要依赖 `NULL = user_id` 的隐式行为。

建议封装三个数据库函数，并撤销 `anon` 的执行权限：

1. `begin_glimmer_upload(p_space_id, p_date, p_content_type, p_size_bytes, p_note, p_mood)`：校验成员、推导角色、校验日期、心情值域和唯一性，从 `spaces.default_storage_provider` 选择后端，创建 pending glimmer 与 asset，返回统一 asset DTO；`p_mood` 可为 `happy | neutral | sad | tired | loved | null`，客户端不能指定 provider。
2. `finalize_glimmer_upload(p_id, p_asset_id)`：只允许 owner 完成自己的 pending 记录，并按 asset provider 校验对象后转为 `ready`。
3. `soft_delete_glimmer(p_id)`：只允许 owner 且 `created_at > now() - interval '24 hours'`，设置 `deleted_at`。

奖励另封装两个事务函数：

4. `grant_streak_rewards(p_space_id)`：从服务端记录重算当前连续区间，为尚未发放的 10 天里程碑追加账本记录。
5. `complete_retro_glimmer(p_space_id, p_target_date, ...)`：锁定空间和余额，确认补签后该日完整，在同一事务内追加 `retro_spent = -1`；余额不足或重复目标日期则拒绝。

函数如使用 `security definer`，必须固定 `search_path`，完整限定表名，并逐个 `grant execute`；否则优先使用普通 invoker 函数和 RLS。

### 4.3 自助注册与两人上限

Supabase 控制台保持 email/password signup 开启，并配置 **Before User Created Postgres Hook**。Hook 需要：

1. 获取固定 advisory transaction lock，串行化并发注册检查。
2. 检查 `registration_slots` 是否还有 `state = 'open'` 的槽位。
3. 有槽位时返回 `{}`；两个槽位均已认领时返回 `4xx` 错误 `REGISTRATION_LIMIT_REACHED`。

不能只写 `select count(*) < 2`：两次并发注册可能同时看到 1 个用户。advisory lock 必须覆盖检查，并用两请求并发测试证明第三个普通成员不会被创建。槽位表不向 `anon/authenticated` 开放读写。

在 `auth.users` 上增加受控的 `after insert` 触发器：再次获取同一把锁，以 `for update skip locked` 原子认领首个 `open` 槽并更新为 `claimed`，创建 `profiles`，把 `raw_user_meta_data.display_name` 清洗后写入显示名，并按槽位角色把新用户加入唯一的 space。`registration_slots.user_id`、`unique (space_id, role)` 是最终防线。若触发器失败，应让注册事务整体失败，不能留下“有 Auth 账户但没有成员资格”的半成品。

邮箱确认策略必须在上线前确定：推荐开启邮箱确认，并配置自定义 SMTP；未确认用户不能形成有效业务 session。删除 Auth 用户前必须先把对应槽位从 `claimed` 改为 `locked`，避免外键置空后意外重新开放；只有项目所有者通过 Supabase Dashboard/受控 SQL 才能在备份后显式改回 `open`。

## 5. Cloudflare R2 与 Worker 配置

### 5.1 R2

- 创建私有 bucket，例如 `daily-memories-prod`，另建 `daily-memories-dev`，不要混用环境。
- 创建仅对目标 bucket 有对象读写权限的 R2 API token。
- 配置浏览器 CORS：生产仅允许正式站点 origin，开发加入实际 localhost origin；方法仅 `PUT/GET/HEAD`；允许 `Content-Type`；不要使用 `*` 生产 origin。
- 预签名 PUT 有效期建议 5 分钟，GET 建议 10 分钟。
- PUT 签名绑定 `Content-Type`；Worker 同时限制扩展名、MIME 和最大 10 MiB。
- 设置生命周期规则清理由失败上传遗留的对象；数据库 `pending` 记录也由定时任务清理。

### 5.2 Worker 变量

非敏感配置放 `wrangler.jsonc` 的 `vars`：

```text
SUPABASE_URL
SUPABASE_PUBLISHABLE_KEY
R2_ACCOUNT_ID
R2_BUCKET_NAME
ALLOWED_ORIGINS
MAX_UPLOAD_BYTES=10485760
```

敏感值使用 `wrangler secret put`，本地放 `.dev.vars` 且加入 `.gitignore`：

```text
SUPABASE_SERVICE_ROLE_KEY
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
```

生产 Worker 必须：严格 CORS allowlist、拒绝无/坏 token、统一 JSON 错误格式、生成 request id、日志不记录 JWT/预签名 URL/密钥。

### 5.3 双层存储适配器契约

浏览器端 `StoragePort`：

```js
// asset = { id, provider, bucket, object_key, content_type, size_bytes }
export class StoragePort {
  async upload(asset, file, options = {}) {}
  async exists(asset) {}
  async getReadableUrl(asset, options = {}) {}
  async remove(asset) {}
}
```

Worker 端 `ObjectStorePort`：

```ts
interface ObjectStorePort {
  createUploadGrant(asset: AssetDto): Promise<UploadGrant>;
  createReadGrant(asset: AssetDto): Promise<ReadGrant>;
  head(asset: AssetDto): Promise<ObjectMetadata | null>;
  remove(asset: AssetDto): Promise<void>;
}
```

两个适配器都返回统一错误码：`OBJECT_NOT_FOUND`、`UPLOAD_REJECTED`、`READ_FORBIDDEN`、`DELETE_FORBIDDEN`、`PROVIDER_UNAVAILABLE`。不得把 AWS SDK、R2 或 Worker 内部错误直接传播到 UI。业务规则（每天一张、角色、补签、24小时删除）属于 repository/RPC，不得写入适配器。

`storage-adapter-factory` 按 `asset.provider` 选择浏览器适配器，`object-store-factory` 按 provider 选择 Worker 实现。第一版只启用 `r2`，未知 provider 显式失败；provider 默认值来自服务端配置而不是前端硬编码。

## 6. API 契约

所有 `/api/*` 请求使用 `Authorization: Bearer <Supabase access_token>`。Worker 每次验证 token；第一版可调用 Supabase Auth `getUser(token)` 做权威校验，后续再按官方 JWKS 方案做本地 JWT 验证和密钥轮换缓存。

### `POST /api/uploads`

请求：

```json
{
  "spaceId": "uuid",
  "date": "2026-07-20",
  "contentType": "image/jpeg",
  "sizeBytes": 345678,
  "note": "今天的微光"
}
```

处理：认证 → 成员/日期/大小/MIME 校验 → 创建 `pending` 行 → 生成该 object key 的 PUT URL。返回 `201`：

```json
{
  "id": "uuid",
  "asset": {
    "id": "uuid",
    "provider": "r2",
    "bucket": "daily-memories-prod",
    "object_key": "spaces/.../image.jpg",
    "content_type": "image/jpeg",
    "size_bytes": 345678
  },
  "uploadUrl": "short-lived-presigned-url",
  "expiresIn": 300,
  "requiredHeaders": { "Content-Type": "image/jpeg" }
}
```

### `POST /api/uploads/:id/complete`

Worker 通过 `ObjectStorePort.head(asset)` 确认对象存在、大小/MIME 与申请一致，再把记录改为 `ready`。幂等：重复完成返回同一 ready 记录。

### `GET /api/glimmers?spaceId=&from=&to=&ownerId=&limit=&cursor=`

- `from/to` 为闭区间业务日期；最大跨度建议 366 天。
- `ownerId` 可选，必须属于同一空间。
- `limit` 默认 50、最大 100；使用 `(glimmer_date, created_at, id)` 游标，不使用大 offset。
- 返回含 `mood` 的元数据、当前统一 asset DTO 和 `nextCursor`。默认不附 GET URL；需要显示的 asset id 再批量签名。

### `POST /api/glimmers/read-urls`

请求 `{ "assetIds": ["uuid", "uuid"] }`，最多 50 个。Worker 验证每条资产关联记录可见，再通过对应 provider adapter 返回短期读取 URL。

### `DELETE /api/glimmers/:id`

认证并校验 owner 和 24 小时窗口。推荐顺序：数据库标记删除 → 通过当前 asset 的 provider adapter 删除对象；失败写结构化错误并由清理任务重试。成功返回 `204`，重复删除也返回 `204`。

### 错误格式

```json
{
  "error": {
    "code": "DELETE_WINDOW_EXPIRED",
    "message": "This image can no longer be deleted.",
    "requestId": "..."
  }
}
```

至少定义：`UNAUTHORIZED`(401)、`FORBIDDEN`(403)、`NOT_FOUND`(404)、`UPLOAD_CONFLICT`(409)、`DELETE_WINDOW_EXPIRED`(409)、`VALIDATION_ERROR`(422)、`RATE_LIMITED`(429)、`INTERNAL_ERROR`(500)。

## 7. 前端改造任务

1. 引入 `@supabase/supabase-js`（构建工具或明确版本的 ESM），用 `supabase.txt` 中的 URL/publishable key 初始化客户端；publishable key 不属于服务端秘密。
2. 增加注册表单：邮箱、显示名、密码、确认密码；客户端做基础格式检查后调用 `signUp`，并处理确认邮件、重复邮箱和 `REGISTRATION_LIMIT_REACHED`。
3. 将当前页面顶层的硬编码密码锁与真正账户登录明确分离；微光页面必须以 Supabase session 为准。
4. 登录使用 `signInWithPassword`，监听 auth state；提供忘记密码流程；退出时清 session 和内存中的预签名 URL。
5. 将 `getGlimmerData/saveGlimmerData` 替换为异步 repository 层，UI 只依赖统一 asset DTO 和 StoragePort，实现 `list/create/complete/delete/getReadUrls`。
6. 实现 StoragePort、R2 adapter 和 factory；上传前检查文件类型和 10 MiB 大小，再按 begin → adapter.upload → complete 执行，展示进度、失败重试和重复冲突。
7. 图片只使用短期 GET URL；到期或 403 时重新签名；离开页面时撤销本地 object URL。
8. 服务端返回日期与状态作为真值，客户端不再决定“今天是否可上传”或删除截止时间。
9. 把 note 渲染从 `innerHTML` 改为 `textContent`/DOM 节点，避免存储型 XSS；图片 URL 也不得拼接用户输入。
10. 首次上线不自动迁移 `localStorage` base64 图片。增加一次性“导入本机旧数据”工具：逐项转成 Blob、用户确认日期/角色后按新 API 上传；导入成功才标记该项完成，保留可重试能力。
11. 加载期间显示 skeleton；离线时保留只读缓存提示，但不能把未同步数据显示为已上传。

## 8. Agent 单日执行阶段与完成标准

目标是在一个工作日内，由一个编码 Agent 按顺序完成可上线的最小闭环。时间是执行时间盒，不是多人日估算；Agent 在每个阶段结束时必须运行验证，失败则在当前阶段修复，不能带着已知失败进入下一阶段。

单日范围包含：双人自助注册、登录、RLS、图片上传/查看、24 小时内删除、奖励账本、补签事务、前端接入和部署验证。图片压缩和完整备份恢复演练不纳入当天主链路，作为后续增强任务。

### 阶段 1：环境审计与脚手架（约 30 分钟）

- [ ] 检查现有前端、`supabase.txt`、Git 状态和本机 Supabase/Node/Wrangler CLI。
- [ ] 确认 Supabase project ref、Cloudflare account、dev/prod bucket、正式 origin 是否可用。
- [ ] 创建 `supabase/migrations`、`worker/src`、测试目录和配置模板。
- [ ] 将 `.env*`、`.dev.vars*`、Wrangler 本地状态加入 `.gitignore`，检查仓库无 service-role/R2 密钥。
- [ ] 记录无法由 Agent 自动取得的外部配置，但继续完成可在本地验证的部分。

完成标准：项目可以安装依赖并运行本地命令；配置缺口被明确列出；前端 bundle 中只有 publishable key。

### 阶段 2：数据库、注册限额与 RLS（约 90 分钟）

- [ ] 编写单个初始 migration：types、spaces、registration slots、profiles、members、glimmers、glimmer assets、索引和约束。
- [ ] 实现 Before User Created Hook，用 advisory lock 保证最多两个注册槽位。
- [ ] 实现注册后触发器：创建 profile、认领 `ray/mel` 槽位并加入唯一 space。
- [ ] 实现上传开始、上传确认、软删除 RPC，以及所有 RLS/grants。
- [ ] 实现 `reward_ledger`、连续十天发卡和补签完成扣卡事务函数。
- [ ] 增加 SQL 测试：前两人注册成功、第三人失败、并发不超额、跨用户删除失败、24 小时边界正确。

完成标准：migration 可从空库一次执行成功；回归测试证明最多两个账户、角色唯一、匿名与越权访问均被拒绝；奖励重复请求不重复发卡或扣卡。

### 阶段 3：R2 与 Worker 主链路（约 2 小时）

- [ ] 初始化 TypeScript Worker，定义 vars、secrets 类型和统一 JSON 错误结构。
- [ ] 实现 ObjectStorePort、R2ObjectStore 和 factory，并通过 provider 选择实现。
- [ ] 实现 Supabase token 校验、严格 CORS、输入校验和 request id。
- [ ] 实现 `POST /api/uploads`、complete、列表查询、批量 read URLs 和 DELETE。
- [ ] PUT/GET URL 使用短期签名；complete 前通过 HEAD 校验对象 MIME 和大小。
- [ ] 增加 pending 清理入口或 scheduled handler；日志不得包含 JWT、密钥和预签名 URL。
- [ ] 编写 Worker 单元/集成测试，包括无 token、恶意 key、超大文件、重复 complete/delete 和删除超时。

完成标准：自动化测试可跑通上传申请—确认—查询—读取—删除；对象只能进入当前用户路径，过期与越权请求失败。

### 阶段 4：注册登录与前端数据层（约 75 分钟）

- [ ] 增加邮箱、显示名、密码、确认密码注册表单和登录/退出状态。
- [ ] 接入 `signUp`、`signInWithPassword`、session 恢复、邮箱确认提示和注册已满提示。
- [ ] 建立 repository 层，将认证、Worker API 和 UI 隔离。
- [ ] 实现浏览器 StoragePort、R2StorageAdapter 和 adapter contract tests。
- [ ] 将 `getGlimmerData/saveGlimmerData` 的业务读取替换为异步远程数据；保留旧数据仅供一次性导入，不再作为真值。

完成标准：刷新页面后 session 可恢复；前两个账号可以注册，第三个得到明确提示；未登录用户看不到微光数据。

### 阶段 5：上传、时间线与删除 UI（约 90 分钟）

- [ ] 接入文件校验、预签名直传、上传进度、complete 和失败重试。
- [ ] 接入日期范围查询、分页、短期图片 URL 到期重签。
- [ ] 按服务端记录渲染日历、双方上传状态、连续天数和成长阶段。
- [ ] 背包卡数改为查询账本余额；补签选择和完成改走服务端事务，移除本地 `retroCards/rewardedTens` 写入。
- [ ] 只为 owner 且未超过 24 小时的记录显示删除入口，同时始终以 API 拒绝为安全边界。
- [ ] note 使用安全 DOM API 渲染，处理 401、403、409、422、429 和离线状态。

完成标准：两个账号在不同浏览器上传后能互相看到；刷新不丢数据；不能删除对方或超过 24 小时的图片。

### 阶段 6：全链路验证与缺陷修复（约 60 分钟）

- [ ] 运行 SQL、Worker、前端静态检查和全部自动化测试。
- [ ] 使用两个正常账号和一个第三账号执行注册并发测试。
- [ ] 验证私有桶不可直接访问、错误 origin 被拒绝、签名 URL 到期失效。
- [ ] 测试移动端尺寸、刷新、退出重登、重复点击上传、断网重试和 XSS 输入。
- [ ] 修复当天范围内发现的阻断和高风险缺陷，并重新运行相关测试。

完成标准：主链路无阻断/高风险已知缺陷；测试结果和仍存在的非阻断限制被记录。

### 阶段 7：部署、冒烟与交付（约 45 分钟）

- [ ] 在 Supabase 应用生产 migration，启用 Before User Created Hook 和邮箱密码注册。
- [ ] 配置 R2 私有桶、CORS、最小权限 token，以及 Worker vars/secrets。
- [ ] 部署 Worker 和前端，记录部署版本与配置项名称。
- [ ] 在正式 origin 做注册、登录、上传、跨账号查看和删除冒烟测试。
- [ ] 输出交付报告：改动文件、命令、测试结果、生产地址、已知限制和后续任务。

完成标准：生产主链路冒烟通过，日志无敏感信息，原有静态页面功能不受影响。若缺少账号权限、域名、SMTP 或密钥导致无法部署，Agent 仍需完成代码和本地测试，并把部署标为唯一外部阻塞项，不得声称已经上线。

### 当天结束后的增强队列
- [ ] 图片压缩、缩略图和 EXIF 清理。
- [ ] 一次性导入旧 `localStorage` 图片。
- [ ] 完整 Postgres/R2 备份恢复演练、监控告警和孤儿对象盘点。

## 9. 必测场景

### 自动化测试

- 数据库：每条 RLS policy 的允许/拒绝测试；两用户并发上传同一角色/日期；24 小时边界（23:59:59 与 24:00:00）；时区跨日。
- 奖励账本：同一10天里程碑并发请求只产生一条 `+1`；断签后新一轮10天可再次获卡；余额为0不能补签；同一日期并发补签只产生一条 `-1`；客户端不能篡改账本。
- Worker 单元测试：无 token、伪造 token、非法 MIME/超大文件、恶意 id/object key、错误 origin、分页参数、批量 id 超限。
- Worker 集成测试：PUT 签名 header 不匹配失败；complete 前对象不存在；HEAD 大小不符；重复 complete/delete 幂等；R2 删除失败可重试。
- 前端：session 恢复、401 后刷新、上传进度/重试、409 提示、短期 GET URL 过期重签、note XSS payload 不执行。

### 手工验收

- Ray、Mel 两台设备分别登录；互相可看但不能删除对方图片。
- 同一账户跨浏览器同步；刷新不会丢图。
- 未登录用户无法读取元数据或图片；第三个普通成员无法注册；跨空间 UUID 无法越权。
- 同时发起 3–10 个注册请求，最终 `space_members` 严格只有两个有效用户且角色各一个。
- 上传后 24 小时内可删，超过后按钮隐藏且 API 仍拒绝。
- R2 bucket 未公开，直接猜测 object key 无法下载。
- 生产 origin 正常，任意第三方 origin 无法通过浏览器 CORS 调用。

## 10. 运维与数据一致性

- 每日任务扫描：超过 1 小时的 `pending`、数据库无记录的孤儿对象、已软删但 R2 仍存在的对象。
- 不在日志中写 note、JWT、邮箱、预签名 URL；仅记录 request id、user id 哈希、glimmer id、状态码和耗时。
- 数据库备份不包含 R2；需要分别制定 Postgres PITR/备份和 R2 对象盘点/版本策略。
- 对上传/完成/删除接口按 user id + IP 限流；前端限制不算安全控制。
- 后续若图片需压缩/去 EXIF，增加异步处理状态和新 object key；第一版应至少提示用户原图可能包含定位元数据。

## 11. 开工前待确认项

以下信息不阻塞本计划，但实施前必须定稿：

- 正式站点 origin 与开发端口（用于 Worker/R2 CORS）。
- 登录账号是否必须是不带 `@` 的用户名；本计划默认使用邮箱作为登录账号，并允许自定义显示名。
- 邮箱确认与找回密码使用哪个 SMTP/发件域名。
- 24 小时是滚动 24 小时还是自然日结束；本计划默认滚动 24 小时。
- 是否允许覆盖当天已上传图片；本计划默认先在 24 小时内删除再上传。
- 支持的格式/大小；本计划默认 JPEG、PNG、WebP、GIF，最大 10 MiB。
- 是否保留 EXIF、是否需要压缩缩略图；第一版默认原样存储。

## 12. 存储扩展、迁移与回滚

### 12.1 新增存储供应商

新增 Supabase Storage、S3 或其他供应商时，禁止修改 UI 和 glimmer 业务状态机。实施步骤：

1. 在 `storage_provider` enum 增加 provider（已有 `supabase/r2` 可直接使用）。
2. 实现浏览器 `StoragePort` adapter；若需要可信服务端操作，再实现 Worker `ObjectStorePort` adapter。
3. 让新旧 adapter 运行同一份 contract tests：上传、存在检查、读取、删除、404、权限拒绝、重复删除和超时。
4. 在服务端配置中切换“新上传默认 provider”，不得由浏览器指定任意 provider。
5. 保持 API 返回统一 asset DTO，前端 factory 自动选择适配器。

### 12.2 R2 与 Supabase Storage 双向迁移

`glimmer_assets` 允许同一 glimmer 在迁移期间存在多份对象，但同一时刻只能有一条 `is_current = true`：

1. 为目标 provider 创建 `is_current = false` 的 asset 记录。
2. 后台以 asset id 为幂等键复制对象，支持断点续传。
3. 对比 size、content type 和 checksum，并执行一次真实读取验证。
4. 在数据库事务中把目标 asset 切为 current、旧 asset 切为非 current。
5. 保留旧对象一个回滚窗口；新 provider 异常时只切回 current asset，不回滚 glimmer 业务数据。
6. 稳定后删除旧对象并软删除旧 asset，最后再撤销旧 provider 凭据和策略。

迁移状态单独建表，避免把复制过程塞进业务表：

```sql
create table public.asset_migrations (
  id uuid primary key default gen_random_uuid(),
  source_asset_id uuid not null references public.glimmer_assets(id),
  target_asset_id uuid not null references public.glimmer_assets(id),
  status text not null default 'pending'
    check (status in ('pending', 'copying', 'verifying', 'ready', 'switched', 'failed')),
  attempts integer not null default 0,
  last_error text,
  verified_at timestamptz,
  switched_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_asset_id, target_asset_id),
  check (source_asset_id <> target_asset_id)
);
```

该表不对浏览器开放；只有迁移 Worker/运维任务使用。任务通过条件更新状态领取工作，失败递增 `attempts`，因此可重试和断点续传。

### 12.3 可扩展性硬约束

- 数据库永远不保存供应商 URL或临时签名 URL。
- UI 不导入 AWS/R2/Supabase Storage SDK。
- repository 不判断 provider 的签名或鉴权细节。
- Worker 路由不直接实例化 R2 SDK，只从 factory 获取 ObjectStorePort。
- 上传、完成、删除都使用 asset id 和幂等键，禁止只靠 object key 标识业务操作。
- 清理任务按 provider 分组调用 adapter，并分别记录失败，单一供应商故障不能阻断其他 provider。
- provider 切换采用配置/灰度，不要求重新部署前端。

## 13. 官方文档依据

- [Supabase Auth 概览](https://supabase.com/docs/guides/auth)
- [Supabase 密码登录](https://supabase.com/docs/guides/auth/passwords)
- [Supabase Before User Created Hook](https://supabase.com/docs/guides/auth/auth-hooks/before-user-created-hook)
- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Cloudflare R2 预签名 URL](https://developers.cloudflare.com/r2/api/s3/presigned-urls/)
- [Cloudflare R2 CORS](https://developers.cloudflare.com/r2/buckets/cors/)
- [Cloudflare Workers Secrets](https://developers.cloudflare.com/workers/configuration/secrets/)
- [Cloudflare Workers 环境变量](https://developers.cloudflare.com/workers/configuration/environment-variables/)
- [Cloudflare Workers 限制](https://developers.cloudflare.com/workers/platform/limits/)

## 14. 推荐的第一批提交

1. `docs: finalize backend architecture and product rules`
2. `feat(db): add glimmers assets rewards schema and RLS tests`
3. `feat(storage): add shared adapter contracts and R2 implementations`
4. `feat(worker): add provider-neutral authenticated object API`
5. `feat(web): replace glimmer localStorage with repository and StoragePort`
6. `test: add adapter contracts migration and two-user authorization e2e`

第一开发目标是交付一条安全、可恢复、可验证的主链路：**前两位成员自助注册 → 第三位成员被原子拒绝 → 每人每日上传 → 连续10天账本发卡 → 服务端事务补签扣卡 → 双方跨设备查看 → owner 在 24 小时内删除**。
