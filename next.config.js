/** @type {import('next').NextConfig} */

const nextConfig = {
  async headers() {
    return [
      {
        // Apply to all routes, including Server Action endpoints
        source: "/:path*",
        headers: [
          { key: "Access-Control-Allow-Credentials", value: "true" },
          // The NEXT_PUBLIC_BASE_URL should be correctly set in the environment
          { key: "Access-Control-Allow-Origin", value: process.env.NEXT_PUBLIC_BASE_URL || "*" },
          { key: "Access-Control-Allow-Methods", value: "GET,OPTIONS,POST,PUT,DELETE,PATCH" },
          { key: "Access-Control-Allow-Headers", value: "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization" },
        ]
      }
    ]
  },
};

module.exports = nextConfig;
