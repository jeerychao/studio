
# Stage 1: Base image with Node.js and essential build tools
FROM node:20-alpine AS base
WORKDIR /app

# Optional: Switch Alpine mirror if default is slow/problematic
# For example, using Tsinghua University's mirror (China)
# RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.tuna.tsinghua.edu.cn/g' /etc/apk/repositories

RUN apk add --no-cache openssl dumb-init python3 make g++
RUN corepack enable # Enables pnpm, yarn if needed, though we focus on npm

# Stage 2: Install all dependencies (including devDependencies for build/prisma)
FROM base AS deps
WORKDIR /app
# Copy prisma directory first so 'prisma generate' (in postinstall) can find schema.prisma
COPY prisma ./prisma
COPY package.json ./package.json
# Copy lockfile if it exists. Using specific name to avoid unintended glob matches.
COPY package-lock.json ./package-lock.json
# If package-lock.json might not exist, and you want to proceed (not recommended for CI):
# COPY package-lock.json* ./ 

RUN npm ci --include=dev # This will also run 'prisma generate' due to postinstall script

# Stage 3: Build the application
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/prisma ./prisma # Ensure prisma schema and client are available for build
COPY . .
RUN npm run build
RUN npm prune --production # Remove devDependencies after build, keeping Prisma client if it was a prod dep

# Stage 4: Prisma Seeding
# This stage ensures seeding uses the same environment and dependencies as the build
FROM base AS prisma_seeding
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules # Get all modules, including ts-node, prisma
COPY prisma ./prisma
COPY src/lib ./src/lib
COPY src/types ./src/types
COPY tsconfig.json ./tsconfig.json
# Explicitly copy package.json and package-lock.json to /app/
COPY package.json ./package.json
COPY package-lock.json ./package-lock.json
# Ensure ts-node and Prisma client are available from node_modules
# The --skip-generate flag is used if Prisma Client was already generated in 'deps' stage.
# If you are sure client is generated and up-to-date, pushing schema is fine.
RUN npx prisma db push --skip-generate
RUN npx prisma db seed

# Stage 5: Final production image
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
# ENV DATABASE_URL="file:/app/prisma/dev.db" # This should be set by production.env or docker-compose.yml

# Create a non-root user and group
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nextjs -u 1001 -G nodejs

# Copy only necessary artifacts from builder stage
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules # Production node_modules
COPY --from=prisma_seeding /app/prisma/dev.db ./prisma/dev.db # Copy the seeded database
COPY package.json ./ # Needed for npm start

USER nextjs

EXPOSE 3000

# Use dumb-init to handle signals properly
CMD ["dumb-init", "npm", "run", "start"]
