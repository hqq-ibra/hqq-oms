import type { NextConfig } from 'next';
const nextConfig: NextConfig = {
  output: 'standalone',
  env: { NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000' },
  typescript: {
    // Re-enabled 2026-07-26 after clearing the 6 pre-existing errors.
    // Builds now fail on type errors — keep it that way.
    ignoreBuildErrors: false,
  },
  eslint: {
    // Still skipped: there is no eslint.config.* anywhere in the repo, so
    // enabling this fails the build outright rather than reporting lint issues.
    ignoreDuringBuilds: true,
  },
};
export default nextConfig;
