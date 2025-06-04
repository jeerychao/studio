
# Stage 1: Base image with Node.js and necessary OS packages
FROM node:20-alpine AS base
WORKDIR /app

# 可选：如果默认源下载缓慢或出错，可以尝试更换 Alpine 软件源
# 找到一个适合您地区的镜像: https://alpinelinux.org/mirrors/
# 例如，使用清华大学的源 (移除或添加 '#' 来启用/禁用):
# RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.tuna.tsinghua.edu.cn/g' /etc/apk/repositories

# Install base dependencies including those needed for Prisma and native extensions
RUN apk add --no-cache openssl dumb-init python3 make g++

# Enable corepack to use pnpm/yarn if specified in package.json (though we'll use npm for this project)
RUN corepack enable


# Stage 2: Install all dependencies (including devDependencies for build and prisma)
FROM base AS deps
WORKDIR /app

# Copy package.json, lock file, and the prisma schema/directory
# This ensures 'prisma generate' (often a postinstall script) can find the schema
COPY package.json package-lock.json* ./
COPY prisma ./prisma

# Install all dependencies, including devDependencies needed for `prisma generate` and `next build`
# 'npm ci' is generally preferred for CI/CD as it's faster and stricter than 'npm install'
# Using --include=dev because 'prisma generate' and 'next build' might need devDependencies
RUN npm ci --include=dev
# Alternative if 'npm ci' causes issues, though 'ci' is better for reproducibility:
# RUN npm install --include=dev


# Stage 3: Build the Next.js application
FROM base AS builder
WORKDIR /app

# Copy all dependencies (including devDependencies) from the 'deps' stage
COPY --from=deps /app/node_modules ./node_modules
# Copy application code
COPY . .

# Generate Prisma Client (should ideally be done in 'deps' via postinstall, but as a fallback if needed)
# RUN npx prisma generate # Usually not needed here if postinstall script in package.json works

# Build the Next.js application
RUN npm run build

# Remove devDependencies after build to reduce image size for the next stage
# Prisma client is a runtime dependency, so it should not be pruned if it's not in dependencies.
# If prisma client is in devDependencies but needed at runtime, adjust package.json or this step.
RUN npm prune --production


# Stage 4: Database Seeding (Optional, run if you need to seed the DB in the image)
# This stage uses the full node_modules from 'deps' because seeding scripts might need devDependencies like ts-node
FROM base AS prisma_seeding
WORKDIR /app

# Copy necessary files for seeding
COPY --from=deps /app/node_modules ./node_modules
COPY prisma ./prisma
COPY src/lib ./src/lib
COPY src/types ./src/types
# Ensure your tsconfig is available if ts-node needs it, though it's often not directly read by ts-node for scripts
COPY tsconfig.json ./tsconfig.json
COPY package.json package-lock.json* ./ # For scripts and context

# Ensure the DATABASE_URL is set for Prisma commands
# The path here is relative to the WORKDIR /app
ENV DATABASE_URL="file:./prisma/dev.db"

# Push the schema to the database (creates the dev.db file if it doesn't exist)
# --skip-generate because Prisma Client should have been generated in 'deps' or 'builder'
RUN npx prisma db push --skip-generate

# Run the seed script
RUN npm run prisma:db:seed


# Stage 5: Final production image
FROM base AS runner
WORKDIR /app

# Set environment variables for production
ENV NODE_ENV=production
# The DATABASE_URL for the running application inside the container
ENV DATABASE_URL="file:/app/prisma/dev.db"

# Create a non-root user and group
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nextjs -u 1001 -G nodejs

# Copy only necessary artifacts from previous stages
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
# Copy production node_modules from the 'builder' stage (after pruning)
COPY --from=builder /app/node_modules ./node_modules
# Copy the Prisma schema and the seeded database from the 'prisma_seeding' stage
COPY --from=prisma_seeding /app/prisma ./prisma
# Copy package.json for 'npm start' to work and potentially for runtime access to version, etc.
COPY package.json ./

# Change ownership of the app files to the non-root user
# This might need adjustment if other files/dirs are created at runtime by the app
# RUN chown -R nextjs:nodejs /app/.next /app/node_modules /app/public /app/prisma /app/package.json
USER nextjs

EXPOSE 3000

# Use dumb-init to handle signals properly
# Start the Next.js production server
CMD ["dumb-init", "npm", "run", "start"]
