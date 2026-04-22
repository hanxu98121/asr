'use client';

import { useTranslation } from '@/lib/i18n';

interface ActionButtonsProps {
  text: string;
  onClear: () => void;
  disabled?: boolean;
}

export default function ActionButtons({ text, onClear, disabled = false }: ActionButtonsProps) {
  const { t } = useTranslation();
  const copyToClipboard = async () => {
    if (!text.trim()) return;

    try {
      await navigator.clipboard.writeText(text);
      alert(t('action.copy.success'));
    } catch (error) {
      console.error('Failed to copy:', error);
      alert(t('action.copy.failed'));
    }
  };

  const handleClear = () => {
    if (text.trim() && !confirm(t('action.clear.confirm'))) {
      return;
    }
    onClear();
  };

  const downloadText = () => {
    if (!text.trim()) return;

    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${t('action.download.filename')}${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-wrap gap-3 justify-center">
      <button
        onClick={copyToClipboard}
        disabled={disabled || !text.trim()}
        className="bg-green-500 hover:bg-green-600 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-bold py-3 px-6 rounded-lg transition-all duration-200 flex items-center gap-2"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
        </svg>
        {t('action.copy')}
      </button>

      <button
        onClick={downloadText}
        disabled={disabled || !text.trim()}
        className="bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-bold py-3 px-6 rounded-lg transition-all duration-200 flex items-center gap-2"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
        {t('action.download')}
      </button>

      <button
        onClick={handleClear}
        disabled={disabled || !text.trim()}
        className="bg-gray-500 hover:bg-gray-600 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-bold py-3 px-6 rounded-lg transition-all duration-200 flex items-center gap-2"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
        {t('action.clear')}
      </button>
    </div>
  );
}
