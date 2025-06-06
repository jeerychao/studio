/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
      allowedForwardedHosts: ['17.100.100.253:3010'], // Specific forwarded host
      allowedOrigins: [
        'http://17.100.100.253:8081', // Actual browser origin
        'http://17.100.100.253:3010'  // Next.js perceived self-origin
      ]
    }
  },
  // 禁用客户端缓存以解决 CacheStore 错误 (根据您之前的请求保留)
  cache: false,
  headers: async () => {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET, POST, PUT, DELETE, OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'X-Forwarded-Host, X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization' },
          // 禁用客户端缓存
          { key: 'Cache-Control', value: 'no-store, no-cache, must-revalidate, proxy-revalidate' },
          { key: 'Pragma', value: 'no-cache' },
          { key: 'Expires', value: '0' }
        ]
      }
    ];
  }
};

module.exports = nextConfig;
