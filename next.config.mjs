/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // serverActions: true, // Deprecated in Next.js 14, server actions are stable
  },
  // If you're encountering issues with Prisma in serverless environments,
  // you might need to ensure the Prisma client is correctly bundled.
  // webpack: (config, { isServer }) => {
  //   if (isServer) {
  //     // Ensures Prisma client is bundled for serverless environments
  //     config.externals = [...config.externals, '@prisma/client'];
  //   }
  //   return config;
  // },
};

export default nextConfig;
