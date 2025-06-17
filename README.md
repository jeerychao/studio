# IPAM Lite: Linux 环境部署指南

## 1.环境需求

* 操作系统: 推荐 Ubuntu 22.04 LTS 或其他兼容的 Linux 发行版。
* 前端 (由 Next.js 提供服务):
* Node.js: v18.x 或 v20.x (与 Next.js 14 兼容)
* npm (通常随 Node.js 安装) 或 yarn
* 后端 (由 Next.js API Routes 和 Prisma 提供):
* Node.js: (同上)
* Prisma Client: (作为项目依赖安装)
* SQLite: 您的项目使用 SQLite，它通常作为 Node.js 进程的一部分运行，数据库文件需要相应的读写权限。

## 通用工具:
* Git: 用于克隆代码库。
* PM2 (或 systemd): 推荐用于进程管理，确保应用在后台持续运行并能自动重启。
* Nginx (或 Apache) (可选但强烈推荐用于生产): 作为反向代理，处理 SSL、负载均衡（如果需要）、服务静态资源等。
* 构建工具 (可能需要): 例如 build-essential，用于编译某些 npm 包的本地插件（尽管 Prisma 的预编译二进制文件通常能处理大部分情况）。

## 2.部署步骤


## 2.1 克隆代码库: git clone <your-repository-url>
## 2.2 安装 Node.js 和 npm/yarn: 提供 NodeSource 安装特定版本的示例。
## 2.3 安装项目依赖: npm install (或 yarn install)
## 2.4 设置环境变量:
* 创建 .env.production.local 文件。
关键变量: DATABASE_URL (指向 SQLite 文件路径，例如 file:./prisma/prod.db 或绝对路径), ENCRYPTION_KEY (非常重要，用于数据加密), NEXT_PUBLIC_BASE_URL。
* 提示 SQLite 文件路径的权限问题。
## 2.5 初始化和播种数据库 (Prisma):

