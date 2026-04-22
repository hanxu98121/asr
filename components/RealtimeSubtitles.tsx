'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from '@/lib/i18n';

interface RealtimeSubtitlesProps {
  text: string;
  isRecording: boolean;
  onTextChange?: (text: string) => void;
}

export default function RealtimeSubtitles({ text, isRecording, onTextChange }: RealtimeSubtitlesProps) {
  const { t } = useTranslation();
  const [editableText, setEditableText] = useState(text);
  const containerRef = useRef<HTMLDivElement>(null);
  const isAutoScrollEnabled = useRef(true);

  useEffect(() => {
    if (containerRef.current && isAutoScrollEnabled.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [text]);

  useEffect(() => {
    setEditableText(text);
  }, [text]);

  const handleScroll = () => {
    if (containerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
      isAutoScrollEnabled.current = scrollTop + clientHeight >= scrollHeight - 20;
    }
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setEditableText(e.target.value);
    if (onTextChange) {
      onTextChange(e.target.value);
    }
  };

  return (
    <div className="w-full bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 border border-gray-200 dark:border-gray-700">
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-white">{t('subtitles.title')}</h3>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {editableText.length} {t('subtitles.characters')}
        </span>
      </div>
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="max-h-[400px] overflow-y-auto scroll-smooth"
      >
        <textarea
          value={editableText}
          onChange={handleTextChange}
          placeholder={isRecording ? t('subtitles.listening') : t('subtitles.placeholder')}
          className="w-full h-full min-h-[300px] p-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-800 dark:text-gray-100 text-lg leading-relaxed focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          disabled={isRecording}
        />
      </div>
      {isRecording && (
        <div className="mt-2 flex items-center gap-2 text-sm text-blue-500">
          <div className="animate-pulse w-2 h-2 rounded-full bg-blue-500"></div>
          <span>{t('audio.recording')}</span>
        </div>
      )}
    </div>
  );
}