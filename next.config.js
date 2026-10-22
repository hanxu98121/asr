const { execSync } = require('node:child_process');
const { version } = require('./package.json');

// Shown in the page's top-left corner so a deployment can be identified.
// The build number is the commit count, so it grows with every commit.
function git(args) {
  return execSync(`git ${args}`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
}

function resolveBuildId() {
  try {
    const build = git('rev-list --count HEAD');
    const sha = (process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || git('rev-parse HEAD')).slice(0, 7);
    const dirty = !process.env.CI && git('status --porcelain') ? '-dirty' : '';
    return `build ${build} · ${sha}${dirty}`;
  } catch {
    return 'build unknown';
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
