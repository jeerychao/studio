
# --- Base Stage ---
# Use Node.js 20 Alpine as a base image. Alpine is lightweight.
FROM node:20-alpine AS base
WORKDIR /app

# 可选：如果默认源下载缓慢或出错，可以尝试更换 Alpine 软件源
# 找到一个适合您地区的镜像: https://alpinelinux.org/mirrors/
# 例如，使用清华大学的源 (移除或添加 '#' 来启用/禁用):
# RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.tuna.tsinghua.edu.cn/g' /etc/apk/repositories

# Install base dependencies including those needed for Prisma and native extensions
# openssl for Prisma, dumb-init for proper signal handling, python3, make, g++ for native module builds
RUN apk add --no-cache openssl dumb-init python3 make g++

# Enable Corepack to use specific npm version if defined in package.json (though we'll use npm directly)
RUN corepack enable

# Set the DATABASE_URL for Prisma Client generation and runtime
# This assumes the SQLite DB will be at /app/prisma/dev.db inside the container
ENV DATABASE_URL="file:/app/prisma/dev.db"

# --- Dependencies Stage ---
# Install all dependencies including devDependencies, as some (like Prisma CLI, ts-node) are needed for build/seeding.
FROM base AS deps
WORKDIR /app

# Copy package.json and package-lock.json (or yarn.lock, pnpm-lock.yaml)
COPY package.json package-lock.json* ./

# Install dependencies using npm ci for reproducible builds
# --include=dev ensures devDependencies are also installed if needed for build steps like Prisma generate or seeding scripts
RUN npm ci --include=dev


# --- Builder Stage ---
# Build the Next.js application
FROM base AS builder
WORKDIR /app

# Copy dependencies from the 'deps' stage
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json ./package.json

# Copy the rest of the application code
# Ensure .dockerignore is properly configured to exclude unnecessary files
COPY . .

# Generate Prisma Client - this needs to happen before the build
# Ensure prisma schema is copied by "COPY . ."
RUN npx prisma generate

# Build the Next.js application
# NEXT_TELEMETRY_DISABLED=1 disables Next.js telemetry during build
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build


# --- Prisma Seeding Stage ---
# This stage is specifically for pushing schema and seeding the database.
# It uses the application code and dependencies to ensure seed scripts run correctly.
FROM base AS prisma_seeding
WORKDIR /app

# Copy Prisma schema and essential source files for seeding context
COPY prisma ./prisma
COPY src/lib ./src/lib
COPY src/types ./src/types
# The seed script itself needs to be in the context of where it's run, or adjust paths in script
COPY prisma/seed.ts ./prisma/seed.ts
COPY package.json package-lock.json* ./

# Copy node_modules from deps stage as seed scripts might need devDependencies like ts-node
COPY --from=deps /app/node_modules ./node_modules

# Set DATABASE_URL specific to this stage if it's different, but usually same as runtime
# ENV DATABASE_URL="file:/app/prisma/dev.db" # Already set in base

# Push the schema to the database (creates the DB file if it doesn't exist)
RUN npx prisma db push --skip-generate

# Run the seed script. Ensure your seed script is configured correctly.
# Ensure ts-node and typescript are in devDependencies if your seed script is in TypeScript.
RUN npm run prisma:db:seed


# --- Runner Stage ---
# Create the final, small production image
FROM base AS runner
WORKDIR /app

# Set environment to production
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# ENV DATABASE_URL="file:/app/prisma/dev.db" # Already set in base

# Create a non-root user for security
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nextjs -u 1001 -G nodejs
# RUN chown -R nextjs:nodejs /app # Ownership will be set after copying files

# Copy only necessary files from previous stages
# Copy production dependencies from the 'deps' stage after pruning devDependencies
# This requires re-running npm install with --omit=dev in a separate step or careful copying.
# A simpler approach for many apps is to copy all node_modules and rely on Next.js's standalone output if size is critical.
# For now, we copy all node_modules from deps and then prune.
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json ./package.json
RUN npm prune --production

# Copy the built Next.js application from the 'builder' stage
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public

# Copy the seeded database from the 'prisma_seeding' stage
COPY --from=prisma_seeding /app/prisma/dev.db ./prisma/dev.db

# Change ownership of app files to the non-root user
RUN chown -R nextjs:nodejs /app

# Switch to the non-root user
USER nextjs

# Expose the port the app runs on
EXPOSE 3000

# Set the default command to start the Next.js application
# Using dumb-init to handle signals properly
CMD ["dumb-init", "npm", "run", "start"]
