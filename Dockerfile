
# Stage 1: Install dependencies and generate Prisma Client
FROM node:18-slim AS dependencies
WORKDIR /app

# Install node-gyp dependencies for native modules if any (Prisma might need this)
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY prisma ./prisma/
RUN npx prisma generate

# Stage 2: Build the application and prepare the database
FROM node:18-slim AS builder
WORKDIR /app

# Copy dependencies and Prisma Client from the 'dependencies' stage
COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=dependencies /app/prisma ./prisma

# Copy the rest of the application source code
COPY . .

# Set DATABASE_URL for build-time Prisma commands (db push, db seed)
# This path is relative to the WORKDIR /app
ENV DATABASE_URL="file:./prisma/dev.db"

# Create the database schema and the dev.db file
# Using the npm script directly to avoid potential npx issues in some environments
RUN npm run prisma:db:push -- --skip-generate

# Seed the database using the npm script
RUN npm run prisma:db:seed

# Build the Next.js application
RUN npm run build

# Stage 3: Production image - only production dependencies and run the app
FROM node:18-slim AS runner
WORKDIR /app

ENV NODE_ENV production
# DATABASE_URL will be set by docker-compose via env_file (production.env) pointing to /app/prisma/dev.db

# Copy package.json and package-lock.json to install only production dependencies
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy built application from 'builder' stage
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public

# Copy the prisma directory which now includes the seeded dev.db and the schema
COPY --from=builder /app/prisma ./prisma

EXPOSE 3000

# Set the default command to start the Next.js application
CMD ["npm", "start"]
