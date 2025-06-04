
# Stage 1: Base image with Node.js and essential tools
FROM node:20-alpine AS base
WORKDIR /app

# Optional: Switch Alpine mirror if default is slow/error-prone
# Ensure this line is uncommented if you face issues with apk add
# RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.tuna.tsinghua.edu.cn/g' /etc/apk/repositories

RUN apk add --no-cache openssl dumb-init python3 make g++
RUN corepack enable

# Stage 2: Install all dependencies (including devDependencies for build tools and prisma generate)
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
COPY prisma ./prisma  # Copy prisma directory (contains schema.prisma) BEFORE npm ci
# 'npm ci' installs dependencies based on package-lock.json.
# --include=dev ensures devDependencies (like 'prisma' CLI, 'ts-node') are installed.
# The 'postinstall' script 'prisma generate' will run here and should now find the schema.
RUN npm ci --include=dev

# Stage 3: Build the application
FROM deps AS builder
WORKDIR /app
# node_modules (with devDependencies and generated Prisma Client) are inherited from 'deps'
COPY . . # Copy all source files (including prisma again, which is fine)
RUN npm run build

# After the build, prune devDependencies to slim down node_modules for the runner stage
RUN npm prune --production

# Stage 4: Prisma Seeding (optional, run if you want to seed DB at image build time)
# This stage uses the full dependencies from 'deps' (before pruning) to run seeding scripts
FROM deps AS prisma_seeding
WORKDIR /app # WORKDIR is /app from deps

# Copy necessary files for seeding.
# package.json, package-lock.json, and node_modules (with devDependencies) are inherited from 'deps'
# Prisma schema was copied in 'deps' and Prisma Client generated there.
# Ensure the latest seed script and its local dependencies (like src/lib, src/types) are present.
COPY prisma/seed.ts ./prisma/seed.ts
COPY src/lib ./src/lib
COPY src/types ./src/types

# Ensure the database file path is valid for SQLite before push/seed
RUN mkdir -p /app/prisma && touch /app/prisma/dev.db

# Push schema to the database (e.g., create tables).
# --skip-generate because client was already generated in 'deps' stage.
RUN npx prisma db push --schema=/app/prisma/schema.prisma --skip-generate

# Run database seeding
RUN npm run prisma:db:seed # Runs 'ts-node ... prisma/seed.ts'

# Stage 5: Final production image
FROM base AS runner
WORKDIR /app

# Create a non-root user for security
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nextjs -u 1001 -G nodejs

# Copy only necessary artifacts from previous stages
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next
# Copy the pruned node_modules (production only + generated Prisma Client) from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json # Needed for 'npm start'

# Copy the seeded database from the prisma_seeding stage
COPY --from=prisma_seeding --chown=nextjs:nodejs /app/prisma ./prisma

# Set environment variables
ENV NODE_ENV=production
# DATABASE_URL is critical for Prisma Client at runtime.
ENV DATABASE_URL="file:/app/prisma/dev.db"

USER nextjs

EXPOSE 3000

# Command to run the application
# Using dumb-init to handle signals properly
CMD ["dumb-init", "npm", "run", "start"]
