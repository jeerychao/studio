
# Stage 1: Base image with OS dependencies
FROM node:20-alpine AS base
WORKDIR /app

# 可选：如果默认源下载缓慢或出错，可以尝试更换 Alpine 软件源
# 找到一个适合您地区的镜像: https://alpinelinux.org/mirrors/
# 例如，使用清华大学的源 (移除或添加 '#' 来启用/禁用):
# RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.tuna.tsinghua.edu.cn/g' /etc/apk/repositories

RUN apk add --no-cache openssl dumb-init python3 make g++

# Stage 2: Install dependencies using npm
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
# 'npm ci' 严格按照 package-lock.json 安装，适合 CI/CD。
# '--include=dev' 确保 devDependencies 也被安装，因为 Prisma 工具、TypeScript 等构建时需要。
RUN npm ci --include=dev

# Stage 3: Build the Next.js application
FROM deps AS builder
WORKDIR /app
# COPY 整个项目上下文（除了 .dockerignore 中排除的）
COPY . .
# DATABASE_URL 指向最终镜像中数据库文件的位置
ENV DATABASE_URL="file:/app/prisma/dev.db"
RUN npx prisma generate
RUN npm run build

# Stage 4: Prisma - create and seed the database
FROM base AS prisma_seeding
WORKDIR /app

# 从 deps 阶段复制 node_modules，确保 ts-node, prisma client 等可用
COPY --from=deps /app/node_modules ./node_modules
# 复制运行 seed 所需的文件
COPY package.json ./
COPY tsconfig.json ./tsconfig.json
COPY prisma ./prisma
# seed.ts 依赖于 src/lib 和 src/types 下的文件
COPY src/lib ./src/lib
COPY src/types ./src/types

# DATABASE_URL 指向在此阶段创建的数据库文件
ENV DATABASE_URL="file:./prisma/dev.db"
# 确保 Prisma Client 在此阶段的上下文中生成
RUN npx prisma generate
RUN npx prisma db push --skip-generate
# npm run prisma:db:seed 执行 package.json 中定义的种子脚本
RUN npm run prisma:db:seed

# Stage 5: Production image - final runner stage
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
# 运行应用时使用的 DATABASE_URL
ENV DATABASE_URL="file:/app/prisma/dev.db"

# 创建一个非 root 用户来运行应用，增强安全性
RUN addgroup -S nextjs && adduser -S nextjs -G nextjs
# USER nextjs # 在复制文件之后切换用户

# 从 builder 和 prisma_seeding 阶段复制必要的构建产物和数据
# 确保 --chown 对 nextjs 用户生效，所以在 USER nextjs 之前复制，或在之后调整权限
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json
# 从 deps 阶段复制生产环境所需的 node_modules (如果 builder 阶段有修剪，则从 builder 复制)
# 这里我们从 deps 复制，因为它包含了所有依赖。如果 builder 阶段执行了 npm prune --production，则应从 builder 复制。
# 为简单起见，且因为我们用了 npm ci，这里从 deps 复制是安全的。
COPY --from=deps /app/node_modules ./node_modules
COPY --from=prisma_seeding /app/prisma ./prisma
# 确保 Prisma Client 引擎文件也包含在内（通常在 node_modules/.prisma/client）
# COPY --from=builder /app/node_modules/.prisma/client ./node_modules/.prisma/client # 如果需要显式复制

# 设置文件权限并切换用户
RUN chown -R nextjs:nextjs /app
USER nextjs

EXPOSE 3000
CMD ["dumb-init", "npm", "start"]
