
# Base image with Node.js
FROM node:18-slim AS base
RUN apt-get update -y && \
    apt-get install -y openssl curl && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /app

# Dependencies stage: Install only production dependencies
# This stage benefits from caching if package.json/lock hasn't changed.
FROM base AS dependencies
WORKDIR /app
COPY package.json package-lock.json* ./
# Copy prisma schema here because 'prisma generate' is often part of postinstall
# and needs schema.prisma to run, even with --omit=dev for npm install.
COPY prisma ./prisma/
RUN npm install --frozen-lockfile --omit=dev

# Builder stage: Build the application
FROM base AS builder
WORKDIR /app

# Copy node_modules from dependencies stage
COPY --from=dependencies /app/node_modules ./node_modules

# Copy all source files
COPY . .

# Set DATABASE_URL for build time (prisma db push & seed)
# This should point to a path *inside* the build container
ENV DATABASE_URL="file:./prisma/dev.db"

# Generate Prisma client (explicitly, though postinstall in package.json might also run it)
RUN npx prisma generate

# Push schema to the database (create dev.db based on schema)
# --skip-generate is used because we just ran generate
RUN npm run prisma:db:push -- --skip-generate
RUN echo "--- Contents of /app/prisma after db:push ---" && ls -l /app/prisma || echo "ls /app/prisma failed in builder after push"

# Seed the database
RUN npm run prisma:db:seed
RUN echo "--- Contents of /app/prisma after db:seed ---" && ls -l /app/prisma || echo "ls /app/prisma failed in builder after seed"

# Build the Next.js application
RUN npm run build

# Runner stage: Setup the production environment
FROM base AS runner
WORKDIR /app

# Create a non-root user and group
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Create prisma directory and set permissions for the nextjs user before copying
RUN mkdir -p /app/prisma && chown nextjs:nodejs /app/prisma

# Copy necessary files from builder stage, ensuring correct ownership
# Copy production node_modules (if any were specific to builder, they won't be here)
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json
# Copy the Next.js build output
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
# Copy the prisma directory (which includes the schema and the seeded dev.db)
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma

# Switch to the non-root user
USER nextjs

# Set default port
ENV PORT 3000
EXPOSE 3000

# Start the application
CMD ["npm", "start"]
