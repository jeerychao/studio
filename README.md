#IPAM Lite: Linux 环境部署指南

环境需求

操作系统: 推荐 Ubuntu 22.04 LTS 或其他兼容的 Linux 发行版。
前端 (由 Next.js 提供服务):
Node.js: v18.x 或 v20.x (与 Next.js 14 兼容)
npm (通常随 Node.js 安装) 或 yarn
后端 (由 Next.js API Routes 和 Prisma 提供):
Node.js: (同上)
Prisma Client: (作为项目依赖安装)
SQLite: 您的项目使用 SQLite，它通常作为 Node.js 进程的一部分运行，数据库文件需要相应的读写权限。
通用工具:
Git: 用于克隆代码库。
PM2 (或 systemd): 推荐用于进程管理，确保应用在后台持续运行并能自动重启。
Nginx (或 Apache) (可选但强烈推荐用于生产): 作为反向代理，处理 SSL、负载均衡（如果需要）、服务静态资源等。
构建工具 (可能需要): 例如 build-essential，用于编译某些 npm 包的本地插件（尽管 Prisma 的预编译二进制文件通常能处理大部分情况）。
部署步骤

2.1 克隆代码库: git clone <your-repository-url>
2.2 安装 Node.js 和 npm/yarn: 提供 NodeSource 安装特定版本的示例。
2.3 安装项目依赖: npm install (或 yarn install)
2.4 设置环境变量:
创建 .env.production.local 文件。
关键变量: DATABASE_URL (指向 SQLite 文件路径，例如 file:./prisma/prod.db 或绝对路径), ENCRYPTION_KEY (非常重要，用于数据加密), NEXT_PUBLIC_BASE_URL。
提示 SQLite 文件路径的权限问题。
2.5 初始化和播种数据库 (Prisma):
npx prisma db push --skip-generate (创建数据库和表结构)
npm run prisma:db:seed (或 npx prisma db seed，填充初始数据)
2.6 构建应用: npm run build (构建 Next.js 生产版本)
2.7 使用 PM2 启动应用:
安装 PM2: sudo npm install pm2 -g
启动命令: pm2 start npm --name "ipam-app" -- run start
PM2 常用命令 (list, logs, stop, restart, save, startup)。
2.8 配置反向代理 (Nginx - 可选示例):
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

#IPAM Lite: Docker 部署指南

先决条件

Docker Engine (提供安装链接或提示)
Docker Compose (提供安装链接或提示)
项目设置回顾 (基于现有文件)

2.1 克隆代码库 (如果尚未完成)
2.2 关键项目文件:
Dockerfile: 确认其用于构建包含前端 (Next.js) 和后端 (Node.js, Prisma) 的应用镜像。
docker-compose.yml: 用于服务编排。
.dockerignore: 排除不必要文件。
health-check.sh: 用于容器健康检查。
2.3 配置环境变量 (production.env):
强调在宿主机上创建 production.env 文件（与 docker-compose.yml 同级）。
关键变量:
DATABASE_URL="file:/app/prisma/dev.db" (指向容器内部的 SQLite 文件路径，与 Dockerfile 和卷挂载一致)。
ENCRYPTION_KEY="your_secure_64_character_hex_string_for_production" (使用您提供的或生成新的)。
NEXT_PUBLIC_BASE_URL="http://your_server_ip_or_domain:8081" (或您实际的访问 URL)。
提示 ENCRYPTION_KEY 的重要性。
使用 Docker Compose 构建和运行

3.1 构建并启动容器:
docker-compose up --build -d
解释 --build 和 -d 参数。
3.2 验证容器状态和日志:
docker-compose ps
docker-compose logs -f ipam-app
提及健康检查状态。
3.3 访问应用:
浏览器访问 http://<your_server_ip>:8081 (或 localhost:8081)。
数据持久化 (SQLite 数据库)

解释 docker-compose.yml 中 ipam_db_data:/app/prisma 卷的作用。
说明 Dockerfile 的 builder 阶段如何创建和播种 dev.db，并且这个种子数据库会包含在镜像中。
首次运行: 当 ipam_db_data 卷为空时，Docker 通常会用镜像中的 /app/prisma (包含种子 dev.db) 来填充它。
后续运行: 应用会使用卷中已有的数据。
重置数据库: 如果需要重置为初始种子状态，需要停止容器、删除卷 (docker volume rm ...)，然后重新 docker-compose up --build -d。
解释 ipam_logs_data:/app/logs 用于持久化日志。
管理应用

停止容器: docker-compose down
重启容器: docker-compose restart ipam-app
查看所有运行中容器: docker ps
更新应用

拉取最新代码。
重新构建镜像并重启服务: docker-compose up --build -d。
前后端技术栈信息整合:



