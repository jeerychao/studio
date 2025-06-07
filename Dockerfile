
# --- Base Stage ---
# Use a specific Node.js version. `slim` variant is smaller.
FROM node:18-slim AS base
LABEL maintainer="leejie2017@gmail.com"
LABEL description="Base image for IPAM Lite application with Node.js and essential tools."

# Install openssl and curl, which might be needed by Prisma or other dependencies.
# Clean up apt cache to reduce image size.
RUN apt-get update -y && \
    apt-get install -y openssl curl && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Enable corepack to use pnpm/yarn if desired (though current project uses npm)
RUN corepack enable

# Set working directory
WORKDIR /app

# --- Dependencies Stage ---
# This stage is for installing npm dependencies.
# It's a separate stage to leverage Docker layer caching.
# If package.json or package-lock.json don't change, this layer won't be rebuilt.
FROM base AS dependencies
LABEL description="Stage for installing Node.js dependencies for IPAM Lite."

WORKDIR /app
COPY package.json package-lock.json* ./
COPY prisma ./prisma/
# Install dependencies using the lockfile for reproducible builds
RUN npm install --frozen-lockfile

# --- Builder Stage ---
# This stage builds the Next.js application and prepares Prisma.
FROM base AS builder
LABEL description="Stage for building the Next.js application and preparing Prisma for IPAM Lite."

WORKDIR /app

# Copy dependencies from the 'dependencies' stage
COPY --from=dependencies /app/node_modules ./node_modules
# Copy the rest of the application code
COPY . .

# Set a build-time DATABASE_URL for Prisma commands that need it.
# This points to the SQLite file that will be created within the image.
ENV DATABASE_URL="file:/app/prisma/dev.db"

# Push the Prisma schema to the database. This creates the dev.db file.
# --skip-generate is used because `npm install` in dependencies stage (or postinstall) should have already run `prisma generate`.
RUN npm run prisma:db:push -- --skip-generate

# Debug: List contents of prisma directory after db:push
RUN echo "--- Contents of /app/prisma after db:push ---" && ls -l /app/prisma || echo "ls /app/prisma failed in builder after push"

# Seed the database.
RUN npm run prisma:db:seed

# Debug: List contents of prisma directory after db:seed
RUN echo "--- Contents of /app/prisma after db:seed ---" && ls -l /app/prisma || echo "ls /app/prisma failed in builder after seed"

# Build the Next.js application for production.
RUN npm run build

# --- Runner Stage (Final Production Image) ---
# This stage creates the final, lean production image.
FROM base AS runner
LABEL description="Production image for IPAM Lite application."

WORKDIR /app

# Set Node environment to production.
ENV NODE_ENV production
# Default port, can be overridden by PORT env var at runtime.
ENV PORT 3000
EXPOSE 3000

# Create a non-root user 'node' and group 'node'.
# Applications should run as non-root users for security.
RUN addgroup --system --gid 1001 node
RUN adduser --system --uid 1001 node

# Copy only production dependencies from the 'dependencies' stage.
# Using a multi-stage build like this helps keep the final image smaller.
COPY --from=dependencies /app/node_modules ./node_modules
# If you had a separate step for production-only dependencies, you'd use that.
# For now, `npm install` in dependencies stage installs all. If you optimize for prod-only deps later, adjust this.

# Copy the built Next.js application from the 'builder' stage.
COPY --from=builder /app/.next ./.next
# Copy public assets.
COPY --from=builder /app/public ./public
# Copy the Prisma schema and the seeded database file from the 'builder' stage.
COPY --from=builder --chown=node:node /app/prisma ./prisma

# Copy package.json for `npm start` and other metadata.
COPY package.json .

# Create and set permissions for the logs directory
RUN mkdir -p /app/logs && chown node:node /app/logs

# Change to the non-root user.
USER node

# Health check script
COPY health-check.sh /app/health-check.sh
RUN chmod +x /app/health-check.sh
# Healthcheck defined in docker-compose.yml for more flexibility

# Command to run the application.
# `npm start` should be defined in package.json to run `next start`.
CMD ["npm", "start"]
