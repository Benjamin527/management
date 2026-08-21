# 飞书售后交接档案同步运行手册

售后交接表由飞书维护，系统使用现有飞书企业自建应用的应用身份读取全表，并在 MySQL 中建立只读镜像。客户中心只展示镜像数据，不向飞书回写。

## 数据范围与同步策略

- 数据源：飞书多维表格完整数据表，不依赖 URL 中的视图筛选条件。
- 首次上线：执行一次完整同步，读取全部分页记录。
- 日常运行：默认每天北京时间 `02:30` 完整校准一次。
- 幂等键：飞书 `record_id`；重复同步不会生成重复档案。
- 删除处理：完整拉取成功后，源表中已消失的记录才会在本地软删除；分页或解析失败不会执行删除比对。
- 并发控制：数据库租约、心跳与 fencing token 保证多实例环境同一时刻只有一个有效同步任务。
- 客户关联：唯一规范化名称可自动关联；无法唯一匹配的档案进入“待人工关联”。人工关联优先，后续同步不会覆盖。

## 服务器环境变量

交接同步复用 `FEISHU_APP_ID` 和 `FEISHU_APP_SECRET`，另行配置交接表位置与加密密钥：

```dotenv
FEISHU_HANDOFF_BASE_APP_TOKEN=replace_on_server
FEISHU_HANDOFF_TABLE_ID=tbl_replace_on_server
FEISHU_HANDOFF_BASE_URL=https://your-tenant.feishu.cn/wiki/replace
FEISHU_HANDOFF_SYNC_CRON=30 2 * * *
HANDOFF_SECRET_ENCRYPTION_KEY=64-character-hex-key
HANDOFF_SECRET_PREVIOUS_KEYS=
```

要求：

- `HANDOFF_SECRET_ENCRYPTION_KEY` 必须是 32 字节随机值的 64 位十六进制编码，可在服务器执行 `openssl rand -hex 32` 生成。不要把输出写入日志或 Git。
- `HANDOFF_SECRET_PREVIOUS_KEYS` 仅用于密钥轮换后的历史数据解密，多个旧密钥用英文逗号分隔。
- 环境变量缺失时交接同步会禁用；配置不完整或格式错误时 API 会拒绝启动，避免以不安全配置运行。
- `.env` 权限建议设为仅服务账号可读。

## 部署与首次同步

升级前先备份 MySQL，再执行：

```bash
npm ci
npm run prisma:generate -w apps/api
npm run prisma:migrate -w apps/api
npm run build
systemctl restart after-sales-api
```

登录系统后，管理员或经理可在“客户中心”点击“立即同步”。也可以在已登录会话中调用：

```text
POST /api/admin/handoff-sync/run
GET  /api/admin/handoff-sync/status
```

首次同步完成后核对：

1. 状态接口的最后一次运行是 `SUCCESS`，读取数与飞书完整表记录数一致。
2. 客户中心顶部“已完成交接 / 待补交接 / 待人工关联”合计关系正确。
3. 抽查客户详情中的部署方式、站点、功能使用、日志/APM/RUM、历史问题和联系人。
4. 未匹配记录由管理员或经理人工关联；关联后刷新客户列表确认归属。

## 权限与敏感字段

- 普通用户可以查看已关联客户的非敏感交接档案。
- `ADMIN`、`MANAGER` 可以启动同步、查看同步状态和处理待匹配档案。
- 部署检查清单的原文采用 AES-256-GCM 加密单独存储，普通列表和客户详情接口只返回脱敏提示。
- 只有 `ADMIN` 能主动查看原文；每次查看都记录用户、客户快照、记录 ID、字段、时间与请求 IP，并返回 `Cache-Control: no-store`。

## 日常检查与故障处理

建议每天检查最后成功时间，至少在发布后的首个 02:30 定时任务后复核一次。

- 鉴权或权限失败：确认飞书应用仍可访问目标多维表格，且应用凭据未过期；不要把凭据粘贴到工单或日志。
- 同步失败：保留上次成功镜像，不会清空客户档案。修复原因后点击“立即同步”执行完整校准。
- 同步长时间运行：检查飞书网络、MySQL 锁等待和 API 日志。租约会持续续期；不要直接修改租约表。
- 待匹配数量增加：优先检查客户名称是否存在空格、别名或重复项，再由管理员人工确认。
- 加密密钥轮换：把旧主密钥加入 `HANDOFF_SECRET_PREVIOUS_KEYS`，配置新主密钥并重启；确认历史字段可读取后再制定旧密钥退役计划。

真实 MySQL 的事务回滚与重建回归测试方法见 [交接同步 MySQL 测试说明](feishu-handoff-sync-testing.md)。
