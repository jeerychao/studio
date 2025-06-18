# Base stage for common setup
FROM node:18-slim AS base
LABEL maintainer="leejie2017@gmail.com"
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
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
# RUN pnpm install --frozen-lockfile # If using pnpm

# Builder stage
FROM base AS builder
WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .

# Ensure prisma/dev.db is created and seeded within the builder stage.
ENV DATABASE_URL="file:/app/prisma/dev.db"
RUN npm run prisma:db:push -- --skip-generate
RUN echo "--- Contents of /app/prisma after db:push ---" && ls -l /app/prisma || echo "ls /app/prisma failed in builder after push"
RUN npm run prisma:db:seed
RUN echo "--- Contents of /app/prisma after db:seed ---" && ls -l /app/prisma || echo "ls /app/prisma failed in builder after seed"

# Make sure logs directory exists and is owned by node user before build
RUN mkdir -p /app/logs && chown node:node /app/logs

# Build the application
RUN npm run build

# Runner stage (final production image)
FROM base AS runner
WORKDIR /app

ENV NODE_ENV production

# Copy necessary dependencies and files
COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=dependencies /app/package.json ./package.json

# Copy the standalone server and required files
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/prisma ./prisma
COPY --from=builder --chown=node:node /app/health-check.sh ./health-check.sh
RUN chmod +x ./health-check.sh

# Copy configuration files
COPY --chown=node:node next.config.js ./

# Ensure proper permissions
RUN chown -R node:node ./.next

# Switch to non-root user
USER node

# Create required directories with proper permissions
RUN mkdir -p /app/logs && \
    mkdir -p /app/.next/cache && \
    mkdir -p /app/.next/server && \
    mkdir -p /app/.next/static

# Expose the port the app runs on
EXPOSE 3000

# Start the app
CMD ["node", "server.js"]