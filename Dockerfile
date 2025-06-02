
# Stage 1: Build the application
FROM node:18-alpine AS builder
WORKDIR /app

# Copy package.json and package-lock.json (or yarn.lock if you use yarn)
COPY package*.json ./

# Install dependencies (including devDependencies needed for build)
# Using --omit=dev might be problematic if build scripts need devDependencies
# For a safer build, install all dependencies first.
RUN npm install

# Copy the rest of the application source code
COPY . .

# Set build-time arguments for environment variables if needed
# ARG NEXT_PUBLIC_GENKIT_API_KEY
# ENV NEXT_PUBLIC_GENKIT_API_KEY=$NEXT_PUBLIC_GENKIT_API_KEY

# Build the Next.js application
# This will generate the .next/standalone directory
RUN npm run build

# Stage 2: Create the production image
FROM node:18-alpine AS runner
WORKDIR /app

# Set environment variables for runtime
ENV NODE_ENV=production
# ENV GOOGLE_API_KEY="your_production_api_key_here" # Example for Genkit, pass at runtime or build arg

# Copy the standalone output from the builder stage
# This includes the server.js, minimal node_modules, .next/static, and public folders
COPY --from=builder /app/.next/standalone ./

# Expose the port the app runs on
EXPOSE 3000

# Set the user to run the app (optional, but good practice)
# Create a non-root user and group
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

# Command to run the application
# server.js is at the root of the /app directory in this stage due to the COPY command above
CMD ["node", "server.js"]
