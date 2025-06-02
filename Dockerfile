# Dockerfile

# ---- Builder Stage ----
# Use Node.js 20 (Debian Bookworm base, includes OpenSSL 3.x)
FROM node:20-slim AS builder
WORKDIR /app

# Install OS packages needed for Prisma (and potentially other native modules)
# openssl (CLI tools), libssl-dev (headers, though Prisma might not need for precompiled), curl (Prisma uses for downloads)
RUN apt-get update && \
    apt-get install -y openssl curl --no-install-recommends && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Copy package files and install dependencies
COPY package.json package-lock.json* ./
RUN npm install --include=dev # Install all dependencies including dev for prisma generate

# Copy the rest of the application code
COPY . .

# Generate Prisma Client (should pick up debian-openssl-3.0.x)
RUN npx prisma generate

# Build the Next.js application
RUN npm run build

# ---- Runner Stage ----
# Use Node.js 20 slim (Debian Bookworm base, for OpenSSL 3.x compatibility)
FROM node:20-slim AS runner
WORKDIR /app

# Set environment to production
ENV NODE_ENV production
# Default DATABASE_URL, can be overridden
ENV DATABASE_URL file:./prisma/ipam.db

# Create a non-root user and group
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy built application from builder stage (standalone output)
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Copy the Prisma schema and SQLite database file
COPY --from=builder /app/prisma ./prisma

# After copying the standalone output, explicitly copy the .prisma/client directory
# to ensure the correct query engine and its dependencies are present.
# This is critical for Prisma to find its engine, especially the one for OpenSSL 3.x
COPY --from=builder /app/node_modules/.prisma/client ./node_modules/.prisma/client

# Install necessary OpenSSL runtime libraries (libssl3 for OpenSSL 3.x) and curl
# Also run ldconfig to update shared library cache
RUN apt-get update && \
    apt-get install -y libssl3 curl --no-install-recommends && \
    ldconfig && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Change ownership of the copied files to the non-root user
# Ensure the user can write to the database directory if it's inside /app/prisma
RUN chown -R nextjs:nodejs /app
USER nextjs

EXPOSE 3000

# Command to run the Next.js standalone server
CMD ["node", "server.js"]
