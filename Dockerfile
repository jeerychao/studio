
# Stage 1: Install dependencies and build Prisma Client
FROM node:18-slim AS deps
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --frozen-lockfile

# Stage 2: Builder stage - Build the application and seed the database
FROM node:18-slim AS builder
WORKDIR /app

# Copy dependencies (node_modules) from the 'deps' stage
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Ensure Prisma Client is generated
RUN npx prisma generate

# Set a temporary DATABASE_URL for build-time db operations (push & seed)
# This assumes dev.db will be created in ./prisma/ relative to the Dockerfile context (copied from .)
ENV DATABASE_URL="file:./prisma/dev.db"

# Apply schema to the database (creates dev.db if it doesn't exist)
# --skip-generate because we already ran generate
RUN npm run prisma:db:push -- --skip-generate

# Seed the database
RUN npm run prisma:db:seed

# Build the Next.js application
RUN npm run build

# Stage 3: Production runner stage
FROM node:18-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
# Set HOSTNAME to 0.0.0.0 to accept connections from any IP address.
ENV HOSTNAME=0.0.0.0
# PORT is set by docker-compose, but good to have a default here too.
ENV PORT=3000

# Next.js standalone output copies necessary node_modules, so we don't need a full npm install here.
# However, we still need package.json for `npm start` to work correctly and potentially for Prisma runtime.
COPY --from=builder /app/package.json ./package.json

# Automatically leverage output traces to reduce image size
# https://nextjs.org/docs/advanced-features/output-file-tracing
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/health-check.sh ./health-check.sh
RUN chmod +x ./health-check.sh

# Create a non-root user for security
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs
USER nextjs

EXPOSE 3000

# The start script from package.json should be `node .next/standalone/server.js`
# which is suitable for the standalone output.
CMD ["npm", "start"]
