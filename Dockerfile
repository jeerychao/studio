
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
# The DATABASE_URL here is temporary for the build process.
# The actual DATABASE_URL for runtime will be set via docker-compose.yml or environment.
ENV DATABASE_URL="file:/app/prisma/dev.db"
RUN npm run prisma:db:push -- --skip-generate
RUN echo "--- Contents of /app/prisma after db:push ---" && ls -l /app/prisma || echo "ls /app/prisma failed in builder after push"
RUN npm run prisma:db:seed
RUN echo "--- Contents of /app/prisma after db:seed ---" && ls -l /app/prisma || echo "ls /app/prisma failed in builder after seed"

# Make sure logs directory exists and is owned by node user before build
RUN mkdir -p /app/logs && chown node:node /app/logs

RUN npm run build

# Runner stage (final production image)
FROM base AS runner
WORKDIR /app

ENV NODE_ENV production
# The DATABASE_URL for runtime will be injected by docker-compose or the deployment environment
# ENV DATABASE_URL="file:/app/prisma/dev.db" (This is an example, actual value from env)

# Copy only necessary production dependencies
COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=dependencies /app/package.json ./package.json

# Copy built artifacts and public assets
# Use --chown=node:node to ensure files are owned by the non-root node user
COPY --from=builder --chown=node:node /app/.next ./.next
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/prisma ./prisma
COPY --from=builder --chown=node:node /app/health-check.sh ./health-check.sh
RUN chmod +x ./health-check.sh

# Copy other necessary files like next.config.js, etc.
COPY --chown=node:node next.config.js ./
# If you have a custom server.js or similar, copy it too:
# COPY --chown=node:node server.js ./

# The 'node' user is provided by the base node:18-slim image.
# We don't need to create it again.
USER node

# Expose the port the app runs on
EXPOSE 3000

# Start the app
CMD ["npm", "start"]
