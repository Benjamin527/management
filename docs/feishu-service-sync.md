# 飞书服务同步运行手册

## 数据边界

- 飞书多维表格是服务记录的唯一事实源，系统只做单向只读镜像，不回写飞书。
- 系统只同步和分析北京时间 2026 年的记录。
- 首次执行“同步 2026 全量”；后续默认每天 02:00 同步最近 7 天，并从最近一次成功时间向前补偿 1 天。
- 同步查询直接针对数据表并携带“开始日期”条件，不依赖飞书视图筛选，因此能覆盖完整数据表中的 2026 记录。
- 客户按名称自动关联；缺失客户名的记录仍参与总量统计，但不会创建“未填写客户”。

## 飞书应用准备

1. 在飞书开放平台创建企业自建应用，为应用开通多维表格记录只读权限。
2. 在目标多维表格中添加该应用，并授予读取数据表和记录的权限。
3. 从知识库链接确认 Base app token 和 table id。页面 URL 中的 `view` 参数不需要写入配置。
4. 将凭据只写入服务器 `/opt/after-sales-management/.env`，不要写入前端变量、源码、日志或 Git。

服务器配置项：

```dotenv
FEISHU_APP_ID=cli_replace_on_server
FEISHU_APP_SECRET=replace_on_server
FEISHU_BASE_APP_TOKEN=replace_on_server
FEISHU_SERVICE_TABLE_ID=tbl_replace_on_server
FEISHU_SYNC_YEAR=2026
FEISHU_SYNC_CRON=0 2 * * *
FEISHU_SERVICE_BASE_URL=https://your-tenant.feishu.cn/wiki/replace
```

只要 `FEISHU_APP_ID` 留空，同步功能就会关闭；填写后其余飞书配置必须完整。Cron 使用五段格式，时区固定为 `Asia/Shanghai`。

## 首次上线

升级前先备份 MySQL，然后在服务器项目目录执行：

```bash
npm ci
npm run prisma:generate --workspace=api
npm run prisma:migrate --workspace=api
npm run build
systemctl restart after-sales-api
curl --fail http://127.0.0.1:3000/api/health
```

管理员或经理登录 Web 系统，在“服务分析”页面点击“同步 2026 全量”。接口立即返回已受理，实际进度显示在页面顶部同步状态栏中。首次同步完成后核对：

- 读取数、创建数、失败数是否合理；
- 数据截止日期是否接近飞书最新记录；
- 客户总数、服务总量以及若干已知客户记录是否与飞书一致；
- 数据质量区的负责人、满意度、工单号覆盖率是否符合源表填写情况。

## 日常运行

- 每日任务由 API 进程内部定时器触发；同一时间只允许一个同步任务运行。
- 最近 7 天内发生的状态修改会被覆盖更新；超出窗口的历史记录保持镜像值。
- “服务记录”支持客户、状态、来源、问题类型、工程师和日期筛选，所有日期都会被强制限制在 2026 年内。
- 同步运行结果保存在 `ServiceSyncRun`，失败摘要会脱敏；飞书密钥和 tenant token 不会返回给浏览器。

## 故障处理

1. 先查看 Web 状态栏的最近失败时间与摘要，再检查 `journalctl -u after-sales-api`。
2. 401/权限错误：核对应用状态、Base 授权、app token 与 table id，避免把 `view` 参数当作 table id。
3. 429/临时网络错误：客户端会自动退避重试；仍失败时等待飞书限流恢复后手动执行“最近数据”。
4. 字段解析失败：失败记录不会阻断其他记录；根据运行记录中的 record id 检查源表字段形态。
5. API 重启时遗留的运行中任务会自动标记失败，可重新触发。

## 密钥轮换

如果凭据曾通过聊天、终端输出或其他非密钥系统传递，应在上线验证后立即到飞书开放平台轮换 App Secret，更新服务器 `.env`，重启 API，并执行一次“最近数据”同步确认新凭据有效。不要把真实值复制到工单、截图或提交历史中。
