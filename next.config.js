/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone', // 添加独立输出支持
  experimental: {
    serverActions: true // 简化 server actions 配置
  },
  // 添加跨域支持
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Access-Control-Allow-Origin',
            value: '*',
          },
          {
            key: 'Access-Control-Allow-Methods',
            value: 'GET,POST,PUT,DELETE,OPTIONS',
          },
          {
            key: 'Access-Control-Allow-Headers',
            value: 'Content-Type, Authorization',
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;