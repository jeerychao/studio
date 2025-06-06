# Dockerfile
# Stage 1: Dependencies & Prisma Client Generation
FROM node:18-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json* ./
# Using --omit=dev for a smaller dependencies layer if devDependencies are not needed for 'prisma generate'
# If 'prisma generate' (triggered by postinstall) needs devDependencies, remove --omit=dev
RUN npm install --frozen-lockfile --omit=dev 

# Re-install devDependencies specifically for Prisma CLI if needed, or ensure Prisma is a regular dependency
# If Prisma CLI is used by scripts in package.json that are run here, it might be needed.
# For 'prisma generate' in postinstall, @prisma/client is a dependency, Prisma CLI is a devDependency.
# If 'npm install' without --omit=dev already ran prisma generate via postinstall, this might be redundant.
# Consider if 'prisma generate' needs to run here or if postinstall in the 'builder' stage is sufficient.

# Stage 2: Builder - Build the application and seed the database
FROM node:18-slim AS builder
WORKDIR /app

# Copy full node_modules from the 'dependencies' stage if it included devDependencies for build tools
# If 'dependencies' stage was --omit=dev, then copy package files and install all deps here.
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .

# Ensure all dependencies, including devDependencies like 'prisma' and 'ts-node', are installed for build/seed.
RUN npm install --frozen-lockfile

# Set DATABASE_URL for build time (prisma db push & seed)
ENV DATABASE_URL="file:/app/prisma/dev.db"

# Generate Prisma client (postinstall in dependencies might have done this, but explicit call ensures it)
RUN npx prisma generate

# Create and seed the database
# The --skip-generate flag is used because 'prisma generate' is run explicitly above or by postinstall
RUN echo "Pushing database schema to dev.db..."
RUN npm run prisma:db:push -- --skip-generate
RUN echo "Seeding database dev.db..."
RUN npm run prisma:db:seed
RUN echo "Listing contents of /app/prisma after seed:" && ls -la /app/prisma

# Build the Next.js application
RUN npm run build

# Stage 3: Runner - Production image
FROM node:18-slim AS runner
WORKDIR /app

# Set environment to production
ENV NODE_ENV production
# Expose the port the app runs on
EXPOSE 3000

# Create a non-root user and group
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy only production dependencies from the 'dependencies' stage (which had --omit=dev)
COPY --from=dependencies /app/node_modules ./node_modules 
# If 'dependencies' stage did not use --omit=dev, and you want a true prod-only node_modules:
# COPY package.json package-lock.json* ./
# RUN npm install --frozen-lockfile --omit=dev --ignore-scripts 

# Copy essential files from the builder stage
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public

# Copy the Prisma schema and the seeded database, and set correct ownership
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma

# Copy package.json to allow 'npm run start' to work
COPY package.json .

# Set the user to the non-root user
USER nextjs

# Command to run the application
CMD ["npm", "run", "start"]
