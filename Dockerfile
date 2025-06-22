# Base stage with Node.js
FROM node:18-slim AS base
WORKDIR /app

# Install necessary packages and clean up
RUN apt-get update -y && \
    apt-get install -y openssl curl && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Enable corepack for package manager management (e.g., yarn, pnpm)
RUN corepack enable

# Dependencies stage: Install dependencies separately to leverage Docker cache
FROM base AS dependencies
WORKDIR /app
COPY package.json package-lock.json* ./
COPY prisma ./prisma/
RUN npm install --frozen-lockfile

# Builder stage: Build the application
FROM base AS builder

# 接收构建参数
ARG NEXT_PUBLIC_BASE_URL
ENV NEXT_PUBLIC_BASE_URL=$NEXT_PUBLIC_BASE_URL
ARG ENCRYPTION_KEY_ARG
ENV ENCRYPTION_KEY=${ENCRYPTION_KEY_ARG}

# Set DATABASE_URL for Prisma commands during the build process
ENV DATABASE_URL="file:/app/prisma/dev.db"

# 添加创建时间和创建者信息
ENV CREATED_AT="2025-06-19 01:57:10"
ENV CREATED_BY="jeerychao"

WORKDIR /app

# Copy pre-installed dependencies and necessary files from the 'dependencies' stage
COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=dependencies /app/package.json ./package.json
COPY --from=dependencies /app/prisma ./prisma

# Copy the rest of the application code
COPY . .

# Generate Prisma client (important after copying schema from 'COPY . .')
RUN npx prisma generate

# Initialize and seed the database
RUN npm run prisma:db:push -- --skip-generate
RUN echo "--- Contents of /app/prisma after db:push ---" && ls -l /app/prisma || echo "ls /app/prisma failed"
RUN npm run prisma:db:seed
RUN echo "--- Contents of /app/prisma after db:seed ---" && ls -l /app/prisma || echo "ls /app/prisma failed"

# Create logs directory
RUN mkdir -p /app/logs && chown node:node /app/logs

# Build the Next.js application
RUN npm run build

# Runner stage (final production image)
FROM base AS runner
WORKDIR /app

ENV NODE_ENV production
# 添加创建时间和创建者信息到运行时环境
ENV CREATED_AT="2025-06-19 01:57:10"
ENV CREATED_BY="jeerychao"

# Copy only necessary artifacts from the builder stage
COPY --from=dependencies --chown=node:node /app/package.json ./package.json
COPY --from=dependencies --chown=node:node /app/node_modules ./node_modules

# Copy the standalone server, static assets, and public files
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public

# Copy Prisma schema and database
COPY --from=builder --chown=node:node /app/prisma ./prisma
COPY --from=builder --chown=node:node /app/health-check.sh ./health-check.sh
RUN chmod +x ./health-check.sh

# Copy next.config.js
COPY --chown=node:node next.config.js ./

# Create and set permissions for logs directory in runner
RUN mkdir -p /app/logs && chown node:node /app/logs

# Use the non-root user 'node'
USER node

# 使用环境变量作为端口
ENV PORT=${INTERNAL_PORT:-3000}
EXPOSE ${PORT}

# Run the Next.js standalone server
CMD ["node", "server.js"]