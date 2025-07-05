
# IPAM Lite: Linux 环境部署指南

本指南提供了在 Linux 服务器上直接部署 IPAM Lite 应用程序的说明。

## 1. 环境需求

在开始之前，请确保您的 Linux 服务器（例如 Ubuntu 22.04 LTS 或类似版本）满足以下要求：

*   **操作系统**: 推荐 Ubuntu 22.04 LTS 或其他兼容的 Linux 发行版。
*   **前端技术栈**:
    *   Next.js: v14+
    *   React: v18+
    *   ShadCN UI
    *   Tailwind CSS
    *   TypeScript
*   **后端技术栈**:
    *   Node.js: v18.x 或 v20.x (与 Next.js 14 兼容)。通过 Next.js 运行环境提供。
    *   Next.js API Routes: 用于后端逻辑。
    *   Prisma ORM: 用于数据库交互。
    *   SQLite: 作为应用程序的数据库。
*   **构建与运行环境**:
    *   npm (通常随 Node.js 安装) 或 yarn: 用于管理项目依赖。
*   **通用工具**:
    *   Git: 用于克隆应用程序代码库。
    *   PM2 (或 systemd): 强烈推荐用于进程管理，以确保应用程序在后台持续运行并能在发生故障时自动重启。
    *   反向代理 (可选但强烈推荐用于生产环境): Nginx 或 Apache，用于处理传入流量、SSL 终止、提供静态资源等。
    *   构建工具 (可能需要): 例如 `build-essential` (Debian/Ubuntu) 或等效的包组，用于编译某些 npm 包可能需要的本地插件（尽管 Prisma 的预编译二进制文件通常能覆盖大多数情况）。

## 2. 部署步骤

### 第 2.1 步：克隆代码库

将 IPAM Lite 应用程序代码库克隆到您的服务器：

```bash
git clone <your-repository-url>
cd <your-project-directory> # 例如 ipam-lite
```

### 第 2.2 步：安装 Node.js 和 npm/yarn

如果您的服务器上尚未安装 Node.js，您可以使用 NodeSource (推荐用于获取特定版本) 或您的 Linux 发行版的包管理器进行安装。

**使用 NodeSource (推荐方法):**
```bash
# 安装 Node.js 20.x (如果需要其他版本，请相应更改 setup_20.x)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```
验证安装：
```bash
node -v
npm -v
```

### 第 2.3 步：安装项目依赖

进入您的项目目录并安装依赖项：
```bash
npm install
# 或者，如果您使用 yarn:
# yarn install
```
此命令也会触发 `package.json` 中定义的 `postinstall` 脚本 (例如 `prisma generate`)。

### 第 2.4 步：设置环境变量

应用程序需要环境变量进行配置，尤其是在生产环境中。在项目根目录创建一个 `.env.production.local` 文件 (如果 Next.js 版本低于 14.0.0，可能需要使用 `.env.production`)。

**示例 `.env.production.local` 内容:**
```env
# 数据库 URL (SQLite 示例)
# 路径应该是绝对路径或相对于应用启动位置的路径。
# 对于 SQLite，请确保运行 Node.js 进程的用户对数据库文件及其目录具有写权限。
DATABASE_URL="file:./prisma/prod.db" # 或者一个绝对路径，例如 "file:/var/data/ipam-lite/prod.db"

# 加密密钥 (对安全至关重要 - 例如用户密码会使用此密钥加密)
# 生成一个安全的 64 位十六进制字符串:
# node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
ENCRYPTION_KEY="your_secure_64_character_hex_string_for_production"

# Next.js 公共基础 URL
# 替换为您的实际域名和端口（如果与默认不同）
NEXT_PUBLIC_BASE_URL="http://yourdomain.com" # 如果通过反向代理提供服务，请使用您的域名
# 如果没有反向代理且直接在自定义端口运行 (例如 PM2 监听 3000)，则可能是 http://your_server_ip:3000

# 应用监听端口 (必须与 PM2 或启动脚本中指定的端口一致)
PORT=3000 # Next.js 默认监听 3000 端口

# 可选：日志级别 (debug, info, warn, error - 未设置则默认为 info)
# LOG_LEVEL="info"
```

