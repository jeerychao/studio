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

#其它部署方式
请按以上前后端要求安装依赖部署
