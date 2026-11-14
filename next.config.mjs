import { withSentryConfig } from "@sentry/nextjs";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverComponentsExternalPackages: ["pdfkit", "exceljs"],
    instrumentationHook: true,
  },
  webpack: (config, { dev }) => {
    if (dev) {
      config.watchOptions = {
        poll: 1000,
        aggregateTimeout: 300,
      };
    }
    return config;
  },
};

export default withSentryConfig(nextConfig, {
  // Suppresses source map uploading logs during build
  silent: true,
  org: process.env.SENTRY_ORG || "bvimr",
  project: process.env.SENTRY_PROJECT || "ia-portal",
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // When SENTRY_AUTH_TOKEN is not set, disable source map upload
  dryRun: !process.env.SENTRY_AUTH_TOKEN,

  // Hides source maps from generated client bundles
  hideSourceMaps: true,

  // Automatically tree-shake Sentry logger statements to reduce bundle size
  disableLogger: true,
});
