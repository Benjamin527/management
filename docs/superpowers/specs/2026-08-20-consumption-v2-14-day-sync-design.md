# 新库最近 14 天消费分析设计

## 1. 目标与范围

第一版只读取雪润新版数据库 `guance_crm_v2`，展示该库当前保留的最近 14 个自然日消费数据，用真实数据验证消费分析页面的业务价值。

消费账户与售后客户档案是两个独立数据域。本功能不得读取、创建、修改或关联现有 `Customer` 记录，也不根据名称做隐式匹配。后续客户接口接入与跨域映射另行设计。

第一版同时支持国内和海外消费：总览默认合计展示，并提供“全部 / 国内 / 海外”切换。不读取旧库，不使用 CSM 指标补数；源库缺失日期必须按缺失展示，不能伪造为完整数据。

## 2. 方案选择

采用“独立消费账户 + 本地消费日汇总”的方案。API 服务使用独立只读数据源连接新版 RDS，定时将汇总结果复制到售后系统自己的 MySQL；浏览器和消费分析 API 只查询本地 MySQL，不在用户请求链路中访问 RDS。

不采用以下方案：

- 不复用售后 `Customer` 外键，避免污染客户档案并产生错误的同名匹配。
- 不在页面请求时实时查询 RDS，避免 RDS 延迟或超时直接影响页面可用性。
- 不直接查询 CSM 指标空间，因为第一版需要验证新版数据库本身的效果和缺口。

## 3. 数据来源与业务口径

### 3.1 国内

来源表为 `daily_usage_details`：

- 消费账户外部标识：`customer_id`
- 展示名称：`customer_name`
- 日期：`consume_time_of_day`
- 产品：`product_detail`，空值归为“未分类”
- 金额：`origin_amount`
- 负责人快照：`tam_real_name`

按“日期 + customer_id + product_detail”聚合 `SUM(origin_amount)`。

### 3.2 海外

来源表为 `guance_abroad_consumption_detail`，并用 `signed_abroad_customer.gc_account` 补充公司名称：

- 消费账户外部标识：`gc_account`
- 展示名称：优先使用 `company_name`，缺失时使用 `gc_account`
- 日期：`consume_time_of_day`
- 产品：`product_detail`，空值归为“未分类”
- 金额：`origin_amount`

按“日期 + gc_account + product_detail”聚合 `SUM(origin_amount)`。

国内和海外金额都按人民币展示。原始 `consumption` 是不同产品的计量值，单位不可直接相加，第一版不作为总览金额。

### 3.3 时间窗口

每次同步先获取国内和海外数据中的最大业务日期，将两者最大值作为 `dataThrough`，窗口为 `[dataThrough - 13 天, dataThrough]`，共 14 个自然日。这样页面不会因同步任务在中午运行而把当天尚未生成的数据误判为零消费。

## 4. 本地数据模型

新增枚举 `ConsumptionSource`：`DOMESTIC`、`OVERSEAS`。

新增 `ConsumptionAccount`：

- `id`
- `source`
- `externalId`
- `displayName`
- `managerName`
- `createdAt`、`updatedAt`
- 唯一键：`source + externalId`

调整 `ConsumptionDaily`，移除对售后 `Customer` 的关系，改为：

- `accountId`：关联 `ConsumptionAccount`
- `date`
- `product`
- `amount`
- `unit`，第一版固定为 `CNY`
- `createdAt`、`updatedAt`
- 唯一键：`accountId + date + product`
- 索引：`date + accountId`、`date + product`

新增 `ConsumptionSyncRun`，保存同步状态、窗口、读取数、账户数、汇总行数、失败摘要、开始和完成时间。错误摘要必须脱敏，不得包含数据库地址、用户名、密码或完整连接串。

新增 `ConsumptionSourceDay`，按“来源 + 日期”记录该来源当天是否真实产出汇总、源记录数和金额。国内覆盖日期读取 `daily_consumption_report`，海外覆盖日期读取 `guance_abroad_consumption`。页面使用它区分“汇总存在但金额为零”和“该来源当天没有产出数据”。

迁移前必须检查线上现有 `ConsumptionDaily` 行数。若不为零则停止迁移并人工确认；不得静默删除已有数据。

## 5. 同步流程

API 服务新增独立的消费源连接配置：

- `CONSUMPTION_SYNC_ENABLED`
- `CONSUMPTION_SOURCE_DATABASE_URL`
- `CONSUMPTION_SYNC_CRON`，默认 `0 13 * * *`

