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
# 保留所有依赖以确保构建正常
RUN npm install --frozen-lockfile

# Builder stage
FROM base AS builder
WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .

# Set environment variables for build
ENV NODE_ENV="production"
ENV DATABASE_URL="file:/app/prisma/dev.db"
ENV NEXT_PUBLIC_BASE_URL="http://17.100.100.253:3010"
ENV NEXTAUTH_URL="http://17.100.100.253:3010"

# Generate Prisma client and prepare database
RUN npx prisma generate
RUN mkdir -p /app/prisma
RUN npm run prisma:db:push -- --skip-generate
RUN echo "--- Contents of /app/prisma after db:push ---" && ls -l /app/prisma || echo "ls /app/prisma after push failed"
RUN npm run prisma:db:seed
RUN echo "--- Contents of /app/prisma after db:seed ---" && ls -l /app/prisma || echo "ls /app/prisma after seed failed"

# Build the Next.js application
RUN npm run build

# Runner stage
FROM base AS runner
WORKDIR /app

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Setup directory structure and permissions
RUN mkdir -p /app/prisma && \
    mkdir -p /app/.next/cache && \
    chown -R nextjs:nodejs /app

# Copy necessary files
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/next.config.js ./
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./

# Set runtime environment variables
ENV NODE_ENV="production"
ENV PORT="3000"
ENV HOSTNAME="0.0.0.0"
ENV NEXT_PUBLIC_BASE_URL="http://17.100.100.253:3010"
ENV NEXTAUTH_URL="http://17.100.100.253:3010"
ENV DATABASE_URL="file:/app/prisma/dev.db"

USER nextjs
EXPOSE 3000

CMD ["node", "server.js"]