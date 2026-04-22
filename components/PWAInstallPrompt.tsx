'use client';

import { useState, useEffect } from 'react';

// 检查PWA安装状态
const checkPWAInstalled = (): boolean => {
  return window.matchMedia('(display-mode: standalone)').matches ||
         (window.navigator as any).standalone === true;
};

export default function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstallable, setIsInstallable] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isPWA, setIsPWA] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsInstallable(true);
    };

    window.addEventListener('beforeinstallprompt', handler);

    // 检查是否已安装
    setIsPWA(checkPWAInstalled());

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  useEffect(() => {
    // 页面加载3秒后显示安装提示
    const timer = setTimeout(() => {
      if (isInstallable && !isPWA) {
        setShowPrompt(true);
      }
    }, 3000);

    return () => clearTimeout(timer);
  }, [isInstallable, isPWA]);

  const installPWA = async () => {
    if (!deferredPrompt) return;

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;

    if (outcome === 'accepted') {
      setDeferredPrompt(null);
      setIsInstallable(false);
      setShowPrompt(false);
    }

    return outcome;
  };

  if (!showPrompt || isPWA) return null;

  return (
    <div className="fixed bottom-4 right-4 bg-white dark:bg-gray-800 rounded-lg shadow-lg p-4 max-w-sm border border-gray-200 dark:border-gray-700 z-50">
      <div className="flex items-start gap-3">
        <div className="text-3xl">📱</div>
        <div className="flex-1">
          <h3 className="font-medium text-gray-900 dark:text-white mb-1">安装到桌面</h3>
          <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">
            安装为桌面应用，获得更好的使用体验，支持离线使用和全局快捷键
          </p>
          <div className="flex gap-2">
            <button
              onClick={installPWA}
              className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors"
            >
              立即安装
            </button>
            <button
              onClick={() => setShowPrompt(false)}
              className="px-3 py-1.5 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
            >
              稍后再说
            </button>
          </div>
        </div>
        <button
          onClick={() => setShowPrompt(false)}
          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
