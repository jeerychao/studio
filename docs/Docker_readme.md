Dockerfile：
使用 node:18-slim 作为基础镜像，这是一个相对较小的 Debian 发行版，与 Prisma 的 debian-openssl-3.0.x 二进制目标兼容。
dependencies 阶段：安装所有 npm 依赖并生成 Prisma Client。
builder 阶段：复制依赖，复制应用源码，然后非常重要地：
设置临时的 DATABASE_URL。
运行 npm run prisma:db:push -- --skip-generate 来根据 prisma/schema.prisma 创建 prisma/dev.db 数据库文件。
运行 npm run prisma:db:seed 来填充数据库。
运行 npm run build 来构建您的 Next.js 应用。
runner 阶段：这是最终的生产镜像。
仅安装生产 npm 依赖。
从 builder 阶段复制构建好的 .next 目录、public 目录以及包含已播种的 dev.db 的 prisma 目录。
NODE_ENV 设置为 production。
通过 docker-compose.yml 中的 env_file 设置运行时的 DATABASE_URL。
暴露端口 3000 并以 npm start 启动应用。
.dockerignore：确保不必要的本地文件（如 node_modules, .env）不会被复制到 Docker 构建上下文中，从而加快构建速度并减小镜像大小。
production.env：一个专门为 Docker 容器提供的环境变量文件。关键是设置 DATABASE_URL="file:/app/prisma/dev.db"，它告诉 Prisma Client 在容器内的 /app/prisma/ 目录中查找名为 dev.db 的 SQLite 文件。
docker-compose.yml：
简化了服务定义，使用 build: . 来从当前目录的 Dockerfile 构建。
使用 env_file 加载 production.env。
包含了一个注释掉的 volumes 部分。如果您希望在容器运行时对数据库进行的更改能够持久化（在容器被删除和重新创建后仍然保留），您可以取消注释它。但请注意，每次 docker-compose up --build 都会重新构建镜像，镜像中会包含全新的、由种子脚本填充的 dev.db。如果启用了 Volume，并且 Volume 已存在，它将优先于镜像中的内容。
2. 部署步骤

确保您已安装 Docker 和 Docker Compose： 在您的本地 Ubuntu 22.04 系统上。

获取代码： 从 GitHub 克隆您的项目（如果您还没有这样做）。

git clone <your-github-repository-url>
cd <your-project-directory>
检查文件： 确保您项目根目录中的 Dockerfile, .dockerignore, production.env, docker-compose.yml 和 .gitignore 文件已更新为我上面提供的内容。

构建并运行 Docker 容器： 在您项目的根目录下，打开终端并运行：

docker-compose up --build -d
--build：强制 Docker Compose 重新构建镜像。第一次运行时或更改了 Dockerfile/相关源文件后是必需的。
-d：以分离模式（后台）运行容器。 构建过程可能需要一些时间。
查看容器日志 (可选但推荐首次运行时查看)：

docker-compose logs -f ipam-app
这将显示容器的实时日志，包括 Next.js 应用的启动信息和任何潜在错误。按 Ctrl+C 停止查看。

访问应用程序： 一旦容器成功启动并且 Next.js 应用开始监听，您应该可以通过浏览器访问 http://localhost:3001 来查看您的应用程序。

关于数据库 (prisma/dev.db)：

此方案中，Dockerfile 的 builder 阶段会负责创建和播种 prisma/dev.db。这意味着您的 Docker 镜像本身将包含一个带有初始种子数据的数据库副本。
每次您使用 docker-compose up --build 重建镜像时，数据库都会被重置为最新的种子数据。这对于确保每次部署都有一个干净的、一致的初始状态非常有用。
如果您取消注释 docker-compose.yml 中的 volumes 部分来使用 Docker Volume，那么在容器运行时对数据库所做的更改将会持久化到该 Volume 中。但是，Volume 的优先级高于镜像中的文件。这意味着如果 Volume 中已有 dev.db，则会使用 Volume 中的版本；如果 Volume 是新创建的，它最初可能是空的，Docker 通常不会自动从镜像中复制文件到新的空 Volume 中，您可能需要额外的步骤来初始化 Volume 中的数据库，或者在第一次运行后，种子数据实际上是有效的。对于本地开发和测试，依赖镜像中烘焙的数据库通常更简单。
请按照这些步骤操作。
admin@example.com  admin
operator@example.com  operator
viewer@example.com viewer