**重要安全提示:**
*   **`ENCRYPTION_KEY`**: 此密钥**至关重要**。如果丢失，加密的数据（如用户密码）将无法恢复。如果更改，现有的加密数据将变得不可读。请安全存储。
*   **`DATABASE_URL`**: 对于生产环境中的 SQLite，请确保路径正确，并且运行 Node.js 应用程序的进程对数据库文件及其所在目录具有写权限。

### 第 2.5 步：初始化和播种数据库 (Prisma)

1.  **将 Schema 推送到数据库**: 此命令会根据您的 `prisma/schema.prisma` 文件创建数据库文件（如果不存在）和表结构。
    ```bash
    npx prisma db push --skip-generate
    ```
    *(如果您在 `.env.production.local` 中使用了 `DATABASE_URL="file:./prisma/prod.db"`，则会在 `prisma` 目录下创建或更新 `prod.db` 文件。)*

2.  **播种数据库 (可选，但推荐用于初始设置)**:
    ```bash
    npm run prisma:db:seed
    # 或者
    # npx prisma db seed
    ```
    此命令会运行您项目中的 `prisma/seed.ts` 脚本来填充初始数据。

### 第 2.6 步：构建应用程序

为生产环境构建 Next.js 应用程序：
```bash
npm run build
```
这会在 `.next` 目录中创建一个优化的生产版本。

### 第 2.7 步：使用 PM2 启动应用程序

如果您尚未安装 PM2，请全局安装：
```bash
sudo npm install pm2 -g
```

使用 PM2 启动您的应用程序。`package.json` 中的 `start` 脚本是 `node .next/standalone/server.js`。
```bash
pm2 start npm --name "ipam-app" -- run start -- --port ${PORT:-3000}
```
*   `--name "ipam-app"`: 为您的 PM2 进程分配一个名称。
*   `-- run start`: 告诉 PM2 执行 `package.json` 中的 `start` 脚本。
*   `-- --port ${PORT:-3000}`: 将 PM2 环境变量中的 `PORT` (如果已在 PM2 ecosystem 文件中设置) 或默认的 3000 端口传递给 `npm run start` 命令。确保这与您在 `.env.production.local` 中设置的 `PORT` 环境变量一致，或者与 Next.js 默认监听的端口一致。

**常用的 PM2 命令:**
*   列出所有进程: `pm2 list`
*   查看特定应用的日志: `pm2 logs ipam-app`
*   停止应用: `pm2 stop ipam-app`
*   重启应用: `pm2 restart ipam-app`
*   删除应用: `pm2 delete ipam-app`
*   保存当前 PM2 进程列表，以便在服务器重启后自动恢复:
    ```bash
    pm2 save
    ```
*   生成并配置启动脚本，使 PM2 在系统启动时运行 (根据您的系统选择，例如 systemd):
    ```bash
    pm2 startup
    # 该命令会输出一条需要您以 root 权限执行的命令，例如：
    # sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u your_username --hp /home/your_username
    ```

### 第 2.8 步：配置反向代理 (Nginx - 可选但强烈推荐)

在生产环境中使用像 Nginx 这样的反向代理服务器有诸多好处：
*   处理 SSL/TLS 终止 (HTTPS)。
*   高效地提供静态资源。
*   进行负载均衡 (如果您有多个应用实例，本指南未覆盖)。
*   提供额外的安全层。

**Nginx 配置示例:**

1.  安装 Nginx:
    ```bash
    sudo apt update
    sudo apt install nginx
    ```

