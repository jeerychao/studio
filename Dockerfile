# Base Stage - Common environment for dependencies, builder, and runner
FROM node:18-slim AS base
# Install OS packages required for sharp and other operations
# Using --no-install-recommends to minimize image size.
RUN apt-get update -y && \
    apt-get install -y --no-install-recommends \
        openssl \
        curl \
        # Dependencies for sharp (native image processing library used by Next.js Image Optimization)
        build-essential \
        pkg-config \
        libvips-dev \
    && apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Enable corepack for yarn/pnpm if needed (though this project uses npm)
RUN corepack enable
WORKDIR /app

# Dependencies Stage - Install all dependencies including devDependencies for building
FROM base AS dependencies
WORKDIR /app
COPY package.json package-lock.json* ./
COPY prisma ./prisma/
# Install all dependencies (including devDependencies for build, and sharp will be built here)
RUN npm install --frozen-lockfile
# Prisma generate is often needed after install, before build.
# It's also in postinstall, but explicit here can be safer for Docker layering.
RUN npx prisma generate

# Builder Stage - Build the Next.js application
FROM base AS builder
WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=dependencies /app/package.json ./package.json
COPY --from=dependencies /app/package-lock.json* ./
COPY --from=dependencies /app/prisma ./prisma
# Copy the rest of the application source code
COPY . .

# Environment variable for Prisma Client during build time if needed for seeding, etc.
# However, for db:push and db:seed, it seems to use the local dev.db path directly.
# ENV DATABASE_URL="file:/app/prisma/dev.db" # Already set by default in schema.prisma provider

# Push schema and seed database. The DATABASE_URL in schema.prisma should point to dev.db for this.
# --skip-generate because prisma generate already ran in dependencies stage.
RUN npm run prisma:db:push -- --skip-generate
RUN echo "--- Contents of /app/prisma after db:push ---" && ls -l /app/prisma || echo "ls /app/prisma failed in builder after push"
RUN npm run prisma:db:seed
RUN echo "--- Contents of /app/prisma after db:seed ---" && ls -l /app/prisma || echo "ls /app/prisma failed in builder after seed"

# Create logs directory and set ownership before build if Next.js tries to write there
RUN mkdir -p /app/logs && chown node:node /app/logs

# Build the Next.js application. This will generate the .next/standalone directory.
RUN npm run build

# Runner Stage - Setup the final image for running the application
FROM base AS runner
WORKDIR /app

ENV NODE_ENV production
# The PORT env var is crucial for Next.js server to listen on the correct port.
# It's often overridden by docker-compose.yml or cloud provider.
ENV PORT 3000

# Copy package.json and package-lock.json for installing only production dependencies.
# This ensures a smaller final node_modules for the runner image.
COPY --from=dependencies /app/package.json ./package.json
COPY --from=dependencies /app/package-lock.json* ./

# Install production dependencies. Sharp will be re-installed/re-built here
# for the runner's environment if it wasn't properly packaged by standalone.
# The OS deps for sharp are in the base image.
RUN npm install --omit=dev --frozen-lockfile

# Copy the standalone Next.js server output from the builder stage.
# This includes the server.js, .next/server (server-side code), and necessary node_modules.
COPY --from=builder /app/.next/standalone ./.next/standalone
# Copy static assets and public folder to be served by the Next.js server.
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Copy the prisma folder which includes the seeded dev.db and the Prisma Client (Query Engine).
# The DATABASE_URL in production.env (loaded by docker-compose) will point to this.
COPY --from=builder /app/prisma ./prisma

# Copy health check script
COPY health-check.sh /app/health-check.sh
RUN chmod +x /app/health-check.sh

# Create and set permissions for the logs directory
COPY --from=builder /app/logs ./logs
RUN chown -R node:node /app/logs /app/.next /app/public /app/prisma

# Optional: If you want to run as non-root user (node user is created by default in node images)
USER node

EXPOSE ${PORT}

# The start command uses the server.js from the standalone output.
CMD ["node", ".next/standalone/server.js"]
