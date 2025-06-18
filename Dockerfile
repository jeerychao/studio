
# Base stage for Node.js
FROM node:18-slim AS base
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

# Builder stage
FROM base AS builder
WORKDIR /app

# Declare ENCRYPTION_KEY_ARG for build-time
ARG ENCRYPTION_KEY_ARG
ENV ENCRYPTION_KEY=${ENCRYPTION_KEY_ARG}

COPY --from=dependencies /app/node_modules ./node_modules
COPY . .

RUN npx prisma generate

# Ensure prisma client is generated before pushing and seeding
# The `db push` command applies schema changes and creates the database if it doesn't exist.
# It's suitable for development and initial setup.
RUN npm run prisma:db:push -- --skip-generate
RUN echo "--- Contents of /app/prisma after db:push ---" && (ls -l /app/prisma || echo "ls /app/prisma failed")

# Seed the database. ENCRYPTION_KEY must be available here.
RUN npm run prisma:db:seed
RUN echo "--- Contents of /app/prisma after db:seed ---" && (ls -l /app/prisma || echo "ls /app/prisma failed")

# Create logs directory and set permissions early
RUN mkdir -p /app/logs && chown node:node /app/logs

# Build the Next.js application
RUN npm run build

# Runner stage (final production image)
FROM base AS runner
WORKDIR /app

ENV NODE_ENV production
# The ENCRYPTION_KEY for runtime will be supplied by docker-compose env_file

# Copy essential files from builder
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/prisma ./prisma
COPY --from=builder --chown=node:node /app/health-check.sh ./health-check.sh
RUN chmod +x ./health-check.sh
COPY --chown=node:node next.config.js ./
COPY --chown=node:node package.json ./ # package.json is needed for npm run start if that was used

# Create and set permissions for logs directory in runner as well
RUN mkdir -p /app/logs && chown node:node /app/logs

USER node

EXPOSE 3000

# Start the application
# server.js is now directly in /app (copied from .next/standalone)
CMD ["node", "server.js"]
