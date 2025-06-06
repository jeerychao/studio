# Base image with Node.js
FROM node:18-slim AS base

# Install OpenSSL and other necessary dependencies
RUN apt-get update -y && \
    apt-get install -y openssl && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

RUN corepack enable
WORKDIR /app

# Dependencies stage
FROM base AS dependencies
WORKDIR /app
COPY package.json package-lock.json* ./
COPY prisma ./prisma/
# 移除 --omit=dev 标志，因为构建时需要开发依赖
RUN npm install --frozen-lockfile

# Builder stage
FROM base AS builder
WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .

# Ensure prisma directory exists and has correct permissions
RUN mkdir -p /app/prisma
RUN npx prisma generate
RUN npm run prisma:db:push -- --skip-generate
RUN npm run prisma:db:seed
RUN npm run build

# Runner stage
FROM base AS runner
WORKDIR /app

# Create a non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Set proper permissions
RUN mkdir -p /app/prisma && chown -R nextjs:nodejs /app/prisma

# Copy necessary files
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/prisma ./prisma

USER nextjs

ENV PORT 3000
ENV NODE_ENV production
EXPOSE 3000

CMD ["npm", "start"]