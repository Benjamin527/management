# 消费数据同步运维指南

## 运行口径

- 数据源：新版 `guance_crm_v2`，只读查询国内与海外消费。
- 保留范围：以源库最新业务日为结束日，固定保留最近 28 个自然日，供 7/14 天本期与等长上一周期对比。
- 本地模型：`ConsumptionAccount` 与售后 `Customer` 完全独立，不按名称自动关联，也不创建或修改客户档案。
- 自动任务：每天 `13:00 Asia/Shanghai` 运行一次。
- 页面/API 只读取管理系统本地 MySQL 快照；源库不可用时继续展示上一份成功快照。
- 源库 `DATE` 字段必须在 SQL 中格式化为 `YYYY-MM-DD` 文本，避免服务器时区导致业务日提前一天。

## 服务器配置

以下变量只能放在服务器 `.env`，文件权限应为 `0600`，不得提交到 Git：

```dotenv
CONSUMPTION_SOURCE_DATABASE_URL=mysql://READ_ONLY_USER:READ_ONLY_PASSWORD@RDS_HOST:3306/guance_crm_v2
CONSUMPTION_SYNC_CRON="0 13 * * *"
```

配置源账号时优先使用只有 `SELECT` 权限的独立账号。连接池限制为 2 个连接，获取连接超时为 10 秒；查询异常只记录脱敏后的固定错误，不输出连接串。

## 接口与权限

- `GET /api/consumption/analysis?period=7|14&source=ALL|DOMESTIC|OVERSEAS&accountId=&product=&managerName=&anomalyStatus=&direction=`：按周期、来源、账户、产品、负责人、异常状态和变化方向读取本地分析。
- `GET /api/consumption/sync/status`：读取最近同步、运行状态和下次计划时间。
- `POST /api/consumption/sync/run`：立即同步，只有 `ADMIN` 和 `MANAGER` 可执行。

同一时刻只允许一个同步任务。API 进程启动时会把遗留的 `RUNNING` 记录标记为失败，防止页面长期显示同步中。

## 首次部署

1. 只读检查旧 `ConsumptionDaily` 行数。只有结果为 0 时才允许应用解耦迁移。
2. 创建带时间戳的应用归档和管理系统 MySQL 全库备份。
3. 部署代码时排除 `.env`、`node_modules`、`dist`、`.git` 和本地检查产物。
4. 写入服务器配置并确认 `.env` 权限为 `0600`。
5. 使用 Node 22 运行 Prisma Client 生成、迁移、API/Web 构建和服务重启。
6. 通过本机回环 API 触发首次同步，轮询到 `SUCCESS`。
7. 分别对账国内、海外的汇总行数、账户数和四位小数金额，并确认 `Customer` 数量未变化。

Prisma workspace 命令需要显式获得根目录 `DATABASE_URL`。服务器默认 shell 若仍是 Node 18，应将 `/opt/node-v22.18.0-linux-x64/bin` 放到本次部署进程的 `PATH` 前部。

## 日常检查

```bash
systemctl is-active after-sales-api
journalctl -u after-sales-api -n 100 --no-pager
curl -f http://127.0.0.1/api/health
```

在消费页面确认：

- 数据截至日与最近成功同步窗口一致。
- “全部 / 国内 / 海外”金额分别与本地快照一致。
- 7/14 天分析都能与等长上一周期比较，并区分真实零金额与源汇总缺失。
- 同步完成后页面自动刷新；失败时旧分析仍可读取。

## 故障处理

### 同步失败

先查看 `GET /api/consumption/sync/status` 的脱敏摘要和服务日志。不要清空本地消费表；修复源连接或数据问题后重新执行手动同步。同步在源数据全部读取成功后才开启本地事务，因此源查询失败不会覆盖上一份快照。

### 日期整体提前一天

检查源 SQL 是否仍使用 `DATE_FORMAT(..., '%Y-%m-%d')` 返回文本。不要通过给结果加一天来补偿，因为这会把运行环境时区耦合进业务口径。

### 回滚

1. 停止 `after-sales-api`。
2. 恢复部署前的应用归档到独立临时目录，核对后再替换应用目录。
3. 使用部署前的 MySQL dump 恢复管理系统数据库。
4. 恢复原 `.env`，重新安装依赖并构建。
5. 启动服务，检查健康接口、登录和客户档案数量。

应用归档和数据库备份位于 `/opt/backups/`，文件名带部署时间戳。恢复是破坏性操作，执行前必须再次备份当前现场并明确目标文件。

## 2026-08-20 首次上线记录

- 同步窗口：`2026-08-06` 至 `2026-08-19`。
- 国内：557 个源账户、14,753 条本地日产品汇总、金额 `4,722,301.0800 CNY`。
- 海外：50 个源账户、3,264 条本地日产品汇总、金额 `22,296.4400 CNY`。
- 合计金额：`4,744,597.5200 CNY`。
- 国内和海外的源库/本地行数、账户数、金额均一致。
- 售后 `Customer` 在部署前后均为 96 条。
- 国内覆盖 11 天；海外覆盖 9 天。页面按来源明确展示缺失日期，不把缺失日伪装成零消费。
