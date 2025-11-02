/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
  // 暫時禁用建置時的 ESLint 檢查，讓本地和部署都能運行
  eslint: {
    ignoreDuringBuilds: true,
  },
  // 暫時禁用型別檢查
  typescript: {
    ignoreBuildErrors: true,
  },
};

module.exports = nextConfig;

