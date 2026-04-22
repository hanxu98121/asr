'use client';

import type { Metadata, Viewport } from 'next';
import './globals.css';
import PWAInstallPrompt from '@/components/PWAInstallPrompt';
import { useState, useEffect } from 'react';
import { useTranslation, Language } from '@/lib/i18n';

const LanguageSwitcher = () => {
  const { language, setLanguage, t } = useTranslation();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <button
      onClick={() => setLanguage(language === 'zh' ? 'en' : 'zh')}
      className="absolute top-4 right-4 px-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors shadow-sm"
    >
      {t('language.switch')}
    </button>
  );
};

// export const metadata: Metadata = {
//   title: '实时语音转文字 - ASR工具',
//   description: '简单易用的实时语音转文字工具，支持实时字幕、历史记录、一键复制',
//   manifest: '/manifest.webmanifest',
//   appleWebApp: {
//     capable: true,
//     statusBarStyle: 'default',
//     title: 'ASR工具',
//   },
//   other: {
//     'mobile-web-app-capable': 'yes',
//   },
// };
// 
// export const viewport: Viewport = {
//   themeColor: '#3b82f6',
//   width: 'device-width',
//   initialScale: 1,
//   maximumScale: 1,
//   userScalable: false,
// };

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { t, language } = useTranslation();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <html lang={language === 'zh' ? 'zh-CN' : 'en-US'}>
      <head>
        <title>{mounted ? t('header.title') : 'ASR Tool'}</title>
        <meta name="description" content={mounted ? t('header.subtitle') : 'Real-time speech to text tool'} />
        <link rel="manifest" href="/manifest.webmanifest" />
        <meta name="theme-color" content="#3b82f6" />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
      </head>
      <body className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
        <main className="container mx-auto px-4 py-8 max-w-4xl relative">
          <LanguageSwitcher />
          <header className="text-center mb-8">
            <h1 className="text-4xl font-bold text-gray-800 dark:text-white mb-2">
              {t('header.title')}
            </h1>
            <p className="text-gray-600 dark:text-gray-300">
              {t('header.subtitle')}
            </p>
          </header>
          {children}
          <footer className="mt-12 text-center text-sm text-gray-500 dark:text-gray-400">
            <p>{t('footer.text')}</p>
          </footer>
        </main>
        <PWAInstallPrompt />
      </body>
    </html>
  );
}
