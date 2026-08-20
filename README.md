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

前端独立预览可使用演示数据：

```bash
VITE_DEMO_MODE=true npm run dev -w apps/web
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

## 服务器部署

服务器需要安装 Docker 与 Compose，并确保 MySQL 已创建 `after_sales` 数据库及专用账号。MySQL 可以监听 Docker 网桥，但不要向公网开放 `3306`。

```bash
cp .env.example .env
# 编辑 .env，设置真实数据库账号、JWT_SECRET 和管理员初始密码
docker compose config
docker compose up -d --build
docker compose ps
curl http://127.0.0.1/api/health
docker compose exec api npm run prisma:seed -w apps/api
```

查看日志和停止：

```bash
docker compose logs -f api web
docker compose down
```

升级前先执行 MySQL 备份；回滚时切回上一个 Git 提交后重新构建。正式使用域名时，在 Nginx 前配置 HTTPS，并把 `COOKIE_SECURE` 改为 `true`。
