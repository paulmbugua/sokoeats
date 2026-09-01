/** @type {import('next').NextConfig} */
const nextConfig = {
  agentRules: false,
  output: 'standalone',
  reactStrictMode: true,
  transpilePackages: ['@sokoeats/shared'],
  experimental: {
    cpus: 1,
  },
};

export default nextConfig;
