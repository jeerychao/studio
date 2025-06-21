
/** @type {import('next').NextConfig} */

const nextConfig = {
  // Add devIndicators to solve the Cross origin request warning in dev environment
  devIndicators: {
    allowedDevOrigins: [
      'https://*.cloudworkstations.dev',
    ],
  },
  // Removing the custom headers block as it might interfere with Next.js's internal dev server behavior.
  // The `devIndicators.allowedDevOrigins` should be sufficient. Security headers are now handled in middleware.
};

module.exports = nextConfig;