```bash
npx prisma db push --skip-generate (创建数据库和表结构)
npm run prisma:db:seed (或 npx prisma db seed，填充初始数据)
```
## 2.6 构建应用: npm run build (构建 Next.js 生产版本)
## 2.7 使用 PM2 启动应用:
* 安装 PM2: sudo npm install pm2 -g
* 启动命令: pm2 start npm --name "ipam-app" -- run start
* PM2 常用命令 (list, logs, stop, restart, save, startup)。
## 2.8 配置反向代理 (Nginx - 可选示例):
安装 Nginx。
创建 Nginx 站点配置文件，包含 proxy_pass 到 Next.js 应用 (通常是 http://localhost:3000)。
配置静态资源服务以提高性能。
启用站点，测试并重启 Nginx。
SSL/HTTPS 设置建议 (例如使用 Certbot)。
应用更新流程

拉取最新代码。
安装/更新依赖。
运行数据库迁移 (如果 schema 有变动，例如 npx prisma migrate deploy)。
重新构建应用。
使用 PM2 重启应用。
故障排查提示

查看 PM2 日志。
查看 Nginx 日志。
检查文件权限。
核对环境变量。

# IPAM Lite: Docker 部署指南

* 先决条件

Docker Engine (提供安装链接或提示)
Docker Compose (提供安装链接或提示)
项目设置回顾 (基于现有文件)

## 2.1 克隆代码库 (如果尚未完成)
## 2.2 关键项目文件:
Dockerfile: 确认其用于构建包含前端 (Next.js) 和后端 (Node.js, Prisma) 的应用镜像。
docker-compose.yml: 用于服务编排。
.dockerignore: 排除不必要文件。
health-check.sh: 用于容器健康检查。
## 2.3 配置环境变量 (production.env):
强调在宿主机上创建 production.env 文件（与 docker-compose.yml 同级）。
关键变量:

```bash
DATABASE_URL="file:/app/prisma/dev.db" (指向容器内部的 SQLite 文件路径，与 Dockerfile 和卷挂载一致)。
ENCRYPTION_KEY="your_secure_64_character_hex_string_for_production" (使用您提供的或生成新的)。
NEXT_PUBLIC_BASE_URL="http://your_server_ip_or_domain:8081" (或您实际的访问 URL)。
```
提示 ENCRYPTION_KEY 的重要性。
使用 Docker Compose 构建和运行

## 3.1 构建并启动容器:
docker-compose up --build -d
解释 --build 和 -d 参数。
## 3.2 验证容器状态和日志:
docker-compose ps
docker-compose logs -f ipam-app
提及健康检查状态。
## 3.3 访问应用:
浏览器访问 http://<your_server_ip>:8081 (或 localhost:8081)。
数据持久化 (SQLite 数据库)

解释 docker-compose.yml 中 ipam_db_data:/app/prisma 卷的作用。
说明 Dockerfile 的 builder 阶段如何创建和播种 dev.db，并且这个种子数据库会包含在镜像中。
首次运行: 当 ipam_db_data 卷为空时，Docker 通常会用镜像中的 /app/prisma (包含种子 dev.db) 来填充它。
后续运行: 应用会使用卷中已有的数据。
重置数据库: 如果需要重置为初始种子状态，需要停止容器、删除卷 (docker volume rm ...)，然后重新 docker-compose up --build -d。
解释 ipam_logs_data:/app/logs 用于持久化日志。
管理应用

```bash
停止容器: docker-compose down
重启容器: docker-compose restart ipam-app
查看所有运行中容器: docker ps
更新应用

拉取最新代码。
重新构建镜像并重启服务: docker-compose up --build -d。
```

## 前后端技术栈信息整合:
* 前端: Next.js (v14+), React (v18+), ShadCN UI, Tailwind CSS, TypeScript
* 后端: Node.js (通过 Next.js 运行环境), Next.js (API Routes), Prisma ORM, SQLite

## 管理员密码重置脚本

本项目包含一个用于紧急情况下重置管理员账户密码的服务器端脚本。

**用途**:
当管理员忘记密码且无法通过常规方式恢复时，可以使用此脚本直接在服务器上重置密码。

**脚本位置**:
`scripts/reset-admin-password.ts`

**如何使用**:

1.  **访问服务器**: 通过 SSH 或其他方式登录到托管应用程序和数据库的服务器。
2.  **导航到项目目录**: `cd /path/to/your-ipam-lite-project`
3.  **确保环境就绪**:
    *   服务器上已安装 Node.js (版本需与项目兼容，如 v18.x 或 v20.x)。
    *   项目依赖已安装 (特别是 `typescript`, `ts-node`, `@prisma/client` 等)。如果是在生产服务器上首次运行，可能需要执行 `npm install` 或 `yarn install` 来安装包括 `devDependencies` 在内的依赖，因为 `ts-node` 和 `typescript` 通常是开发依赖。或者，您可以将脚本编译成 JavaScript 后再上传执行。
4.  **执行脚本**:
    推荐使用 `ts-node` (如果已安装并配置在 `package.json` 的 `devDependencies` 中):
    ```bash
    npx ts-node -P ./tsconfig.json scripts/reset-admin-password.ts
    ```
    或者，如果您已将 TypeScript 编译为 JavaScript (例如到 `dist/scripts` 目录):
    ```bash
    node dist/scripts/reset-admin-password.js
    ```
5.  **遵循提示**: 脚本会提示您输入：
    *   要重置密码的管理员账户的**邮箱地址**。
    *   新的管理员**密码**。
    *   再次输入新密码进行**确认**。

**安全警告**:

*   **高权限操作**: 此脚本直接修改数据库，绕过了常规的密码验证流程。
*   **仅限授权人员**: 只有完全受信任的系统管理员或运维人员才能执行此脚本。
*   **服务器访问控制**: 执行此脚本的前提是拥有对服务器文件系统和命令执行环境的访问权限。请确保您的服务器本身是安全的。
*   **脚本文件保护**: `scripts/reset-admin-password.ts` 文件应受到适当的文件权限保护，防止未授权的读取或执行。
*   **生产环境注意事项**: 在高度安全或受严格审计的生产环境中，应谨慎使用此类脚本。考虑在不使用时移除此脚本，或将其访问权限限制到最低程度。执行此类操作后，建议手动记录详细的审计条目。
*   **密码安全**: 通过脚本设置的新密码在输入过程中可能会显示在屏幕上或记录在命令行历史中。操作完成后请注意清理。

此脚本提供了一种在紧急情况下恢复管理员访问权限的方法，但务必在理解其潜在影响和安全要求的前提下使用。
