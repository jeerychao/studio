
# ---- Base Node ----
FROM node:18-slim AS base
RUN apt-get update -y && \
    apt-get install -y openssl curl && \
    # Clean up apt caches to reduce image size
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /app

# ---- Dependencies ----
FROM base AS dependencies
WORKDIR /app
COPY package.json package-lock.json* ./
COPY prisma ./prisma/
RUN npm install --frozen-lockfile

# ---- Builder ----
FROM base AS builder
ARG DATABASE_URL_BUILD_TIME="file:./dev.db"
ENV DATABASE_URL=${DATABASE_URL_BUILD_TIME}

WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .

# Make sure Prisma Client is generated
RUN npx prisma generate

# Initialize and seed the database
RUN npm run prisma:db:push -- --skip-generate
RUN echo "--- Contents of /app/prisma after db:push ---" && ls -l /app/prisma || echo "ls /app/prisma failed after push"
RUN npm run prisma:db:seed
RUN echo "--- Contents of /app/prisma after db:seed ---" && ls -l /app/prisma || echo "ls /app/prisma failed after seed"

# Create logs directory with correct permissions before build
RUN mkdir -p /app/logs && chown node:node /app/logs

# Build the Next.js application
RUN npm run build

# ---- Runner ----
FROM base AS runner
WORKDIR /app

ENV NODE_ENV production
# The USER and GROUP are 'node' by default in the node:slim image
# We don't need to create them again.
# RUN addgroup --system node && adduser --system --ingroup node node # This line is removed

# Copy only necessary production dependencies
COPY --from=dependencies --chown=node:node /app/package.json ./
COPY --from=dependencies --chown=node:node /app/node_modules ./node_modules

# Copy standalone output, static assets, and public folder
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public

# Copy Prisma schema and health-check script
COPY --from=builder --chown=node:node /app/prisma ./prisma
COPY --from=builder --chown=node:node /app/health-check.sh ./health-check.sh
RUN chmod +x ./health-check.sh

# Copy next.config.js (needed for standalone)
COPY --chown=node:node next.config.js ./

# Create and set permissions for logs directory (if not already covered or for explicitness)
# Builder stage now creates /app/logs, so this might be redundant but harmless
RUN mkdir -p /app/logs && chown node:node /app/logs

USER node

EXPOSE 3000

# Start the application using the server.js from the standalone output
CMD ["node", "server.js"]
