
# IPAM Lite: Linux Environment Deployment Guide

This guide provides instructions for deploying the IPAM Lite application directly onto a Linux server.

## 1. Environment Requirements

Before you begin, ensure your Linux server (e.g., Ubuntu 22.04 LTS or similar) meets the following requirements:

*   **Node.js**: Version 18.x or 20.x (as recommended for Next.js 14).
*   **npm** (usually comes with Node.js) or **yarn**: For managing project dependencies.
*   **Git**: For cloning the application repository.
*   **PM2** (or another process manager like systemd): Recommended for keeping the application running in the background and managing restarts.
*   **Reverse Proxy (Optional but Highly Recommended for Production)**: Nginx or Apache to handle incoming traffic, SSL termination, and serve static assets.
*   **Build Essentials**: You might need `build-essential` (or equivalent) for compiling some npm native addon dependencies, although Prisma's precompiled binaries often cover this.

## 2. Deployment Steps

### Step 2.1: Clone the Repository

Clone your IPAM Lite application repository to your server:

```bash
git clone <your-repository-url>
cd <your-project-directory> # e.g., ipam-lite
```

### Step 2.2: Install Node.js and npm/yarn

If Node.js is not already installed, you can install it using NodeSource or your distribution's package manager.

**Using NodeSource (Recommended for specific versions):**

```bash
# For Node.js 20.x (replace 20.x with 18.x if needed)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

Verify installation:

```bash
node -v
npm -v
```

### Step 2.3: Install Project Dependencies

Navigate to your project directory and install the dependencies:

```bash
npm install
# or if you prefer yarn:
# yarn install
```

This will also trigger the `postinstall` script which runs `prisma generate`.

### Step 2.4: Set Up Environment Variables

The application requires environment variables for configuration, especially for production. Create a `.env.production.local` file (or just `.env` if you manage environments differently) in the root of your project directory.

**Example `.env.production.local`:**

```env
# Database URL (SQLite example)
# The path should be absolute or relative to where the app starts.
# For SQLite, ensure the directory is writable by the user running the Node.js process.
DATABASE_URL="file:./prisma/prod.db" # Or an absolute path like "file:/var/data/ipam-lite/prod.db"

# Encryption Key (CRITICAL for security - passwords are encrypted with this)
# Generate a secure 64-character hex string:
# node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
ENCRYPTION_KEY="your_secure_64_character_hex_string_here"

# Next.js public base URL
# Replace with your actual domain and port if different
NEXT_PUBLIC_BASE_URL="http://yourdomain.com" # Or http://localhost:3000 if running locally without reverse proxy on default port

# Authentication settings (if using NextAuth - for this app, primarily NEXT_PUBLIC_BASE_URL is key for actions)
# NEXTAUTH_URL=${NEXT_PUBLIC_BASE_URL} # Uncomment and adjust if NextAuth is added
# NEXTAUTH_SECRET="your_nextauth_secret_here" # Uncomment and set if NextAuth is added

# Logging Level (optional: debug, info, warn, error - defaults to info if not set)
# LOG_LEVEL="info"

