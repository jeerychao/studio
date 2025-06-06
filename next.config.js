/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      allowedOrigins: [
        "http://17.100.100.253:8081",
        "http://17.100.100.253:3010",
        "http://localhost:3000",
        "http://localhost:3010",
      ],
    },
  },
  output: 'standalone', // Optimizes Docker builds by outputting a minimal server
};

module.exports = nextConfig;
