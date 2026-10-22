const { execSync } = require('node:child_process');
const { version } = require('./package.json');

// Shown in the page's top-left corner so a deployment can be identified.
function resolveBuildId() {
  const ci = process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA;
  if (ci) return ci.slice(0, 7);
  try {
    const sha = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    const dirty = execSync('git status --porcelain', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    return dirty ? `${sha}-dirty` : sha;
  } catch {
    return 'unknown';
  }
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The relay URL is intentionally public: the browser needs it to open WSS.
  // Explicitly expose it at build time so client bundles do not depend on a
  // runtime process.env object, which is unavailable in the browser.
  env: {
    NEXT_PUBLIC_GLADIA_RELAY_URL: process.env.NEXT_PUBLIC_GLADIA_RELAY_URL || '',
    NEXT_PUBLIC_APP_VERSION: `v${version} (${resolveBuildId()})`,
  },
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
