/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // 支持更大的音频文件上传
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
  // Turbopack配置
  turbopack: {},
};

// PWA插件配置
const withPWA = require('@ducanh2912/next-pwa').default({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development', // 开发环境禁用
  workboxOptions: {
    runtimeCaching: [
      {
        urlPattern: /^https?.*/,
        handler: 'NetworkFirst',
        options: {
          cacheName: 'external-resources',
          networkTimeoutSeconds: 10,
        },
      },
      {
        urlPattern: /\.(?:png|jpg|jpeg|svg|gif|ico)$/,
        handler: 'CacheFirst',
        options: {
          cacheName: 'images',
          expiration: {
            maxEntries: 64,
            maxAgeSeconds: 30 * 24 * 60 * 60, // 30天
          },
        },
      },
    ],
  },
});

module.exports = withPWA(nextConfig);
