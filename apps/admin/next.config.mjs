/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@woobe/ui", "@woobe/types", "@woobe/validation", "@woobe/utils"],
};

export default nextConfig;
