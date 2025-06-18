
# Base stage with Node.js and common dependencies
FROM node:18-slim AS base
RUN apt-get update -y && \
    apt-get install -y openssl curl && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /app

# Dependencies stage
FROM base AS dependencies
WORKDIR /app
COPY package.json package-lock.json* ./
COPY prisma ./prisma/
RUN npm install --frozen-lockfile

# Builder stage
FROM base AS builder
WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .

# 关键：确保 next.config.js 在构建前可用，即使它在 .dockerignore 中
# 如果 next.config.js 不在 .dockerignore 中，则此 COPY 可能不是必需的，
# 因为 "COPY . ." 已经包含了它。但为了明确，可以保留。
# COPY next.config.js ./

# 确保数据库连接字符串在构建时可用 (用于 prisma db push 和 seed)
# 如果您在 .env 文件中管理 DATABASE_URL，确保它被 COPY . . 命令包含，
# 或者在构建时通过 --build-arg 传入。
# Prisma CLI 将自动加载 .env 文件（如果存在）。

RUN npm run prisma:db:push -- --skip-generate
RUN echo "--- Contents of /app/prisma after db:push ---" && ls -l /app/prisma || echo "ls /app/prisma failed or directory empty"
RUN npm run prisma:db:seed
RUN echo "--- Contents of /app/prisma after db:seed ---" && ls -l /app/prisma || echo "ls /app/prisma failed or directory empty"

# 创建日志目录并设置权限
RUN mkdir -p /app/logs && chown node:node /app/logs

RUN npm run build

# Runner stage (final production image)
FROM base AS runner
WORKDIR /app

ENV NODE_ENV production
# 设置非 root 用户
ENV USER=node
ENV GROUP=node
RUN addgroup --system $GROUP && adduser --system --ingroup $GROUP $USER

# 从 builder 阶段复制 standalone 应用到此阶段的根目录
# 这包括了 server.js 和一个最小化的 node_modules (如果 next.config.js 中配置了 experimental.outputStandalone: true)
COPY --from=builder --chown=node:node /app/.next/standalone ./

# 复制 public 和 .next/static 目录
# standalone 服务器需要它们来提供公共文件和静态资源
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/.next/static ./.next/static

# 复制 Prisma schema 和 health-check 脚本
COPY --from=builder --chown=node:node /app/prisma ./prisma
COPY --from=builder --chown=node:node /app/health-check.sh ./health-check.sh
RUN chmod +x ./health-check.sh

# 复制 next.config.js (或 .mjs)，某些功能可能依赖它
COPY --chown=node:node next.config.js ./

USER node

EXPOSE 3000

# ✅ ***关键修改***
# 直接使用 node 运行 standalone 的输出 server.js，而不是 "npm start"
CMD ["node", "server.js"]
