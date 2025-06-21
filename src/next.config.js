
/** @type {import('next').NextConfig} */

const nextConfig = {
  devIndicators: {
    // This setting is to prevent cross-origin errors in development environments
    // like Firebase Studio, where the preview pane might be on a different subdomain.
    allowedDevOrigins: [
      "*.cloudworkstations.dev",
    ]
  },
  // Security headers are handled in middleware.
};

module.exports = nextConfig;
