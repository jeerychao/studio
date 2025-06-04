
# Install dependencies only when needed
FROM node:20-alpine AS base
WORKDIR /app

# Install Prisma globally in this stage for db push/seed
RUN npm install -g prisma typescript ts-node

# Install dependencies based on the preferred package manager
COPY package.json yarn.lock* package-lock.json* pnpm-lock.yaml* ./
RUN \
  if [ -f yarn.lock ]; then yarn --frozen-lockfile; \
  elif [ -f package-lock.json ]; then npm ci; \
  elif [ -f pnpm-lock.yaml ]; then yarn global add pnpm && pnpm i --frozen-lockfile; \
  else echo "Lockfile not found." && exit 1; \
  fi

# This stage is for generating Prisma Client
FROM base AS prisma_generate
WORKDIR /app
COPY --from=base /app/node_modules /app/node_modules
COPY prisma ./prisma
# Ensure dev.db is created by db push if it doesn't exist, then seed it.
# This creates the DB structure based on schema.prisma.
RUN npx prisma db push --skip-generate
# This populates the DB with seed data.
RUN npm run prisma:db:seed


# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=prisma_generate /app/node_modules /app/node_modules
COPY --from=prisma_generate /app/prisma /app/prisma
COPY . .
# This will ensure that environment variables from production.env are available at build time if needed by next build
# However, for runtime, docker-compose will provide them.
# If you have build-time specific env vars, ensure they are in production.env or set via --build-arg
RUN npm run build

# Production image, copy all the files and run next
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV production

# Create a non-root user and group
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy built application from the builder stage
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Copy Prisma schema and client for runtime use
# The seeded dev.db will be part of this copy from prisma_generate stage
COPY --from=prisma_generate --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=prisma_generate --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma


# Set user to non-root
USER nextjs

EXPOSE 3000
ENV PORT 3000

CMD ["node", "server.js"]