连接只用于参数化 `SELECT`。生产环境优先使用 RDS 只读账号；无独立账号时也必须让同步组件只暴露查询方法，不向源库执行 DDL 或 DML。

同步步骤：

1. 创建 `RUNNING` 同步记录并获取 14 天窗口。
2. 分别查询国内、海外汇总及来源日期覆盖，验证日期、外部标识和金额。
3. 在本地 MySQL 事务中 upsert 消费账户、日汇总和来源日期覆盖。
4. 删除本地窗口内本次源结果已经不存在的旧汇总，避免源库重算后留下脏数据。
5. 将窗口外的本地消费日汇总清理掉，使第一版始终只保留 14 天。
6. 同步记录更新为 `SUCCESS`；任何异常更新为 `FAILED`，保留上一份成功数据供页面继续查询。

系统每天 `13:00 Asia/Shanghai` 自动同步，位于新版消费任务 `12:20` 之后。管理员和经理可在页面手动触发同步；重复运行返回明确冲突，不并发访问源库。

## 6. API 设计

- `GET /api/consumption/analysis?source=ALL|DOMESTIC|OVERSEAS&accountId=&product=`
- `GET /api/consumption/sync/status`
- `POST /api/consumption/sync/run`

分析接口固定返回 14 天，不接受 7/30/60 天参数。响应包括：

- `range`、`dataThrough`、`lastSyncedAt`
- 14 天总金额和活跃账户数
- 最近 7 天与此前 7 天的金额及变化率
- 14 天逐日趋势，缺失日期补为零，同时返回逐来源 `coverage` 和当前筛选下的 `availableDates`、`missingDates`，页面可区分“零消费”和“源数据缺失”
- 产品分布
- 消费账户排行
- 异常账户队列
- 来源、账户和产品筛选项

异常规则基于同一 14 天窗口：最近 7 天与此前 7 天比较，下降超过 30% 标记 `DROP`，增长超过 50% 标记 `RISE`；此前 7 天有金额但最近 7 天为零时标记 `SILENT`。源日期缺失时，页面显示数据缺口提示，异常结果标记为低置信度，避免把采集失败误判为客户停用。

## 7. 页面设计

保留现有消费分析页面的视觉结构并改用真实数据：

- 标题显示“最近 14 天消费脉搏”。
- 原 7/30/60 天选择器改为“全部 / 国内 / 海外”来源切换。
- 客户筛选改为独立消费账户筛选，不再请求售后客户列表。
- KPI 显示 14 天总金额、最近 7 天环比、活跃账户、异常账户。
- 趋势图固定 14 个日期，并对源数据缺失日期使用不同样式。
- 产品分布默认显示金额最高的产品，筛选列表保留全部产品。
- 排行和异常卡片显示来源标签，避免国内与海外同名账户混淆。
- 顶部显示最新数据日期、上次同步时间、同步状态和可用的“立即同步”按钮。

所有按钮必须有真实行为；无权限时按钮禁用并说明原因。同步失败时保留已有分析结果，并在状态区域显示可重试的脱敏错误。

## 8. 安全、性能与故障处理

- 源数据库连接串只保存在服务器 `.env`，不得进入前端、Git、API 响应或日志。
- RDS 查询限定 14 天并使用已有日期索引；不读取逐行明细到浏览器。
- 页面查询只访问本地汇总表。
- RDS 超时采用有限重试；同步失败不清空上一版成功数据。
- 数据日期不连续时返回明确的完整度信息。
- 国内外账户唯一键包含来源，避免同名或同 ID 冲突。

## 9. 测试与验收

测试驱动覆盖：

- 14 天窗口以最新业务日期为结束日。
- 国内和海外 SQL 映射、聚合与名称兜底。
- 消费账户不创建或关联任何售后 `Customer`。
- 全部/国内/海外筛选和国内外同名账户隔离。
- 最近 7 天与此前 7 天变化率及异常规则。
- 缺失日期与真实零金额可区分。
- 同步事务、重入冲突、失败保留旧数据和错误脱敏。
- 页面来源切换、账户/产品筛选、手动同步、加载/失败/空数据状态。

线上验收标准：

- 新库最近 14 天数据成功同步到本地 MySQL。
- 国内、海外及合计金额与新库只读聚合一致。
- 售后 `Customer` 表行数和内容不因消费同步发生变化。
- 分析、排行、异常和同步状态接口返回成功。
- 定时任务配置为每天 13:00，手动同步可用且不会并发执行。
