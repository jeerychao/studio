# Firebase Studio

To get started, take a look at src/app/page.tsx.

# 前端 (Frontend):
Next.js (v14+)+React (v18+)+ShadCN UI+Tailwind CSS+TypeScript
# 后端 (Backend):
Next.js+Node.js+Prisma ORM+SQLite+Lucide React+Zod+React Hook Form+useCurrentUser Hook+Mock Data & Seeding

git clone <your-github-repository-url>
cd <your-project-directory>
检查文件： 确保上述提供的 Dockerfile、.dockerignore、production.env 文件已在您的项目根目录中创建，并且 docker-compose.yml 和 .gitignore 已按上述内容更新。

构建并运行容器： 在项目根目录下，运行以下命令：

docker-compose up --build -d
--build：强制 Docker Compose 重新构建镜像（在第一次运行时或 Dockerfile 更改后是必需的）。
-d：以分离模式（后台）运行容器。
构建过程可能需要一些时间，因为它会下载 Node.js 镜像、安装 npm 依赖、生成 Prisma Client、构建 Next.js 应用等。

查看容器日志 (可选)： 如果想查看容器启动日志或运行时日志（包括 Next.js 的输出），可以运行：

docker-compose logs -f ipam-app
按 Ctrl+C 停止查看日志。

访问应用程序： 一旦容器成功启动，您应该可以通过浏览器访问 http://localhost:3001 来查看您的应用程序。这是因为 docker-compose.yml 中将主机的 3001 端口映射到了容器的 3000 端口。

关于数据持久性 (SQLite dev.db)

当前方案：Dockerfile 会在构建镜像时创建并填充 prisma/dev.db。这意味着每次您重新构建镜像 (docker-compose up --build)，数据库都会重置为种子数据。这对于开发和测试通常是可以的。
运行时数据持久化：如果您希望在容器运行时对数据库所做的更改（例如，通过应用 UI 添加了新数据）在容器停止和重新创建后仍然保留，您需要使用 Docker Volume。docker-compose.yml 中已注释掉了相关部分。要启用它：
取消注释 docker-compose.yml 中的 volumes: 部分 (在服务定义下和文件末尾的卷定义)。
当您第一次使用 Volume 启动时，prisma/dev.db 可能不会自动从镜像复制到 Volume 中（这取决于 Docker 的行为）。您可能需要在第一次启动后，通过 docker-compose exec ipam-app npx prisma db push --skip-generate 和 docker-compose exec ipam-app npm run prisma:seed 来初始化 Volume 中的数据库。之后，数据将持久保存在 Volume (ipam_db_data) 中。
