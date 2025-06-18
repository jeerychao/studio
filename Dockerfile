# Base stage with Node.js
FROM node:18-slim AS base
WORKDIR /app
# Install necessary packages and clean up
RUN apt-get update -y && \
    apt-get install -y openssl curl && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*
# Enable corepack for package manager management (e.g., yarn, pnpm)
RUN corepack enable

# Dependencies stage: Install dependencies separately to leverage Docker cache
FROM base AS dependencies
WORKDIR /app
COPY package.json package-lock.json* ./
COPY prisma ./prisma/
RUN npm install --frozen-lockfile

# Builder stage: Build the application
FROM base AS builder
ARG ENCRYPTION_KEY_ARG # For seeding, passed from docker-compose build args
ENV ENCRYPTION_KEY=${ENCRYPTION_KEY_ARG}
# Set DATABASE_URL for Prisma commands during the build process
ENV DATABASE_URL="file:/app/prisma/dev.db"

WORKDIR /app

# Copy pre-installed dependencies and necessary files from the 'dependencies' stage
COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=dependencies /app/package.json ./package.json
COPY --from=dependencies /app/prisma ./prisma

# Copy the rest of the application code
# This will overwrite package.json and prisma directory if they were changed locally
# Ensure local files are up-to-date or .dockerignore is properly configured
COPY . .

# Generate Prisma client (important after copying schema from 'COPY . .')
RUN npx prisma generate

# Initialize and seed the database
# The --skip-generate flag is used if prisma generate was already run
RUN npm run prisma:db:push -- --skip-generate
RUN echo "--- Contents of /app/prisma after db:push ---" && ls -l /app/prisma || echo "ls /app/prisma failed"
RUN npm run prisma:db:seed
RUN echo "--- Contents of /app/prisma after db:seed ---" && ls -l /app/prisma || echo "ls /app/prisma failed"

# Create logs directory
RUN mkdir -p /app/logs && chown node:node /app/logs

# Build the Next.js application
RUN npm run build

# Runner stage (final production image)
FROM base AS runner
WORKDIR /app

ENV NODE_ENV production
# The ENCRYPTION_KEY for runtime will be set by docker-compose from production.env
# The DATABASE_URL for runtime will also be set by docker-compose from production.env

# Copy only necessary artifacts from the builder stage
# package.json is needed if npm run start relies on it, or for metadata.
COPY --from=dependencies --chown=node:node /app/package.json ./package.json
# Copy node_modules from dependencies stage.
# For a true standalone build focusing on minimal size, one might optimize this further
# if server.js bundles all its direct dependencies and no native modules are tricky.
# However, copying them is safer for broader compatibility.
COPY --from=dependencies --chown=node:node /app/node_modules ./node_modules


# Copy the standalone server, static assets, and public files
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public

# Copy Prisma schema for runtime (if needed, e.g. for migrations, though push handles schema)
# and the seeded database file (e.g., dev.db or prod.db as specified by DATABASE_URL in builder)
COPY --from=builder --chown=node:node /app/prisma ./prisma
COPY --from=builder --chown=node:node /app/health-check.sh ./health-check.sh
RUN chmod +x ./health-check.sh

# Copy next.config.js, it's needed by the standalone server
COPY --chown=node:node next.config.js ./

# Create and set permissions for logs directory in runner
RUN mkdir -p /app/logs && chown node:node /app/logs

# Use the non-root user 'node' provided by the base image
USER node

EXPOSE 3000

# Run the Next.js standalone server directly from /app/server.js
# (since .next/standalone contents were copied to /app)
CMD ["node", "server.js"]
