# Stage 1: Builder
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package.json yarn.lock* package-lock.json* pnpm-lock.yaml* ./
RUN \
  if [ -f yarn.lock ]; then yarn --frozen-lockfile; \
  elif [ -f package-lock.json ]; then npm ci; \
  elif [ -f pnpm-lock.yaml ]; then yarn global add pnpm && pnpm i --frozen-lockfile; \
  else echo "Lockfile not found." && exit 1; \
  fi

# Copy prisma schema and client generation related files
COPY prisma ./prisma/

# Generate Prisma Client
RUN npx prisma generate

# Copy the rest of the application source code
COPY . .

# Set environment variables for the build process
# ARG GOOGLE_API_KEY
# ENV GOOGLE_API_KEY=$GOOGLE_API_KEY
# Add other build-time environment variables if needed
ENV NEXT_TELEMETRY_DISABLED 1

# Build the Next.js application
# Ensure .env variables needed for build are available or passed as ARGs
# If you have a specific .env for production build:
# COPY .env.production.local ./.env.production.local
RUN npm run build


# Stage 2: Production Runner
FROM node:20-alpine AS runner
WORKDIR /app

# Create a non-root user and group
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nextjs -u 1001

# Copy standalone output
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
# Copy public assets
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
# Copy Prisma schema and the generated client (needed by standalone if DB access is direct)
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
# IMPORTANT: Copy the SQLite database file itself if you want it pre-seeded in the image
COPY --from=builder --chown=nextjs:nodejs /app/prisma/ipam.db ./prisma/ipam.db

# Set environment variables for the runtime
ENV NODE_ENV=production
ENV PORT=3000
# The DATABASE_URL will be used by Prisma Client in the standalone server
ENV DATABASE_URL="file:./prisma/ipam.db"
# Add other runtime environment variables as needed (can also be set via docker run -e or docker-compose)
# ENV GOOGLE_API_KEY=$GOOGLE_API_KEY # This would need to be passed during `docker run` or from docker-compose

USER nextjs

EXPOSE 3000

CMD ["node", "server.js"]
