
# IPAM Lite: Docker 部署指南

本指南提供了使用 Docker 和 Docker Compose 部署 IPAM Lite 应用程序的说明。这通常是实现一致且隔离部署的推荐方法。

## 1. 先决条件

在开始之前，请确保您的系统已安装以下软件：

*   **Docker Engine**: 从 [Docker 官方文档](https://docs.docker.com/engine/install/) 安装 Docker。
*   **Docker Compose**: 从 [Docker Compose 官方文档](https://docs.docker.com/compose/install/) 安装 Docker Compose (v1 或 v2)。

验证安装：
```bash
docker --version
docker-compose --version # 或者对于 Docker Compose V2： docker compose version
```

## 2. 项目设置回顾

### 第 2.1 步：克隆代码库

如果您尚未克隆 IPAM Lite 应用程序的 Git 代码库，请执行此操作：
```bash
git clone <your-repository-url>
cd <your-project-directory> # 例如：ipam-lite
```

### 第 2.2 步：Docker 部署的关键项目文件

您的项目应包含以下对 Docker 部署至关重要的文件：

*   `Dockerfile`: 定义如何为应用程序构建 Docker 镜像。
*   `docker-compose.yml`: 定义使用 Docker Compose 运行应用程序的服务、网络和卷。
*   `.dockerignore`: 指定从 Docker 构建上下文中排除的文件和目录。
*   `health-check.sh`: (如果使用) 用于容器健康检查的脚本。

### 第 2.3 步：配置环境变量 (`production.env`)

在您**部署 Docker 的服务器上，与 `docker-compose.yml` 文件同级**（或 `docker-compose.yml` 中 `env_file` 指向的路径）创建一个名为 `production.env` 的文件。此文件将由 `docker-compose.yml` 用于向您的应用程序容器提供环境变量。

**`production.env` 示例内容:**
```env
# 数据库 URL (容器内的 SQLite)
# Dockerfile 会将 prisma 目录复制到 /app/prisma，
# 因此容器内部的路径是相对于 /app 的。
# 确保此文件名 (dev.db 或 prod.db) 与 Dockerfile 中生成和复制的数据库文件名一致。
# Dockerfile runner 阶段的默认是 dev.db，卷也会持久化这个文件。
DATABASE_URL="file:/app/prisma/dev.db"

# 加密密钥 (对安全至关重要！)
# 使用您在本地 .env 文件中已有的安全密钥，或生成一个新的:
# node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
ENCRYPTION_KEY="your_secure_64_character_hex_string_for_production" # 替换为您的实际密钥

# Next.js 公共基础 URL
# 这应该是用户访问您应用程序的 URL。
# 对于服务器操作、重定向和 API 调用非常重要。
# docker-compose.yml 中有默认值，但最好在此明确设置。
# 例如，通过主机8081端口访问:
NEXT_PUBLIC_BASE_URL="http://your_server_ip_or_domain:8081"
# 如果在 Docker 前面使用处理 SSL 的反向代理:
# NEXT_PUBLIC_BASE_URL="https://yourdomain.com"

# Next.js 应用在容器内监听的端口 (已在 Dockerfile 和 docker-compose.yml 中设置)
# PORT=3000

# 可选：日志级别 (debug, info, warn, error - 未设置则默认为 info)
# LOG_LEVEL="info"
```

**关于 `production.env` 的重要说明:**
*   **`DATABASE_URL`**: `docker-compose.yml` 配置为挂载一个卷用于持久化 `/app/prisma` 目录。路径 `file:/app/prisma/dev.db` 指向容器内的此位置。确保此文件名与您在 Dockerfile 中实际创建和播种的 SQLite 文件名一致（当前 Dockerfile 生成 `dev.db`）。
*   **`ENCRYPTION_KEY`**: **此密钥至关重要。** 在生产环境中使用一个强大且唯一的密钥。
*   **`NEXT_PUBLIC_BASE_URL`**: 确保此 URL 准确反映用户将如何访问应用程序。`docker-compose.yml` 会尝试默认为基于 8081 端口的 URL（如果未设置），但显式配置更佳。

### 第 2.4 步：技术栈回顾

部署环境需要支持以下技术栈：
*   **前端**: Next.js (v14+), React (v18+), ShadCN UI, Tailwind CSS, TypeScript
*   **后端**: Node.js (通过 Next.js 运行环境), Next.js (API Routes), Prisma ORM, SQLite

## 3. 使用 Docker Compose 构建和运行

### 第 3.1 步：构建并启动容器

导航到您项目的根目录 (包含 `docker-compose.yml` 文件的位置) 并运行：
```bash
docker-compose up --build -d
```
*   `--build`: 强制 Docker Compose 重新构建镜像。首次运行或更改了 `Dockerfile` 或影响镜像的应用代码后，此参数是必需的。
*   `-d`: 以分离模式 (在后台) 运行容器。

构建过程可能需要一些时间，尤其是在首次运行时，因为它会下载 Node.js 基础镜像、安装 npm 依赖、生成 Prisma Client 并构建 Next.js 应用程序。

### 第 3.2 步：验证容器状态和日志

检查容器是否正在运行：
```bash
docker-compose ps
```
您应该能看到 `ipam-app` 服务正在运行。

查看应用程序日志 (包括 Next.js 输出和任何错误)：
```bash
docker-compose logs -f ipam-app
```
按 `Ctrl+C` 停止查看日志。

`docker-compose.yml` 中还包含一个健康检查。您可以通过 `docker ps` 查看容器的健康状态 (查看 `STATUS` 列，可能会显示 `(healthy)`)。

### 第 3.3 步：访问应用程序

一旦容器运行正常且健康，您应该可以在浏览器中访问 IPAM Lite 应用程序。

`docker-compose.yml` 将您宿主机的 `8081` 端口映射到容器内的 `3000` 端口：
```yaml
    ports:
      - "8081:3000" # 宿主机端口 8081 映射到容器端口 3000
```
因此，您通常可以通过 `http://<your_server_ip>:8081` 或 `http://localhost:8081` (如果在本地机器上运行) 访问它。
如果您将 `NEXT_PUBLIC_BASE_URL` 配置为一个域名，并且有一个反向代理指向端口 8081，请使用该域名。

## 4. 数据持久化 (SQLite 数据库)

`docker-compose.yml` 定义了一个名为 `ipam_db_data` 的 Docker 卷来持久化 SQLite 数据库：
```yaml
volumes:
  ipam_db_data: # 为数据库定义一个命名卷
  ipam_logs_data: # 为日志定义一个命名卷
services:
  ipam-app:
    # ...
    volumes:
      - ipam_db_data:/app/prisma # 将 ipam_db_data 卷挂载到容器内的 /app/prisma
      - ipam_logs_data:/app/logs # 将 ipam_logs_data 卷挂载到容器内的 /app/logs
```
这意味着即使您停止并移除容器 (`docker-compose down`)，位于容器内 `/app/prisma` 的 `dev.db` (或您在 `DATABASE_URL` 中指定的数据库文件名) 中的数据也将保留在 `ipam_db_data` 卷中。当您再次运行 `docker-compose up` 时，将使用现有数据。

**在 Docker 中使用 SQLite 的重要注意事项：**
*   `Dockerfile` 的 `builder` 阶段会运行 `prisma db push` 和 `prisma db seed`。这意味着 Docker *镜像本身* 将包含一个带有初始种子数据的 `dev.db` 副本。
*   **首次运行 `docker-compose up` 且 `ipam_db_data` 卷为空时**：Docker 通常会用镜像中 `/app/prisma` 目录的内容 (即包含已播种的 `dev.db`) 来填充新的卷。因此，您的播种数据库应该立即可用。
*   **后续运行**: `ipam_db_data` 卷将优先，应用程序将使用卷中的数据库文件，从而保留运行时所做的任何更改。
*   如果您在卷已创建并填充数据后，明确希望**将数据库重置为初始种子状态**，您需要：
    1.  停止容器: `docker-compose down`
    2.  移除命名卷: `docker volume rm <your_project_directory_name>_ipam_db_data` (例如 `ipam-lite_ipam_db_data` - 使用 `docker volume ls` 查找确切名称)。
    3.  重新启动容器: `docker-compose up --build -d`。这将重新创建卷并再次从镜像中填充它。

## 5. 管理应用程序

*   **停止容器**:
    ```bash
    docker-compose down
    ```
    此命令会停止并移除 `docker-compose.yml` 中定义的容器。如果您还想移除命名卷 (如 `ipam_db_data`)，请添加 `-v` 参数，但请小心，因为这会删除数据。

*   **重启容器**:
    ```bash
    docker-compose restart ipam-app
    ```

*   **查看所有正在运行的容器**:
    ```bash
    docker ps
    ```

## 6. 更新应用程序

1.  导航到您的项目目录: `cd /path/to/your-project-directory`
2.  从您的 Git 代码库拉取最新的更改: `git pull origin main` (或您的生产分支)
3.  重新构建 Docker 镜像并重启服务:
    ```bash
    docker-compose up --build -d
    ```
    此命令将：
    *   如果 `Dockerfile` 或相关的源文件已更改，则重新构建 `ipam-app` 镜像。
    *   如果镜像已更改或 `docker-compose.yml` 中的容器配置已更改，则重新创建并重启容器。

此过程可确保您的部署使用最新的代码和 `Dockerfile` 中定义的依赖项进行更新。

初始用户名和密码
admin@example.com  admin
operator@example.com  operator
viewer@example.com viewer
