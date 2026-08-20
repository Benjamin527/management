# B2B 售后运营平台

面向企业客户的售后管理与分析平台。首个核心版本包含登录、客户管理、服务问题闭环和售后总览。

## 项目结构

- `apps/web`：Vue 3 + Vite 前端
- `apps/api`：NestJS API
- `docs/superpowers/specs`：产品和技术设计
- `docs/superpowers/plans`：分阶段实施计划

## 本地启动

项目应用生成后执行：

```bash
npm install
cp .env.example .env
npx prisma migrate dev --schema apps/api/prisma/schema.prisma
npx prisma db seed --schema apps/api/prisma/schema.prisma
npm run dev -w apps/api
npm run dev -w apps/web
```

## 验证

```bash
npm run lint
npm test
npm run build
```

## 安全约束

- `.env` 和任何真实凭据不得提交到 Git。
- MySQL 仅允许服务器本机或容器内部网络访问，不开放公网 `3306` 端口。
- 正式环境通过 Nginx 暴露 `80/443`，并启用 HTTPS。

详细部署步骤会随容器配置一起补充。
