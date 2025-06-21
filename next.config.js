/** @type {import('next').NextConfig} */

// Prepare the allowed origins for development, primarily for Next.js Fast Refresh.
const allowedDevOrigins = [];
if (process.env.NEXT_PUBLIC_BASE_URL) {
    allowedDevOrigins.push(process.env.NEXT_PUBLIC_BASE_URL);
}

const nextConfig = {
  output: 'standalone',
  async headers() {
    return [
      {
        source: "/api/:path*",
        headers: [
          { key: "Access-Control-Allow-Credentials", value: "true" },
          { key: "Access-Control-Allow-Origin", value: process.env.NEXT_PUBLIC_BASE_URL },
          { key: "Access-Control-Allow-Methods", value: "GET,OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization" },
        ]
      }
    ]
  },
  experimental: {
    allowedDevOrigins: allowedDevOrigins
  },
};

module.exports = nextConfig;
