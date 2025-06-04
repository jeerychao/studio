
# Dockerfile for Next.js, Prisma, and SQLite Application

# ---- Base Stage ----
# Use a Node.js Alpine image as the base for a smaller footprint
FROM node:20-alpine AS base
WORKDIR /app

# 可选：如果默认源下载缓慢或出错，可以尝试更换 Alpine 软件源
# 找到一个适合您地区的镜像: https://alpinelinux.org/mirrors/
# 例如，使用清华大学的源 (移除或添加 '#' 来启用/禁用):
# RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.tuna.tsinghua.edu.cn/g' /etc/apk/repositories

# Install base dependencies including those needed for Prisma (openssl) and native extensions (python, make, g++)
# dumb-init is a simple process manager
RUN apk add --no-cache openssl dumb-init python3 make g++

# Enable corepack to use pnpm/yarn if specified in package.json (though we'll use npm here)
RUN corepack enable

# ---- Dependencies Stage ----
# Install all dependencies (including devDependencies for build tools like Prisma CLI)
FROM base AS deps
WORKDIR /app

# Copy package.json and package-lock.json (or yarn.lock, pnpm-lock.yaml)
COPY package.json package-lock.json* ./

# Copy Prisma schema and migrations early for 'prisma generate' during 'npm ci'
COPY prisma ./prisma

# Use 'npm ci' for cleaner, more reliable installs in CI/Docker environments.
# '--include=dev' ensures devDependencies are also installed, needed for Prisma CLI, ts-node, etc.
RUN npm ci --include=dev

# ---- Builder Stage ----
# Build the Next.js application
FROM base AS builder
WORKDIR /app

# Copy dependencies from the 'deps' stage
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json ./package.json
COPY --from=deps /app/prisma ./prisma

# Copy the rest of the application code
COPY . .

# Generate Prisma Client (should already be done by postinstall, but good to have explicitly if needed or postinstall is removed)
# RUN npx prisma generate # This line is often redundant if 'prisma generate' is in postinstall

# Build the Next.js application
RUN npm run build

# Remove devDependencies after build to reduce node_modules size for the runner stage
RUN npm prune --production

# ---- Prisma Seeding Stage (Optional but good for consistent dev/test/demo data) ----
# This stage is specifically for running the database seed.
# It reuses the full dependencies from 'deps' stage because 'ts-node' is a devDependency.
FROM deps AS prisma_seeding
WORKDIR /app

# We already have node_modules and package files from 'deps'
# We already have the prisma schema from 'deps'

# Copy application source files needed for the seed script (if seed imports from src)
COPY src/lib ./src/lib
COPY src/types ./src/types
# Ensure the specific seed script file is copied if it wasn't part of the general COPY . . earlier
# or if you want to ensure its latest version for seeding.
COPY prisma/seed.ts ./prisma/seed.ts

# Push the schema to the database (creates the db file if it doesn't exist)
# --skip-generate is used because Prisma Client should already be generated.
RUN npx prisma db push --skip-generate

# Run the database seed script
RUN npm run prisma:db:seed


# ---- Runner Stage ----
# Final stage for running the application
FROM base AS runner
WORKDIR /app

# Set environment to production
ENV NODE_ENV production

# Create a non-root user for security
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nextjs -u 1001 -G nodejs

# Copy necessary files from previous stages
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

# Copy the seeded database from the prisma_seeding stage
COPY --from=prisma_seeding /app/prisma/dev.db ./prisma/dev.db

# Ensure the prisma directory and its contents have correct permissions if needed,
# though SQLite file in ./prisma/dev.db usually works fine with user ownership of .next
RUN chown -R nextjs:nodejs /app/prisma

# Change to the non-root user
USER nextjs

# Expose the port the app runs on
EXPOSE 3000

# Set the default command to run the application using dumb-init
# dumb-init handles signals properly, which is good for Docker containers
CMD ["dumb-init", "npm", "run", "start"]
