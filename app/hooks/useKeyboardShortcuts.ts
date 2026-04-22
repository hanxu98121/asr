'use client';

import { useEffect, useCallback } from 'react';

interface KeyboardShortcutsProps {
  onStartRecording: () => void;
  onStopRecording: () => void;
  onClear: () => void;
  onCopy: () => void;
  isRecording: boolean;
  hasTranscript: boolean;
}

export function useKeyboardShortcuts({
  onStartRecording,
  onStopRecording,
  onClear,
  onCopy,
  isRecording,
  hasTranscript,
}: KeyboardShortcutsProps) {
  const handleKeyPress = useCallback((e: KeyboardEvent) => {
    // 避免在输入框中触发快捷键
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
      return;
    }

    // Ctrl/Cmd + R: 开始/停止录音
    if ((e.ctrlKey || e.metaKey) && e.key === 'r') {
      e.preventDefault();
      if (isRecording) {
        onStopRecording();
      } else {
        onStartRecording();
      }
    }

    // Ctrl/Cmd + Shift + C: 复制转写结果
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'C') {
      e.preventDefault();
      if (hasTranscript) {
        onCopy();
      }
    }

    // Ctrl/Cmd + Shift + X: 清除内容
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'X') {
      e.preventDefault();
      onClear();
    }

    // Ctrl/Cmd + S: 保存到历史记录
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      // 保存功能已默认实现
    }
  }, [isRecording, hasTranscript, onStartRecording, onStopRecording, onClear, onCopy]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [handleKeyPress]);

  // 注册PWA快捷方式处理
  useEffect(() => {
    if ('launchQueue' in window) {
      // @ts-ignore - Launch Queue API
      window.launchQueue.setConsumer((launchParams) => {
        if (launchParams.targetURL) {
          const url = new URL(launchParams.targetURL);
          const action = url.searchParams.get('action');

          switch (action) {
            case 'start-recording':
              onStartRecording();
              break;
            case 'view-history':
              // 滚动到历史记录区域
              document.getElementById('history-panel')?.scrollIntoView({ behavior: 'smooth' });
              break;
          }
        }
      });
    }
  }, [onStartRecording]);
}
