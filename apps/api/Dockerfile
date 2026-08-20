FROM node:22.18-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci
COPY apps/api apps/api
ENV DATABASE_URL=mysql://build:build@127.0.0.1:3306/after_sales
RUN npm run prisma:generate -w apps/api && npm run build -w apps/api

FROM node:22.18-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/apps/api apps/api
EXPOSE 3000
CMD ["sh", "-c", "npm run prisma:migrate -w apps/api && node apps/api/dist/src/main.js"]
