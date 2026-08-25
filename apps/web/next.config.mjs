/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Workspace packages ship as TS source (no build step) — Next transpiles them itself.
  transpilePackages: ["@woobe/ui", "@woobe/types", "@woobe/validation", "@woobe/utils"],
};

export default nextConfig;
