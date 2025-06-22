/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  devIndicators: {
    // This is required to allow the Next.js dev server to be proxied in the
    // Firebase Studio environment.
    allowedDevOrigins: [
        '*.cloudworkstations.dev',
    ],
  },
};

export default nextConfig;
