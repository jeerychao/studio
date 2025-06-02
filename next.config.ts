import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  /* config options here */
  output: 'standalone', // Add this line for standalone output
  typescript: {
    // ignoreBuildErrors: true, // Temporarily remove to surface potential errors
  },
  eslint: {
    // ignoreDuringBuilds: true, // Temporarily remove to surface potential errors
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
        port: '',
        pathname: '/**',
      },
    ],
  },
};

export default nextConfig;
