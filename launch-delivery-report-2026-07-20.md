# 上线交付报告（2026-07-20）

## 交付结论

本轮 Memories、多媒体存储、微光双时间、登录级时区选择、双账号互显和上线数据清理已完成。Supabase 远端迁移与本地一致至 `202607200005`，远端 schema lint 无警告或错误。

当前本地验收入口：`http://127.0.0.1:8787/`。

# 待完成

添加礼物

VERCEL更新部署

**祝你们幸福**

## 最终功能状态

- 登录页是唯一时区选择入口，两个按钮只显示晨昏图标与实时 `HH:MM`。
- 支持北京与美国西海岸时区；选择立即持久化，下次登录默认上次选择并可重选。
- 微光与 Memory 上传弹窗不再重复显示时区选择，上传记录自动复用登录选择。
- `get_glimmer_dashboard` 与 `begin_glimmer_upload` 使用同一登录时区计算 `local_today` 和微光解锁。
- `is_glimmer_accounted` 使用记录保存的登录时区判断当天上传，覆盖中美日期不同的跨午夜窗口。
- 后端硬性拒绝 `2026-07-20` 之前的微光日期；前端日历从 `07/20` 开始。
- 微光和 Memory 展示仍同时显示北京/西海岸时间，并高亮上传时选择的时区。
- Memories 支持图片、音频、自定义播放器、正文、空格标签、历史热门标签和上传者角色。
- 展示态标签改为高对比紫色 chip，已在真实页面复核可读性。
- 九张正式 Mel likes 图片保留在私有 Supabase Storage，并维持原顺序和文案。

## 双账号实测证据

使用真实 Ray/Mel 会话完成：

- Ray、Mel 分别上传微光，双方均看到两条记录、两个角色、双时间和各自高亮。
- Gallery 双方均看到两张图片及对应双时间；跨账号删除被服务端拒绝。
- Ray 上传图片 Memory，Mel 上传 WAV 音频 Memory；双方均能读取对方记录和短期签名媒体。
- 音频播放器实际进入播放状态，按钮由 Play 切换为 Pause。
- Mel 上传时看到 Ray 的历史标签候选并点击加入，热门标签加载与选择通过。
- Mel likes 新增图片在另一个账号可见，随后由上传者删除。
- Ray/Mel 分别通过 UI 删除自己的微光和 Memory；非所有者不显示删除入口。
- Mel-only 开场信件、五束光、票根、Gift 导航和权限通过；Ray 不显示 Gift 导航。

API 烟测结果：4 次微光互读、4 次签名图片互读、2 个登录时区 Dashboard、2 个时区高亮、2 个心情、1 次跨账号删除拒绝、1 次 7/20 前日期拒绝、Mel 礼物读取成功且 Ray 被拒绝。测试数据均已回滚并硬删除残留。

## 上线数据清理

清理前：Ray/Mel 两名成员、Mel 槽已占用、2 条早于 7/20 的微光、10 条 Mel likes。

清理后只读复核：

- 成员角色：仅 `ray`。
- 注册槽：Ray=`claimed`，Mel=`open` 且 `user_id=null`。
- Mel Auth 登录返回 `Invalid login credentials`；注册界面重新可用。
- 微光总数：0；早于 7/20：0。
- Mel 账号拥有的微光、Memory、Mel likes：均为 0。
- 九张正式种子 Mel likes 已转交 Ray，数量为 9。
- 删除私有对象 4 个，清理孤立标签 5 个。
- 唯一测试前缀残留：微光 0、Memory 0、Mel likes 0、测试资产 0。

## 测试与质量门禁

- `npm test`：41/41 通过。
- JavaScript 语法检查：通过。
- `git diff --check`：通过。
- Supabase 远端 schema lint：0 条结果，无错误或警告。
- 远端迁移历史：本地/远端一致至 `202607200005`。
- 跨午夜数据库验证：同一 `2030-07-21 02:00Z` 瞬间按西海岸时间归属 7/20 时可见，改按北京时间归属下一日时正确拒绝，两项布尔结果均为 `true`。
- 视觉实测页面：Home、微光收集、Gallery、Playlist、Memories、Gift、登录/注册、微光上传弹窗、Memory 上传弹窗。
- Memories 标签颜色修复后再次截图检查，正文、角色、时间和标签均具备清晰对比度。

## 已部署迁移

- `202607200001_memories_multimedia.sql`
- `202607200002_glimmer_dual_time.sql`
- `202607200003_glimmer_launch_boundary.sql`
- `202607200004_login_timezone_unlock.sql`
- `202607200005_glimmer_accounted_timezone.sql`

## 已知保留项

Spotify playlist ID 当前在嵌入页返回 `Page not found`。按本次确认保持页面不动，未替换链接或布局；上线后如需恢复播放，需要提供一个公开有效的 Spotify playlist URL。

本报告不包含前端生产域名发布，因为本次工作区未提供具体托管目标；当前 localhost 服务保持运行，供最终人工验收。
