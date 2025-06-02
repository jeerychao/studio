# Stage 1: Builder
# Use a Node.js version that is Debian Bookworm based (e.g., Node 20) for OpenSSL 3.x
FROM node:20-slim AS builder
WORKDIR /app

# Install openssl CLI and curl (might be used by Prisma to download engines)
# Also install python and make for node-gyp if any native modules need compilation
RUN apt-get update && \
    apt-get install -y openssl curl python3 make g++ --no-install-recommends && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Copy package.json and package-lock.json (or yarn.lock)
COPY package*.json ./
COPY prisma ./prisma/

# Install dependencies (this will also run `prisma generate` due to postinstall script)
# Using npm ci for cleaner installs in CI/CD or build environments
RUN npm ci

# Copy the rest of the application code
COPY . .

# Build the Next.js application
# The `prisma generate` should have already run, but it's harmless to run it again if needed.
# However, `postinstall` in `npm ci` should cover it.
# RUN npx prisma generate # Usually not needed here if postinstall is effective
RUN npm run build

# Stage 2: Runner
# Use the same Node.js base image as the builder for consistency with OpenSSL versions
FROM node:20-slim AS runner
WORKDIR /app

ENV NODE_ENV production
# Set the default DATABASE_URL. This can be overridden at runtime if needed.
ENV DATABASE_URL="file:/app/prisma/ipam.db"

# Create a non-root user and group
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Install OpenSSL 3.x runtime dependencies and curl
# For Debian Bookworm (node:20-slim), libssl3 is the package for OpenSSL 3.x libraries
RUN apt-get update && \
    apt-get install -y libssl3 curl --no-install-recommends && \
    ldconfig && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Copy the standalone Next.js application output
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
# Copy the public folder
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
# Copy the .next/static folder for static assets
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Copy the Prisma schema and the SQLite database file
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
# Ensure the .prisma/client directory with the correct query engine is copied
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma/client ./node_modules/.prisma/client

# Set the user to the non-root user
USER nextjs

EXPOSE 3000

ENV PORT 3000

# server.js is created by Next.js standalone output
CMD ["node", "server.js"]
