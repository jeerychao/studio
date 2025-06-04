
# Dockerfile

# ---- Base Node ----
FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache openssl dumb-init python3 make g++
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

# ---- Dependencies ----
FROM base AS deps
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile --prod=false

# ---- Builder ----
FROM base AS builder
COPY --from=deps /app/node_modules /app/node_modules
COPY . .
# Prisma Client Generation
# Ensure DATABASE_URL is set for Prisma generate, even if it's just for the schema path
ENV DATABASE_URL="file:/app/prisma/dev.db"
RUN npx prisma generate
RUN npm run build

# ---- Prisma DB Push and Seed ----
# This stage specifically handles database creation and seeding.
# It uses the schema from the builder stage and dependencies.
FROM base AS prisma_generate
COPY --from=deps /app/node_modules /app/node_modules
COPY prisma ./prisma
# Set DATABASE_URL for Prisma db push and seed operations
ENV DATABASE_URL="file:./dev.db"
WORKDIR /app/prisma
RUN npx prisma db push --skip-generate
# Ensure ts-node and Prisma client are available for seeding
COPY package.json tsconfig.json ./../
RUN cd .. && npm install --prod=false ts-node typescript @prisma/client dotenv
WORKDIR /app
RUN npm run prisma:db:seed

# ---- Runner ----
FROM base AS runner
USER nextjs
ENV NODE_ENV production
# Set DATABASE_URL for the running application
ENV DATABASE_URL="file:/app/prisma/dev.db"

COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/package.json .
# Copy the seeded database from the prisma_generate stage
COPY --from=prisma_generate --chown=nextjs:nodejs /app/prisma ./prisma

# Expose the port the app runs on
EXPOSE 3000

# Start the app
CMD ["dumb-init", "npm", "start"]