2.  为您的应用创建一个 Nginx 服务器块配置文件 (例如，`/etc/nginx/sites-available/ipam-lite`):
    ```nginx
    server {
        listen 80;
        server_name yourdomain.com www.yourdomain.com; # 替换为您的域名

        # 可选: 如果设置了 SSL，将 HTTP 重定向到 HTTPS
        # location / {
        #     return 301 https://$host$request_uri;
        # }

        # SSL 配置 (推荐使用 Let's Encrypt / Certbot)
        # listen 443 ssl http2; # 启用 HTTP/2
        # server_name yourdomain.com www.yourdomain.com;
        # ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
        # ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;
        # include /etc/letsencrypt/options-ssl-nginx.conf; # Certbot 推荐的 SSL 参数
        # ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem; # Diffie-Hellman 参数

        access_log /var/log/nginx/ipam-lite.access.log;
        error_log /var/log/nginx/ipam-lite.error.log;

        location / {
            proxy_pass http://localhost:3000; # 假设您的 Next.js 应用运行在 3000 端口
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade'; # 对于 WebSocket (如果 Next.js 将来使用)
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_cache_bypass $http_upgrade;
            proxy_redirect off;
        }

        # 直接从 Next.js 构建输出中提供静态文件以获得更好性能
        # 路径需要与您项目的实际部署路径匹配
        location ~ ^(/_next/static/|/static/) {
            root /path/to/your-project-directory; # 例如 /var/www/ipam-lite
            expires 1y; # 长时间缓存静态资源
            add_header Cache-Control "public, immutable";
            access_log off;
        }

        location ~ ^/images/ { # 或其他公共资源目录
            root /path/to/your-project-directory/public; # 例如 /var/www/ipam-lite/public
            expires 1d;
            add_header Cache-Control "public";
            access_log off;
        }
    }
    ```

3.  启用该站点配置并测试 Nginx 配置:
    ```bash
    sudo ln -s /etc/nginx/sites-available/ipam-lite /etc/nginx/sites-enabled/
    sudo nginx -t
    ```

4.  如果测试成功，重启 Nginx:
    ```bash
    sudo systemctl restart nginx
    ```

5.  **SSL (HTTPS)**: 对于生产应用，设置 SSL 至关重要。使用 Certbot 和 Let's Encrypt 可以轻松获取和续订 SSL 证书:
    ```bash
    sudo apt install certbot python3-certbot-nginx
    sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com # 替换为您的域名
    ```
    按照提示操作。Certbot 会自动修改您的 Nginx 配置以启用 SSL。

## 3. 应用更新流程

1.  进入您的项目目录: `cd /path/to/your-project-directory`
2.  拉取最新的代码: `git pull origin main` (或您的生产分支)
3.  安装或更新依赖: `npm install`
4.  应用数据库迁移 (如果有 schema 变更):
    *   对于生产环境，推荐使用: `npx prisma migrate deploy`
    *   如果只是添加字段或表，并且您确定操作安全: `npx prisma db push --skip-generate`
5.  重新构建应用程序: `npm run build`
6.  使用 PM2 重启应用程序: `pm2 restart ipam-app`

## 4. 故障排查提示

*   **PM2 日志**: `pm2 logs ipam-app` 会显示应用程序的输出和错误。
*   **Nginx 日志**: 检查 `/var/log/nginx/error.log` 和 `/var/log/nginx/access.log` (或您在 Nginx 配置中指定的路径) 以排查反向代理问题。
*   **文件权限**: 确保运行 Node.js 进程（和 PM2）的用户对项目文件具有读权限，对 SQLite 数据库文件及其目录以及任何日志目录具有写权限。
*   **环境变量**: 仔细检查所有必需的环境变量是否在您的 `.env.production.local` 文件或服务器环境中正确设置。

初始用户名和密码
admin@example.com  admin
operator@example.com  operator
viewer@example.com viewer

本指南提供了全面的概述。请根据您的 Linux 发行版和具体设置调整文件路径和命令。
