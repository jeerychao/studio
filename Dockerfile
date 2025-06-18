
# Stage 1: Base image with common dependencies
FROM node:18-slim AS base
WORKDIR /app
RUN apt-get update -y && \
    apt-get install -y openssl curl && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*
RUN corepack enable

# Stage 2: Install dependencies
FROM base AS dependencies
WORKDIR /app
COPY package.json package-lock.json* ./
COPY prisma ./prisma/
RUN npm install --frozen-lockfile

# Stage 3: Builder
FROM base AS builder
WORKDIR /app

# 关键：接收ENCRYPTION_KEY作为构建参数
ARG ENCRYPTION_KEY_ARG
# 将其作为环境变量暴露给构建过程 (特别是prisma db seed)
ENV ENCRYPTION_KEY=${ENCRYPTION_KEY_ARG}

COPY --from=dependencies /app/node_modules ./node_modules
COPY . .

RUN npx prisma generate
RUN npm run prisma:db:push -- --skip-generate
RUN echo "--- Contents of /app/prisma after db:push ---" && ls -l /app/prisma || echo "ls /app/prisma failed"
RUN npm run prisma:db:seed
RUN echo "--- Contents of /app/prisma after db:seed ---" && ls -l /app/prisma || echo "ls /app/prisma failed"

RUN mkdir -p /app/logs && chown node:node /app/logs
RUN npm run build

# Stage 4: Runner (Production)
FROM base AS runner
WORKDIR /app

ENV NODE_ENV production
# ENCRYPTION_KEY 将在运行时通过 docker-compose 的 env_file (production.env) 设置

# 复制生产依赖
COPY --from=dependencies --chown=node:node /app/package.json ./
COPY --from=dependencies --chown=node:node /app/node_modules ./node_modules

# 复制 standalone 服务器及其所需的静态资源
# 将 .next/standalone 的内容复制到 /app (当前 WORKDIR)
COPY --from=builder --chown=node:node /app/.next/standalone ./
# 将 .next/static 复制到 /app/.next/static
COPY --from=builder --chown=node:node /app/.next/static ./.next/static

# 复制 public 静态资源
COPY --from=builder --chown=node:node /app/public ./public

# 复制 Prisma schema (Prisma Client 运行时需要) 和健康检查脚本
COPY --from=builder --chown=node:node /app/prisma ./prisma
COPY --from=builder --chown=node:node /app/health-check.sh ./health-check.sh
RUN chmod +x ./health-check.sh

# 复制 next.config.js, standalone 服务器需要它
COPY --chown=node:node next.config.js ./

# 创建运行时日志目录
RUN mkdir -p /app/logs && chown node:node /app/logs

USER node

EXPOSE 3000

# standalone 的输出 server.js 将位于 WORKDIR (/app) 的根目录
# 因为我们已将 .next/standalone 的内容复制到 ./
CMD ["node", "server.js"]
