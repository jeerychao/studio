
# IPAM Lite: Docker Deployment Guide

This guide provides instructions for deploying the IPAM Lite application using Docker and Docker Compose. This is generally the recommended method for consistent and isolated deployments.

## 1. Prerequisites

Before you begin, ensure your system has the following installed:

*   **Docker Engine**: Install Docker from the [official Docker documentation](https://docs.docker.com/engine/install/).
*   **Docker Compose**: Install Docker Compose from the [official Docker documentation](https://docs.docker.com/compose/install/).

Verify installations:
```bash
docker --version
docker-compose --version # or 'docker compose version' for newer syntax
```

## 2. Project Setup

### Step 2.1: Clone the Repository

If you haven't already, clone your IPAM Lite application repository:
```bash
git clone <your-repository-url>
cd <your-project-directory> # e.g., ipam-lite
```

### Step 2.2: Key Project Files for Docker Deployment

Your project should contain the following files crucial for Docker deployment:

*   `Dockerfile`: Defines how to build the Docker image for the application.
*   `docker-compose.yml`: Defines the services, networks, and volumes for running the application with Docker Compose.
*   `.dockerignore`: Specifies files and directories to exclude from the Docker build context.
*   `production.env` (You might need to create or populate this): An environment file for production-specific variables.

### Step 2.3: Configure Environment Variables (`production.env`)

Create a file named `production.env` in the root of your project directory. This file will be used by `docker-compose.yml` to supply environment variables to your application container.

**Example `production.env`:**
```env
# Database URL (SQLite within the container)
# The Dockerfile copies the prisma directory to /app/prisma,
# so the path inside the container will be relative to /app.
DATABASE_URL="file:/app/prisma/prod.db" # Docker volume will persist this

# Encryption Key (CRITICAL for security)
# Generate a secure 64-character hex string:
# node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
ENCRYPTION_KEY="your_secure_64_character_hex_string_for_production"

# Next.js Public Base URL
# This should be the URL users will use to access your application.
# It's important for server actions, redirects, and API calls.
# The docker-compose.yml has defaults but it's best to set it explicitly.
# Example for access on port 8081 of the host machine:
NEXT_PUBLIC_BASE_URL="http://your_server_ip_or_domain:8081"
# If using a reverse proxy in front of Docker that handles SSL:
# NEXT_PUBLIC_BASE_URL="https://yourdomain.com"

# Port Next.js will listen on *inside* the container (already set in Dockerfile and docker-compose.yml)
# PORT=3000

# Logging Level (optional: debug, info, warn, error - defaults to info)
# LOG_LEVEL="info"

# If you add NextAuth in the future, include its variables here:
# NEXTAUTH_URL=${NEXT_PUBLIC_BASE_URL}
# NEXTAUTH_SECRET="your_very_secure_nextauth_secret_for_production"
```

**Important Notes on `production.env`:**
*   **`DATABASE_URL`**: The `docker-compose.yml` is configured to mount a volume for `prisma/prod.db`. The path `file:/app/prisma/prod.db` points to this location *inside the container*.
*   **`ENCRYPTION_KEY`**: **This is critical.** Use a strong, unique key for production.
*   **`NEXT_PUBLIC_BASE_URL`**: Ensure this accurately reflects how users will access the application. The `docker-compose.yml` tries to default this based on port 8081 if not set, but explicit configuration is better.

## 3. Building and Running with Docker Compose

### Step 3.1: Build and Start Containers

Navigate to the root of your project directory (where `docker-compose.yml` is located) and run:

```bash
docker-compose up --build -d
```

*   `--build`: Forces Docker Compose to rebuild the image. This is necessary on the first run or if you've changed `Dockerfile` or application code that affects the image.
*   `-d`: Runs the containers in detached mode (in the background).

The build process might take some time, especially on the first run, as it downloads the Node.js base image, installs npm dependencies, generates Prisma Client, and builds the Next.js application.

### Step 3.2: Verify Container Status and Logs

Check if the container is running:
```bash
docker-compose ps
```
You should see the `ipam-app` service running.

View the application logs (including Next.js output and any errors):
```bash
docker-compose logs -f ipam-app
```
Press `Ctrl+C` to stop viewing logs.

The `docker-compose.yml` also includes a health check. You can check the container's health status via `docker ps` (look for the `STATUS` column, which might show `(healthy)`).

### Step 3.3: Accessing the Application

Once the container is running and healthy, you should be able to access the IPAM Lite application in your browser.

The `docker-compose.yml` maps port `8081` on your host machine to port `3000` inside the container:
```yaml
    ports:
      - "8081:3000" # Host port 8081 mapped to container port 3000
```
So, you would typically access it via: `http://<your_server_ip>:8081` or `http://localhost:8081` if running on your local machine.
If you configured `NEXT_PUBLIC_BASE_URL` to a domain and have a reverse proxy pointing to port 8081, use that domain.

## 4. Data Persistence (SQLite Database)

The `docker-compose.yml` defines a named Docker volume `ipam_db_data` to persist the SQLite database:
```yaml
volumes:
  ipam_db_data: # Defines a named volume for the database
  ipam_logs_data: # Defines a named volume for logs
services:
  ipam-app:
    # ...
    volumes:
      - ipam_db_data:/app/prisma
      - ipam_logs_data:/app/logs
```
This means that even if you stop and remove the container (`docker-compose down`), the data in `prod.db` (located at `/app/prisma` inside the container) will be preserved in the `ipam_db_data` volume. When you run `docker-compose up` again, the existing data will be used.

**Important Considerations for SQLite in Docker:**
*   The `Dockerfile`'s `builder` stage runs `prisma db push` and `prisma db seed`. This means the Docker *image itself* will contain a version of `prod.db` with the initial seed data.
*   **On the very first run of `docker-compose up` with an empty `ipam_db_data` volume**: Docker typically populates the new volume with the contents from the image's `/app/prisma` directory. So, your seeded database should be available.
*   **On subsequent runs**: The `ipam_db_data` volume will take precedence, and the application will use the database file from the volume, preserving any changes made during runtime.
*   If you explicitly want to **reset the database to the initial seed state** after the volume has been created and populated, you would need to:
    1.  Stop the containers: `docker-compose down`
    2.  Remove the named volume: `docker volume rm <your_project_directory_name>_ipam_db_data` (e.g., `ipam-lite_ipam_db_data` - use `docker volume ls` to find the exact name).
    3.  Restart the containers: `docker-compose up --build -d`. This will recreate the volume and populate it from the image again.

## 5. Managing the Application

*   **Stop Containers**:
    ```bash
    docker-compose down
    ```
    This stops and removes the containers defined in `docker-compose.yml`. Add `-v` if you also want to remove named volumes (like `ipam_db_data`), but be careful as this deletes data.

*   **Restart Containers**:
    ```bash
    docker-compose restart ipam-app
    ```

*   **View all running containers**:
    ```bash
    docker ps
    ```

## 6. Updating the Application

1.  Navigate to your project directory: `cd /path/to/your-project-directory`
2.  Pull the latest changes from your Git repository: `git pull origin main` (or your production branch)
3.  Rebuild the Docker image and restart the service:
    ```bash
    docker-compose up --build -d
    ```
    This command will:
    *   Rebuild the `ipam-app` image if `Dockerfile` or related source files have changed.
    *   Recreate and restart the container if the image has changed or if the container configuration in `docker-compose.yml` has changed.

This process ensures your deployment is updated with the latest code and dependencies as defined in your `Dockerfile`.
        