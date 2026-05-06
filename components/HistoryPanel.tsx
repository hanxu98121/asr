'use client';

import { useState, useEffect } from 'react';
import { TranscriptionRecord } from '@/lib/types';
import { storage } from '@/lib/storage';
import { useTranslation } from '@/lib/i18n';

interface HistoryPanelProps {
  onSelectRecord?: (record: TranscriptionRecord) => void;
}

export default function HistoryPanel({ onSelectRecord }: HistoryPanelProps) {
  const { t } = useTranslation();
  const [records, setRecords] = useState<TranscriptionRecord[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [showOptimized, setShowOptimized] = useState<Record<string, boolean>>({});

  // 加载历史记录
  const loadRecords = () => {
    const data = storage.getRecords();
    setRecords(data);
  };

  useEffect(() => {
    loadRecords();
    // 监听跨页面存储变化
    window.addEventListener('storage', loadRecords);
    // 监听同页面历史记录更新事件
    window.addEventListener(storage.HISTORY_UPDATED_EVENT, loadRecords);
    return () => {
      window.removeEventListener('storage', loadRecords);
      window.removeEventListener(storage.HISTORY_UPDATED_EVENT, loadRecords);
    };
  }, []);

  // 复制历史记录
  const copyRecord = async (record: TranscriptionRecord) => {
    try {
      const textToCopy = showOptimized[record.id] && record.optimizedText ? record.optimizedText : record.text;
      await navigator.clipboard.writeText(textToCopy);
      alert(t('action.copy.success'));
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  // 切换显示优化/原文
  const toggleShowOptimized = (recordId: string, hasOptimizedText: boolean) => {
    if (!hasOptimizedText) return;
    setShowOptimized(prev => ({
      ...prev,
      [recordId]: !(prev[recordId] ?? true)
    }));
  };

  // 是否显示优化文本，默认显示优化文本
  const isShowingOptimized = (recordId: string, hasOptimizedText: boolean) => {
    if (!hasOptimizedText) return false;
    return showOptimized[recordId] ?? true;
  };

  // 获取记录要显示的文本
  const getDisplayText = (record: TranscriptionRecord) => {
    return isShowingOptimized(record.id, !!record.optimizedText) && record.optimizedText
      ? record.optimizedText
      : record.text;
  };

  // 选择记录
  const handleSelectRecord = (record: TranscriptionRecord) => {
    if (!onSelectRecord) return;
    
    // 如果勾选了显示优化版，则将优化文本传入主界面
    if (isShowingOptimized(record.id, !!record.optimizedText) && record.optimizedText) {
      onSelectRecord({
        ...record,
        text: record.optimizedText
      });
    } else {
      onSelectRecord(record);
    }
  };

  // 删除历史记录
  const deleteRecord = (id: string) => {
    storage.deleteRecord(id);
    loadRecords();
  };

  // 清空所有历史
  const clearAll = () => {
    if (confirm(t('history.clear.confirm'))) {
      storage.clearAll();
      loadRecords();
    }
  };

  // 格式化时间
  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleString('zh-CN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // 格式化时长
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="w-full">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex justify-between items-center p-3 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
      >
        <span className="font-semibold text-gray-800 dark:text-white">{t('history.title')} ({records.length})</span>
        <svg
          className={`w-5 h-5 text-gray-600 dark:text-gray-300 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="mt-3 space-y-3 max-h-[400px] overflow-y-auto">
          {records.length === 0 ? (
            <div className="p-4 text-center text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 rounded-lg">
              {t('history.empty')}
            </div>
          ) : (
            <>
              <div className="flex justify-end">
                <button
                  onClick={clearAll}
                  className="text-xs text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300"
                >
                  {t('history.clear.all')}
                </button>
              </div>
              {records.map(record => (
                <div
                  key={record.id}
                  className="p-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:shadow-sm transition-shadow"
                >
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex gap-2 text-xs text-gray-500 dark:text-gray-400">
                      <span>{formatTime(record.timestamp)}</span>
                      <span>•</span>
                      <span>{formatDuration(record.duration)}</span>
                    </div>
                    <div className="flex gap-2 items-center">
                      {/* 显示优化文本的复选框 */}
                      {record.optimizedText && (
                        <label className="flex items-center gap-1 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={isShowingOptimized(record.id, !!record.optimizedText)}
                            onChange={() => toggleShowOptimized(record.id, !!record.optimizedText)}
                            className="w-3 h-3 text-purple-600 rounded border-gray-300 focus:ring-purple-500"
                            title={t('history.optimized')}
                          />
                          <span className="text-xs text-purple-600 dark:text-purple-400 font-medium">✨</span>
                        </label>
                      )}
                      {onSelectRecord && (
                        <button
                          onClick={() => handleSelectRecord(record)}
                          className="text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300"
                          title={t('history.use')}
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                          </svg>
                        </button>
                      )}
                      <button
                        onClick={() => copyRecord(record)}
                        className="text-green-500 hover:text-green-600 dark:text-green-400 dark:hover:text-green-300"
                        title={t('history.copy')}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                        </svg>
                      </button>
                      <button
                        onClick={() => deleteRecord(record.id)}
                        className="text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300"
                        title={t('history.delete')}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                  <p className={`text-sm line-clamp-2 ${isShowingOptimized(record.id, !!record.optimizedText) && record.optimizedText ? 'text-purple-800 dark:text-purple-200' : 'text-gray-800 dark:text-gray-200'}`}>
                    {getDisplayText(record)}
                  </p>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
