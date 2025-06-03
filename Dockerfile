# Dockerfile

# ---- Base Stage ----
FROM node:20-slim AS base
LABEL authors="Firebase Studio"
WORKDIR /app

# ---- Dependencies Stage ----
# Install all dependencies, including devDependencies needed for Prisma CLI and Next.js build.
FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm install

# ---- Source and Build Stage ----
# Copy source code and build the application.
# This stage will also prepare the Prisma client and the SQLite database.
FROM deps AS source
COPY . .

# Generate Prisma Client (postinstall script in package.json should also do this, but explicit is safer)
RUN npx prisma generate

# Ensure the database schema is applied (creates dev.db if not exists) and then seed it.
RUN npx prisma db push --skip-generate
RUN npm run prisma:seed # Assumes 'prisma:seed' script is defined in package.json

# Build the Next.js application for production
RUN npm run build

# ---- Production Runner Stage ----
# Create a lean production image
FROM node:20-slim AS runner
WORKDIR /app
ENV NODE_ENV production

# Copy package.json and package-lock.json to install only production dependencies
COPY --from=source /app/package.json ./package.json
COPY --from=source /app/package-lock.json* ./package-lock.json*
RUN npm install --omit=dev

# Copy built application artifacts from the 'source' stage
COPY --from=source /app/.next ./.next
COPY --from=source /app/public ./public

# Copy the prisma directory which includes schema.prisma and the seeded dev.db
COPY --from=source /app/prisma ./prisma

# Expose the port Next.js runs on (default 3000)
EXPOSE 3000

# Command to start the Next.js application
# The "start" script in package.json is typically "next start"
CMD ["npm", "start"]
