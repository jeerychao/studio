# Base image with Node.js
FROM node:18-slim AS base

# Install required dependencies
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
# 保留开发依赖以供构建使用 (例如 TailwindCSS, Autoprefixer, PostCSS, Prisma CLI dev dep)
RUN npm install --frozen-lockfile

# Builder stage
FROM base AS builder
WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .

# Generate Prisma client and prepare database
# ENV DATABASE_URL="file:/app/prisma/dev.db" # 已移至 production.env, Dockerfile中可以不重复设置，除非构建时明确需要
# RUN npx prisma generate # postinstall脚本通常会处理，但可以保留以确保
RUN npm run prisma:db:push -- --skip-generate
RUN echo "--- Contents of /app/prisma after db:push ---" && ls -l /app/prisma || echo "ls /app/prisma failed in builder after push"
RUN npm run prisma:db:seed
RUN echo "--- Contents of /app/prisma after db:seed ---" && ls -l /app/prisma || echo "ls /app/prisma failed in builder after seed"
RUN npm run build

# Runner stage
FROM base AS runner
WORKDIR /app

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Setup directory structure and permissions for standalone output
# /app/prisma 目录将在下面通过 COPY --chown 创建
RUN mkdir -p ./.next/cache && chown -R nextjs:nodejs ./.next

# Copy necessary files from builder stage
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma # 复制准备好的prisma目录
COPY --from=builder --chown=nextjs:nodejs /app/next.config.js ./ # standalone模式需要
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./ # standalone模式可能需要

USER nextjs

# ENV NODE_ENV="production" # 将通过 env_file (production.env) 设置
# ENV PORT="3000" # 将通过 env_file (production.env) 设置
# ENV HOST="0.0.0.0" # 将通过 env_file (production.env) 设置
# ENV HOSTNAME="0.0.0.0" # 将通过 env_file (production.env) 设置
# ENV NEXT_PUBLIC_BASE_URL="http://17.100.100.253:3010" # 将通过 env_file (production.env) 设置
# ENV NEXTAUTH_URL="http://17.100.100.253:3010" # 将通过 env_file (production.env) 设置
# ENV DATABASE_URL="file:/app/prisma/dev.db" # 将通过 env_file (production.env) 设置
# ENV NEXTAUTH_SECRET="your-secret-key" # 将通过 env_file (production.env) 设置
# ENV NEXT_PUBLIC_VERCEL_URL="17.100.100.253:3010" # 将通过 env_file (production.env) 设置
# ENV NODE_OPTIONS="--max-old-space-size=4096" # 将通过 env_file (production.env) 设置
# ENV DEBUG="prisma:*,next:*" # 将通过 env_file (production.env) 设置


# 添加健康检查脚本
COPY --chown=nextjs:nodejs health-check.sh ./
RUN chmod +x health-check.sh

EXPOSE 3000 # 端口应与 PORT 环境变量匹配

CMD ["node", "server.js"]