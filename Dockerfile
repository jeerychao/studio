# Dockerfile

# 1. Base stage for common setup
FROM node:18-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /app

# 2. Dependencies stage for caching node_modules
FROM base AS dependencies
WORKDIR /app
COPY package.json package-lock.json* ./

# --->>> 新增: 复制 prisma 目录，确保 schema 文件在 npm install (触发 prisma generate) 时可用
COPY prisma ./prisma/

RUN npm install --frozen-lockfile --omit=dev


# 3. Builder stage to build the application
FROM base AS builder
WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .

# Prisma Client Generation and DB Push/Seed
# This DATABASE_URL is temporary for the build process
ENV DATABASE_URL="file:/app/prisma/dev.db"

# Ensure Prisma Client is generated (might be redundant if postinstall script works correctly after schema copy)
# RUN npx prisma generate # Can be kept or removed if postinstall handles it

# Push schema and seed the database
RUN npx prisma db push --skip-generate
RUN echo "--- Dockerfile: After prisma db push, listing /app/prisma ---" && ls -l /app/prisma || echo "ls /app/prisma failed"
RUN npm run prisma:db:seed
RUN echo "--- Dockerfile: After prisma db seed, listing /app/prisma ---" && ls -l /app/prisma || echo "ls /app/prisma failed"


# Build the Next.js application
RUN npm run build

# 4. Runner stage for the final production image
FROM base AS runner
WORKDIR /app

ENV NODE_ENV production
# This default DATABASE_URL will be overridden by docker-compose env_file if provided
ENV DATABASE_URL="file:/app/prisma/dev.db"

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public

# Automatically leverage output traces to reduce image size
# https://nextjs.org/docs/advanced-features/output-file-tracing
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Copy the prisma directory (including the seeded dev.db) from the builder stage
# Ensure the 'nextjs' user owns these files
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma

USER nextjs

EXPOSE 3000
ENV PORT 3000

CMD ["node", "server.js"]
