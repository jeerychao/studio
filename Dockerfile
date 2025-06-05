# Base image with Node.js 20 Alpine
FROM node:20-alpine AS base
WORKDIR /app

# 可选：如果默认源下载缓慢或出错，可以尝试更换 Alpine 软件源
# 找到一个适合您地区的镜像: https://alpinelinux.org/mirrors/
# 例如，使用清华大学的源 (移除或添加 '#' 来启用/禁用):
RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.tuna.tsinghua.edu.cn/g' /etc/apk/repositories

# Install base dependencies including those needed for Prisma and native extensions
RUN apk add --no-cache openssl dumb-init python3 make g++

# Enable corepack to manage pnpm/yarn if needed (though we are using npm here)
RUN corepack enable


# Dependencies stage: Install all dependencies (dev and prod)
FROM base AS deps
WORKDIR /app

# Copy prisma directory first to ensure schema is available for 'prisma generate' (postinstall)
COPY prisma ./prisma
# Copy package.json and package-lock.json
COPY package.json ./package.json
COPY package-lock.json ./package-lock.json

# Install dependencies using npm ci for reproducible builds
# --include=dev ensures devDependencies (like prisma, ts-node) are installed for build/seed steps
RUN npm ci --include=dev


# Builder stage: Build the Next.js application
FROM base AS builder
WORKDIR /app

# Copy installed dependencies from 'deps' stage
COPY --from=deps /app/node_modules ./node_modules
# Copy prisma directory again (important if 'prisma generate' was run in 'deps' and modified client)
COPY --from=deps /app/prisma ./prisma
# Copy the rest of the application code
COPY . .

# Build the Next.js application
RUN npm run build

# Prune devDependencies to reduce final image size for node_modules
# Prisma Client should already be generated and included in .next/standalone or copied from deps if it's in node_modules
# If Prisma client is in node_modules/@prisma/client, this prune might remove it if it's a devDep.
# However, 'prisma generate' usually puts it in node_modules, and it's a production dep of @prisma/client.
# For safety, we re-generate in the runner stage if needed, or rely on the .next/standalone output.
# Let's keep it simple and assume Prisma client is handled correctly by Next.js build or is a prod dep.
RUN npm prune --production


# Prisma Seeding stage (Optional, if you need to seed the DB during image build)
# This stage assumes the DB file will be part of the image.
# For external DBs, seeding might be done differently.
FROM base AS prisma_seeding
WORKDIR /app

# Copy installed dependencies (including dev dependencies like ts-node) from 'deps' stage
COPY --from=deps /app/node_modules ./node_modules

# Copy necessary files for seeding
COPY prisma ./prisma
COPY src/lib ./src/lib
COPY src/types ./src/types
COPY tsconfig.json ./tsconfig.json
# Copy package.json and package-lock.json for context if seed script uses them or 'ts-node' needs project context
COPY package.json ./package.json
COPY package-lock.json ./package-lock.json
# Make sure your seed script path is correct
# COPY prisma/seed.ts ./prisma/seed.ts # This line is slightly redundant if 'COPY prisma ./prisma' is already done, but harmless.

# Run Prisma DB push (creates DB file if not exists and applies schema)
# --skip-generate is used because Prisma Client should already be generated
RUN npx prisma db push --skip-generate

# Run Prisma DB seed
RUN npm run prisma:db:seed


# Runner stage: Final image to run the application
FROM base AS runner
WORKDIR /app

# Set environment to production
ENV NODE_ENV production

# Create a non-root user and group for security
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nextjs -u 1001 -G nodejs

# Copy production node_modules from the builder stage
COPY --from=builder /app/node_modules ./node_modules

# Copy the built Next.js app from the builder stage
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public

# Copy Prisma schema and the seeded database from the prisma_seeding stage
COPY --from=prisma_seeding /app/prisma ./prisma

# Copy package.json to be able to run "npm start"
COPY package.json .

# Set ownership of app files to the non-root user
# This needs to be done after all files are copied
RUN chown -R nextjs:nodejs /app

# Switch to the non-root user
USER nextjs

# Expose port 3000
EXPOSE 3000

# Start the application using dumb-init to handle signals properly
# The CMD should use the 'start' script from package.json, which is 'next start'
CMD ["dumb-init", "npm", "run", "start"]
