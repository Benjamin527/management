# B2B 售后运营平台

面向企业客户的售后管理与分析平台。当前核心版本包含登录、客户管理、消费分析、2026 服务分析、飞书服务记录镜像与同步状态管理。

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

当 MySQL 仅监听服务器 `127.0.0.1` 时，使用 host 网络覆盖配置：

```bash
docker compose -f docker-compose.yml -f docker-compose.server.yml up -d --build
```

如果服务器无法稳定访问 Docker Hub，可使用原生部署：安装 Node.js 22.18 到 `/opt/node-v22.18.0-linux-x64`，使用 `deploy/after-sales-api.service` 托管 API，并将 `deploy/nginx-native.conf` 安装为 Nginx 站点配置。随后执行：

```bash
npm ci
DATABASE_URL=mysql://build:build@127.0.0.1:3306/after_sales npm run prisma:generate -w apps/api
npm run build
npm run prisma:migrate -w apps/api
npm run prisma:seed -w apps/api
systemctl enable --now after-sales-api nginx
```

查看日志和停止：

```bash
docker compose logs -f api web
docker compose down
```

升级前先执行 MySQL 备份；回滚时切回上一个 Git 提交后重新构建。正式使用域名时，在 Nginx 前配置 HTTPS，并把 `COOKIE_SECURE` 改为 `true`。

飞书服务记录同步的配置、首次全量导入、每日增量策略和故障处理见 [飞书服务同步运行手册](docs/feishu-service-sync.md)。