# Port the Next.js app will listen on (must match PM2 or start script if specified there)
PORT=3000 # Default is 3000
```

**Important Security Notes:**

*   **`ENCRYPTION_KEY`**: This key is **critical**. If lost, encrypted data (like user passwords) cannot be recovered. If changed, existing encrypted data will become unreadable. Store it securely.
*   **`DATABASE_URL`**: For SQLite in production, ensure the path is correct and the Node.js process has write permissions to the database file and its directory.

### Step 2.5: Initialize and Seed the Database (Prisma)

1.  **Push Schema to Database**: This creates the database file (if it doesn't exist) and the tables based on your `prisma/schema.prisma`.
    ```bash
    npx prisma db push --skip-generate
    ```
    *(If you used `DATABASE_URL="file:./prisma/prod.db"`, a `prod.db` file will be created in the `prisma` directory).*

2.  **Seed the Database (Optional but Recommended for initial setup)**:
    ```bash
    npm run prisma:db:seed
    # or
    # npx prisma db seed
    ```
    This runs your `prisma/seed.ts` script.

### Step 2.6: Build the Application

Build the Next.js application for production:

```bash
npm run build
```

This will create an optimized production build in the `.next` directory.

### Step 2.7: Start the Application with PM2

Install PM2 globally if you haven't already:

```bash
sudo npm install pm2 -g
```

Start your application using PM2. The `npm run start` script in your `package.json` is `node .next/standalone/server.js`.

```bash
pm2 start npm --name "ipam-app" -- run start
```

*   `--name "ipam-app"`: Assigns a name to your process in PM2.
*   `-- run start`: Tells PM2 to execute the `start` script from your `package.json`.

**PM2 Commands:**

*   List processes: `pm2 list`
*   Monitor logs: `pm2 logs ipam-app`
*   Stop process: `pm2 stop ipam-app`
*   Restart process: `pm2 restart ipam-app`
*   Delete process: `pm2 delete ipam-app`
*   Save current process list to run on server reboot:
    ```bash
    pm2 startup
    # (Follow instructions provided by the command, it might look like: sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u your_username --hp /home/your_username)
    pm2 save
    ```

### Step 2.8: Configure Reverse Proxy (Nginx - Optional)

Using a reverse proxy like Nginx is highly recommended for production to:

*   Handle SSL/TLS termination (HTTPS).
*   Serve static assets efficiently.
*   Load balance (if you have multiple instances, though not covered here).
*   Provide an additional layer of security.

**Example Nginx Configuration:**

1.  Install Nginx:
    ```bash
    sudo apt update
    sudo apt install nginx
    ```

2.  Create an Nginx server block configuration file for your application (e.g., `/etc/nginx/sites-available/ipam-lite`):

    ```nginx
    server {
        listen 80;
        server_name yourdomain.com www.yourdomain.com; # Replace with your domain

        # Optional: Redirect HTTP to HTTPS (if you set up SSL)
        # location / {
        #     return 301 https://$host$request_uri;
        # }

        # For SSL setup (using Let's Encrypt / Certbot is recommended)
        # listen 443 ssl;
        # server_name yourdomain.com www.yourdomain.com;
        # ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
        # ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;
        # include /etc/letsencrypt/options-ssl-nginx.conf;
        # ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

        location / {
            proxy_pass http://localhost:3000; # Assumes your Next.js app runs on port 3000
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_cache_bypass $http_upgrade;
        }

        # Serve static files directly from Next.js build output for better performance
        location ~ ^/_next/static/ {
            alias <path_to_your_project>/.next/static/; # e.g., /var/www/ipam-lite/.next/static/
            expires 1y; # Cache static assets for a long time
            access_log off;
            add_header Cache-Control "public";
        }

        location ~ ^/images/ { # Or any other public assets
            alias <path_to_your_project>/public/images/; # e.g., /var/www/ipam-lite/public/images/
            expires 1d;
            access_log off;
            add_header Cache-Control "public";
        }
    }
    ```

3.  Enable the site and test Nginx configuration:
    ```bash
    sudo ln -s /etc/nginx/sites-available/ipam-lite /etc/nginx/sites-enabled/
    sudo nginx -t
    ```

4.  If the test is successful, restart Nginx:
    ```bash
    sudo systemctl restart nginx
    ```

5.  **SSL (HTTPS)**: It's crucial to set up SSL for a production application. Use Certbot with Let's Encrypt to easily obtain and renew SSL certificates:
    ```bash
    sudo apt install certbot python3-certbot-nginx
    sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
    ```
    Follow the prompts. Certbot will modify your Nginx configuration for SSL.

## 3. Updating the Application

1.  Navigate to your project directory: `cd /path/to/your-project-directory`
2.  Pull the latest changes: `git pull origin main` (or your production branch)
3.  Install/update dependencies: `npm install`
4.  Apply database migrations (if any): `npx prisma migrate deploy` (safer for production than `db push`)
    *   Alternatively, if you only add fields or tables and are sure: `npx prisma db push --skip-generate`
5.  Rebuild the application: `npm run build`
6.  Restart the application with PM2: `pm2 restart ipam-app`

## 4. Troubleshooting

*   **PM2 Logs**: `pm2 logs ipam-app` will show application output and errors.
*   **Nginx Logs**: Check `/var/log/nginx/error.log` and `/var/log/nginx/access.log` for reverse proxy issues.
*   **Permissions**: Ensure the user running the Node.js process (and PM2) has read access to project files and write access to the SQLite database file and its directory, and any log directories.
*   **Environment Variables**: Double-check that all required environment variables are set correctly in your `.env.production.local` or server environment.

This guide provides a comprehensive overview. Adapt file paths and specific commands to your Linux distribution and setup.
        