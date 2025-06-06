# Base image with Node.js
FROM node:18-slim AS base

# Install OpenSSL and other necessary dependencies
# Debian Bullseye (node:18-slim) comes with OpenSSL 1.1.1. Explicitly installing ensures it's there.
RUN apt-get update -y && \
    apt-get install -y openssl && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

RUN corepack enable
WORKDIR /app

# Dependencies stage: Install production dependencies
FROM base AS dependencies
WORKDIR /app
COPY package.json package-lock.json* ./
# Copy prisma directory here so `prisma generate` in postinstall can find schema.prisma
COPY prisma ./prisma/
RUN npm install --frozen-lockfile --omit=dev

# Builder stage: Build the application
FROM base AS builder
WORKDIR /app

COPY --from=dependencies /app/node_modules ./node_modules
COPY . .

# Set DATABASE_URL for build-time prisma commands (db push, seed)
# This path is relative to /app, so it points to /app/prisma/dev.db
ENV DATABASE_URL="file:./prisma/dev.db"

# Ensure Prisma Client is generated using the correct schema and binary target
RUN npx prisma generate

# Create and initialize the database (dev.db as per DATABASE_URL)
# The --skip-generate is good practice here as generate was just run
RUN npm run prisma:db:push -- --skip-generate
RUN echo "--- Contents of /app/prisma after db:push ---" && ls -l /app/prisma || echo "ls /app/prisma failed or dir empty"

# Seed the database
RUN npm run prisma:db:seed
RUN echo "--- Contents of /app/prisma after db:seed ---" && ls -l /app/prisma || echo "ls /app/prisma failed or dir empty"

# Build the Next.js application
RUN npm run build

# Runner stage: Create the final production image
FROM base AS runner
WORKDIR /app

# Create a non-root user and group for security
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy only necessary files from builder stage and set correct permissions
# Copy public assets
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
# Copy Next.js build output
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next
# Copy production node_modules
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules
# Copy package.json for `npm start`
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json
# Copy the prisma directory which now includes schema.prisma AND the generated dev.db
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma

# Switch to the non-root user
USER nextjs

# Set the port the app will run on
ENV PORT 3000
# Expose the port
EXPOSE 3000

# Command to run the application
CMD ["npm", "start"]
