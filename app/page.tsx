'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import AudioRecorder, { AudioRecorderHandle } from '@/components/AudioRecorder';
import RealtimeSubtitles from '@/components/RealtimeSubtitles';
import HistoryPanel from '@/components/HistoryPanel';
import ActionButtons from '@/components/ActionButtons';
import { ASRClient, ASRBackend, AVAILABLE_BACKENDS } from '@/lib/asr-client';
import { AIOptimizer, AIOptimizerBackend, AVAILABLE_AI_BACKENDS, DEFAULT_PROMPT } from '@/lib/ai-optimizer';
import { ASRResult, RecordingState, TerminologyItem, TranscriptionRecord } from '@/lib/types';
import { storage } from '@/lib/storage';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useTranslation } from '@/lib/i18n';

export default function Home() {
  const { t, language } = useTranslation();
  const [transcript, setTranscript] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [selectedBackend, setSelectedBackend] = useState<ASRBackend>('elevenlabs');
  const [apiKey, setApiKey] = useState<string>('');
  
  // AI Optimizer state
  const [aiBackend, setAiBackend] = useState<AIOptimizerBackend>('groq');
  const [aiApiKey, setAiApiKey] = useState<string>('');
  const [aiPrompt, setAiPrompt] = useState<string>(DEFAULT_PROMPT);
  const [optimizedText, setOptimizedText] = useState<string>('');
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [autoOptimize, setAutoOptimize] = useState(true);
  const [autoCopyOptimized, setAutoCopyOptimized] = useState(true);
  const [aiModel, setAiModel] = useState<string>('');
  const [aiBaseUrl, setAiBaseUrl] = useState<string>('');
  const [terminology, setTerminology] = useState<TerminologyItem[]>([]);
  const [showTerminologyPanel, setShowTerminologyPanel] = useState(false);
  const [newSource, setNewSource] = useState('');
  const [newTarget, setNewTarget] = useState('');
  const [elevenLabsQuota, setElevenLabsQuota] = useState<{
    remainingCharacters: number;
    totalCharacters: number;
    usedCharacters: number;
    resetAt: number | null;
    tier: string | null;
  } | null>(null);
  const [isCheckingElevenLabsQuota, setIsCheckingElevenLabsQuota] = useState(false);
  const [elevenLabsQuotaError, setElevenLabsQuotaError] = useState<string | null>(null);
  
  const [isHydrated, setIsHydrated] = useState(false);
  const [_, setForceUpdate] = useState(0);

  // 客户端hydration完成后加载localStorage数据
  useEffect(() => {
    const savedBackend = (localStorage.getItem('asr-backend') as ASRBackend) || 'elevenlabs';
    const savedKey = localStorage.getItem(`${savedBackend}-api-key`) || '';
    setSelectedBackend(savedBackend);
    setApiKey(savedKey);
    setIsHydrated(true);
    
    // Load AI optimizer settings
    const savedAiBackend = (localStorage.getItem('ai-optimizer-backend') as AIOptimizerBackend) || 'groq';
    const savedAiKey = localStorage.getItem('ai-optimizer-api-key') || '';
    const savedAiPrompt = localStorage.getItem('ai-optimizer-prompt') || DEFAULT_PROMPT;
    const savedAutoOptimize = localStorage.getItem('ai-auto-optimize') !== 'false';
    const savedAutoCopyOptimized = localStorage.getItem('ai-auto-copy-optimized') !== 'false';
    const savedAiModel = localStorage.getItem('ai-optimizer-model') || '';
    const savedAiBaseUrl = localStorage.getItem('ai-optimizer-base-url') || '';
    const savedTerminology = storage.getTerminology();
    setAiBackend(savedAiBackend);
    setAiApiKey(savedAiKey);
    setAiPrompt(savedAiPrompt);
    setAutoOptimize(savedAutoOptimize);
    setAutoCopyOptimized(savedAutoCopyOptimized);
    setAiModel(savedAiModel);
    setAiBaseUrl(savedAiBaseUrl);
    setTerminology(savedTerminology);

    // Add language change listener to re-render component
    const handleLanguageChange = () => {
      setForceUpdate(prev => prev + 1);
    };
    window.addEventListener('languageChanged', handleLanguageChange);
    return () => window.removeEventListener('languageChanged', handleLanguageChange);
  }, []);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentAudioBlob, setCurrentAudioBlob] = useState<Blob | null>(null);
  const [currentAudioUrl, setCurrentAudioUrl] = useState<string | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);

  const asrClientRef = useRef<ASRClient | null>(null);
  const audioChunksRef = useRef<BlobPart[]>([]);
  const audioRecorderRef = useRef<AudioRecorderHandle>(null);

  // 初始化ASR客户端
  const getASRClient = useCallback(() => {
    if (!asrClientRef.current) {
      asrClientRef.current = new ASRClient(apiKey, 'auto', selectedBackend);
    } else {
      asrClientRef.current.setApiKey(apiKey);
      asrClientRef.current.setLanguage('auto');
      asrClientRef.current.setBackend(selectedBackend);
    }
    asrClientRef.current.setTerminology(terminology);
    return asrClientRef.current;
  }, [apiKey, selectedBackend, terminology]);

  // 优化文本
  const handleOptimize = useCallback(async () => {
    if (!transcript.trim()) {
      setError(t('error.no.transcript'));
      return;
    }
    if (!aiApiKey.trim()) {
      setError(t('error.no.ai.api.key'));
      return;
    }

    setIsOptimizing(true);
    setError(null);

    try {
      // 拼接术语对照表到提示词末尾
      const terminologyPrompt = storage.getTerminologyPrompt();
      const finalPrompt = aiPrompt + terminologyPrompt;
      
      const optimizer = new AIOptimizer(aiApiKey, aiBackend, finalPrompt);
      if (aiModel) optimizer.setModel(aiModel);
      if (aiBaseUrl) optimizer.setBaseUrl(aiBaseUrl);
      const result = await optimizer.optimizeText(transcript);

      if (result.success && result.text) {
        setOptimizedText(result.text);
      } else if (result.error) {
        setError(`${t('error.optimize.failed')}${result.error}`);
      }
    } catch (error) {
      setError(`${t('error.optimize.failed')}${(error as Error).message}`);
    } finally {
      setIsOptimizing(false);
    }
  }, [transcript, aiApiKey, aiBackend, aiPrompt, aiModel, aiBaseUrl, t]);

  const handleResetPrompt = useCallback(() => {
    setAiPrompt(DEFAULT_PROMPT);
    localStorage.setItem('ai-optimizer-prompt', DEFAULT_PROMPT);
  }, []);

  const formatResetTime = useCallback((resetAt: number | null) => {
    if (!resetAt) return '-';

    const locale = language === 'zh' ? 'zh-CN' : 'en-US';
    return new Date(resetAt * 1000).toLocaleString(locale, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }, [language]);

  const handleCheckElevenLabsQuota = useCallback(async () => {
    if (selectedBackend !== 'elevenlabs') return;
    if (!apiKey.trim()) {
      setElevenLabsQuotaError(t('settings.enter.api.key'));
      return;
    }

    setIsCheckingElevenLabsQuota(true);
    setElevenLabsQuotaError(null);

    try {
      const response = await fetch('/api/elevenlabs/subscription', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ apiKey }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        setElevenLabsQuota(null);
        setElevenLabsQuotaError(`${t('settings.elevenlabs.quota.failed')}${result.error || response.statusText}`);
        return;
      }

      setElevenLabsQuota({
        remainingCharacters: result.remainingCharacters,
        totalCharacters: result.totalCharacters,
        usedCharacters: result.usedCharacters,
        resetAt: result.resetAt,
        tier: result.tier,
      });
    } catch (error) {
      setElevenLabsQuota(null);
      setElevenLabsQuotaError(`${t('settings.elevenlabs.quota.failed')}${(error as Error).message}`);
    } finally {
      setIsCheckingElevenLabsQuota(false);
    }
  }, [apiKey, selectedBackend, t]);

  // 保存后端选择到localStorage
  useEffect(() => {
    if (isHydrated) {
      localStorage.setItem('asr-backend', selectedBackend);
      // 切换后端时加载对应的API Key
      const savedKey = localStorage.getItem(`${selectedBackend}-api-key`) || '';
      setApiKey(savedKey);
    }
  }, [selectedBackend, isHydrated]);


  // 识别音频
  const recognizeAudio = useCallback(async (audioBlob: Blob, duration: number = 0) => {
    if (!apiKey.trim()) {
      const backendLabel = AVAILABLE_BACKENDS.find(b => b.name === selectedBackend)?.label || selectedBackend;
      setError(`${t('error.no.api.key')}${backendLabel} API Key`);
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      const client = getASRClient();
      const result = await client.recognizeAudio(audioBlob, `recording-${Date.now()}.wav`);

      if (result.success && result.text) {
        const recognizedText = result.text.trim();
        setTranscript(recognizedText);

        let finalOptimizedText = '';

        // 自动优化
        if (autoOptimize && aiApiKey.trim()) {
          // 拼接术语对照表到提示词末尾
          const terminologyPrompt = storage.getTerminologyPrompt();
          const finalPrompt = aiPrompt + terminologyPrompt;
          
          const optimizer = new AIOptimizer(aiApiKey, aiBackend, finalPrompt);
          if (aiModel) optimizer.setModel(aiModel);
          if (aiBaseUrl) optimizer.setBaseUrl(aiBaseUrl);
          const optResult = await optimizer.optimizeText(recognizedText);
          if (optResult.success && optResult.text) {
            finalOptimizedText = optResult.text;
            setOptimizedText(finalOptimizedText);
          }
        }

        // 自动复制到剪贴板
        try {
          const textToCopy = autoCopyOptimized && finalOptimizedText ? finalOptimizedText : recognizedText;
          await navigator.clipboard.writeText(textToCopy);
          setCopySuccess(true);
          setTimeout(() => setCopySuccess(false), 2000);
        } catch (e) {
          // 静默处理剪贴板错误（需要用户交互才能写入）
        }

        // 保存到历史记录（不保存audioBlob，因为无法序列化为JSON）
        const record: TranscriptionRecord = {
          id: crypto.randomUUID(),
          text: recognizedText,
          optimizedText: finalOptimizedText || undefined,
          timestamp: Date.now(),
          duration: result.duration || duration,
          language: result.language,
        };
        storage.saveRecord(record);
      } else if (result.error) {
        setError(`${t('error.recognize.failed')}${result.error}`);
      }
    } catch (error) {
      setError(`${t('error.recognize.failed')}${(error as Error).message}`);
    } finally {
      setIsProcessing(false);
    }
  }, [apiKey, getASRClient, autoOptimize, aiApiKey, aiBackend, aiPrompt, aiModel, aiBaseUrl, autoCopyOptimized, t]);

  // 处理录音完成
  const handleAudioComplete = useCallback(async (wavData: Uint8Array, duration: number) => {
    // 生成WAV Blob
    const audioBlob = new Blob([wavData.buffer as ArrayBuffer], { type: 'audio/wav' });
    setCurrentAudioBlob(audioBlob);
    const audioUrl = URL.createObjectURL(audioBlob);
    setCurrentAudioUrl(audioUrl);
    setRecordingDuration(duration);

    // 自动识别
    if (apiKey.trim()) {
      await recognizeAudio(audioBlob, duration);
    }
  }, [apiKey, recognizeAudio]);

  // 处理录音状态变化
  const handleStateChange = useCallback(async (state: RecordingState) => {
    setIsRecording(state.isRecording);
    setError(null);

    if (state.isRecording) {
      // 开始录音，重置状态
      setCurrentAudioBlob(null);
      setCurrentAudioUrl(null);
      setTranscript('');
      setOptimizedText('');
    }
  }, []);

  // 重新识别
  const handleReRecognize = useCallback(() => {
    if (currentAudioBlob) {
      recognizeAudio(currentAudioBlob);
    }
  }, [currentAudioBlob, recognizeAudio]);

  // 播放录音
  const handlePlayAudio = useCallback(() => {
    if (currentAudioUrl) {
      const audio = new Audio(currentAudioUrl);
      audio.play().catch(err => {
        setError(`${t('error.play.failed')}${err.message}`);
      });
    }
  }, [currentAudioUrl, t]);

  // 处理错误
  const handleError = useCallback((errorMessage: string) => {
    setError(`${t('error.audio')}${errorMessage}`);
    setIsRecording(false);
  }, [t]);

  // 清除内容
  const handleClear = useCallback(() => {
    setTranscript('');
    setOptimizedText('');
    setError(null);
    setCurrentAudioBlob(null);
    if (currentAudioUrl) {
      URL.revokeObjectURL(currentAudioUrl);
      setCurrentAudioUrl(null);
    }
  }, [currentAudioUrl]);

  // 选择历史记录
  const handleSelectRecord = useCallback((record: TranscriptionRecord) => {
    setTranscript(record.text);
    setOptimizedText('');
    // 历史记录不保存音频，所以只加载文本
    setCurrentAudioBlob(null);
    setCurrentAudioUrl(null);
  }, []);

  // 处理文本修改
  const handleTextChange = useCallback((newText: string) => {
    setTranscript(newText);
    setOptimizedText('');
  }, []);

  // 添加专业术语
  const addTerminology = useCallback(() => {
    if (!newSource.trim() || !newTarget.trim()) return;
    const newTerm: TerminologyItem = {
      id: crypto.randomUUID(),
      source: newSource.trim(),
      target: newTarget.trim(),
    };
    const updatedTerms = [...terminology, newTerm];
    setTerminology(updatedTerms);
    storage.saveTerminology(updatedTerms);
    setNewSource('');
    setNewTarget('');
  }, [newSource, newTarget, terminology]);

  // 删除专业术语
  const deleteTerminology = useCallback((id: string) => {
    const updatedTerms = terminology.filter(term => term.id !== id);
    setTerminology(updatedTerms);
    storage.saveTerminology(updatedTerms);
  }, [terminology]);

  // 复制文本（根据设置复制原文本或优化后的文本）
  const handleCopy = useCallback(async () => {
    const textToCopy = autoCopyOptimized && optimizedText ? optimizedText : transcript;
    if (textToCopy) {
      await navigator.clipboard.writeText(textToCopy);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    }
  }, [transcript, optimizedText, autoCopyOptimized]);

  // 开始录音
  const handleStartRecording = useCallback(() => {
    if (!isRecording && !isProcessing && apiKey.trim()) {
      audioRecorderRef.current?.startRecording();
    } else if (!apiKey.trim()) {
      setError(t('settings.enter.api.key'));
    }
  }, [isRecording, isProcessing, apiKey]);

  // 停止录音
  const handleStopRecording = useCallback(() => {
    if (isRecording) {
      audioRecorderRef.current?.stopRecording();
    }
  }, [isRecording]);

  // 注册全局快捷键
  useKeyboardShortcuts({
    onStartRecording: handleStartRecording,
    onStopRecording: handleStopRecording,
    onClear: handleClear,
    onCopy: handleCopy,
    isRecording,
    hasTranscript: !!transcript,
  });

  return (
    <div className="space-y-6">
      {/* 错误提示 */}
      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg text-red-600 dark:text-red-300">
          {error}
          <button
            onClick={() => setError(null)}
            className="float-right text-red-500 hover:text-red-700"
          >
            ✕
          </button>
        </div>
      )}

      {/* 录音控制区域 */}
      <div className="flex flex-col items-center gap-4 p-6 bg-white dark:bg-gray-800 rounded-lg shadow-md">
        <AudioRecorder
          ref={audioRecorderRef}
          onAudioComplete={handleAudioComplete}
          onStateChange={handleStateChange}
          onError={handleError}
        />

        {/* 操作按钮 */}
        <div className="flex items-center gap-3 mt-2 flex-wrap">
          {isHydrated && currentAudioUrl && !isRecording && (
            <>
              <button
                onClick={handlePlayAudio}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                disabled={isProcessing}
              >
                <span>▶️</span> {t('op.play')}
              </button>
              <button
                onClick={handleReRecognize}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                disabled={isProcessing || !apiKey.trim()}
              >
                <span>🔄</span> {isProcessing ? t('op.processing') : t('op.retry')}
              </button>
              <button
                onClick={handleOptimize}
                className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                disabled={isOptimizing || !transcript.trim() || !aiApiKey.trim()}
              >
                <span>✨</span> {isOptimizing ? t('ai.optimizing') : t('op.reoptimize')}
              </button>
              <button
                onClick={handleCopy}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                disabled={!transcript || isProcessing}
              >
                <span>📋</span> {t('op.copy')}
              </button>
            </>
          )}

          {copySuccess && (
            <span className="text-sm text-green-600 dark:text-green-400 font-medium">
              ✅ {t('action.copy.success')}
            </span>
          )}

          {isProcessing && (
            <span className="text-blue-600 dark:text-blue-400">
              {t('op.processing')}
            </span>
          )}
        </div>
      </div>

      {/* AI 优化结果区域 */}
      {optimizedText.length > 0 && (
        <div className="w-full bg-purple-50 dark:bg-purple-900/30 rounded-lg shadow-md p-4 border border-purple-200 dark:border-purple-800">
          <div className="flex justify-between items-center mb-2">
            <h3 className="text-lg font-semibold text-purple-700 dark:text-purple-300">{t('optimization.title')}</h3>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {optimizedText.length} {t('subtitles.characters')}
            </span>
          </div>
          <textarea
            value={optimizedText}
            onChange={(e) => setOptimizedText(e.target.value)}
            className="w-full h-full min-h-[100px] p-3 bg-white dark:bg-gray-800 border border-purple-200 dark:border-purple-700 rounded-lg text-gray-800 dark:text-gray-100 text-lg leading-relaxed focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
          />
        </div>
      )}

      {/* 实时字幕区域（转写结果） */}
      <RealtimeSubtitles
        text={transcript}
        isRecording={isRecording}
        onTextChange={handleTextChange}
      />

      {/* 键盘快捷键提示 */}
      <div className="p-4 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg">
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{t('shortcuts.title')}</h3>
        <div className="grid grid-cols-2 gap-2 text-xs text-gray-600 dark:text-gray-400">
          <div>
            <kbd className="px-2 py-0.5 bg-gray-200 dark:bg-gray-700 rounded">Ctrl/Cmd + R</kbd>
            <span className="ml-2">{t('shortcuts.start')}</span>
          </div>
          <div>
            <kbd className="px-2 py-0.5 bg-gray-200 dark:bg-gray-700 rounded">Ctrl/Cmd + Shift + C</kbd>
            <span className="ml-2">{t('shortcuts.copy')}</span>
          </div>
          <div>
            <kbd className="px-2 py-0.5 bg-gray-200 dark:bg-gray-700 rounded">Ctrl/Cmd + Shift + X</kbd>
            <span className="ml-2">{t('shortcuts.clear')}</span>
          </div>
          <div>
            <kbd className="px-2 py-0.5 bg-gray-200 dark:bg-gray-700 rounded">Ctrl/Cmd + S</kbd>
            <span className="ml-2">{t('shortcuts.save')}</span>
          </div>
        </div>
      </div>

      {/* 操作按钮区域 */}
      {isHydrated && (
        <ActionButtons
          text={transcript}
          onClear={handleClear}
          disabled={isRecording || isProcessing}
        />
      )}

      {/* 历史记录区域 */}
      <div id="history-panel">
        <HistoryPanel onSelectRecord={handleSelectRecord} />
      </div>

      {/* ASR 后端设置 */}
      <div className="p-4 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          {t('settings.asr.backend')}
        </label>
        <select
          value={selectedBackend}
          onChange={(e) => setSelectedBackend(e.target.value as ASRBackend)}
          className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
        >
          {AVAILABLE_BACKENDS.map(backend => (
            <option key={backend.name} value={backend.name}>
              {backend.label}
            </option>
          ))}
        </select>
      </div>

      {/* API Key 输入 */}
      <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <div className="text-sm font-medium text-blue-700 dark:text-blue-300">
            {AVAILABLE_BACKENDS.find(b => b.name === selectedBackend)?.label} {t('settings.api.key')}
            <a
              href={(() => {
                switch (selectedBackend) {
                  case 'elevenlabs':
                    return 'https://elevenlabs.io/docs/eleven-api/quickstart#get-your-api-key';
                  case 'soniox':
                    return 'https://soniox.com/docs/getting-started#api-key';
                  case 'groq':
                    return 'https://console.groq.com/keys';
                  case 'openai':
                    return 'https://platform.openai.com/api-keys';
                  case 'deepgram':
                    return 'https://console.deepgram.com/';
                  case 'assemblyai':
                    return 'https://www.assemblyai.com/dashboard';
                  default:
                    return '#';
                }
              })()}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-2 text-xs text-blue-500 hover:underline"
            >
              {t('settings.get.api.key')}
            </a>
          </div>
          {selectedBackend === 'elevenlabs' && (
            <button
              onClick={handleCheckElevenLabsQuota}
              disabled={isCheckingElevenLabsQuota || !apiKey.trim()}
              className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:bg-blue-400 disabled:cursor-not-allowed"
            >
              {isCheckingElevenLabsQuota ? t('settings.elevenlabs.quota.loading') : t('settings.elevenlabs.quota.check')}
            </button>
          )}
        </div>
        {selectedBackend === 'elevenlabs' && (
          <div className="mb-3 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 p-3 text-xs text-blue-800 dark:text-blue-200">
            {elevenLabsQuotaError ? (
              <div>{elevenLabsQuotaError}</div>
            ) : elevenLabsQuota ? (
              <div className="grid grid-cols-1 gap-1 sm:grid-cols-3 sm:gap-3">
                <div>
                  <span className="text-blue-600 dark:text-blue-300">{t('settings.elevenlabs.quota.remaining')}:</span>{' '}
                  <span className="font-semibold">{elevenLabsQuota.remainingCharacters.toLocaleString()}</span>
                </div>
                <div>
                  <span className="text-blue-600 dark:text-blue-300">{t('settings.elevenlabs.quota.total')}:</span>{' '}
                  <span className="font-semibold">{elevenLabsQuota.totalCharacters.toLocaleString()}</span>
                </div>
                <div>
                  <span className="text-blue-600 dark:text-blue-300">{t('settings.elevenlabs.quota.reset')}:</span>{' '}
                  <span className="font-semibold">{formatResetTime(elevenLabsQuota.resetAt)}</span>
                </div>
              </div>
            ) : (
              <div>{t('settings.elevenlabs.quota.empty')}</div>
            )}
          </div>
        )}
        <input
          type="password"
          name="asr-api-key"
          autoComplete="off"
          value={apiKey}
          onChange={(e) => {
            const newKey = e.target.value;
            setApiKey(newKey);
            if (isHydrated) {
              localStorage.setItem(`${selectedBackend}-api-key`, newKey);
            }
          }}
          placeholder={(() => {
            switch (selectedBackend) {
              case 'elevenlabs':
                return 'sk_...';
              case 'soniox':
                return 'api_...';
              case 'groq':
                return 'gsk_...';
              case 'openai':
                return 'sk_...';
              case 'gladia':
                return 'gladia_...';
              case 'deepgram':
                return 'dg_...';
              case 'assemblyai':
                return 'asai_...';
              default:
                return t('settings.enter.api.key');
            }
          })()}
          className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
        />
      </div>

      {/* 配置导入导出 */}
      <div className="p-4 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg">
        <div className="flex items-center justify-between mb-2">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            {t('config.title')}
          </label>
          <span className="text-xs text-gray-500 dark:text-gray-400">{t('config.description')}</span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => {
              // 导出所有配置
              const config = {
                exportTime: new Date().toISOString(),
                asr: {
                  backend: selectedBackend,
                  apiKeys: {
                    elevenlabs: localStorage.getItem('elevenlabs-api-key') || '',
                    soniox: localStorage.getItem('soniox-api-key') || '',
                    groq: localStorage.getItem('groq-api-key') || '',
                    openai: localStorage.getItem('openai-api-key') || '',
                    gladia: localStorage.getItem('gladia-api-key') || '',
                    deepgram: localStorage.getItem('deepgram-api-key') || '',
                    assemblyai: localStorage.getItem('assemblyai-api-key') || '',
                  }
                },
                aiOptimizer: {
                  backend: aiBackend,
                  apiKey: aiApiKey,
                  prompt: aiPrompt,
                  autoOptimize: autoOptimize,
                  autoCopyOptimized: autoCopyOptimized,
                  model: aiModel,
                  baseUrl: aiBaseUrl,
                  terminology: terminology
                }
              };
              const dataStr = JSON.stringify(config, null, 2);
              const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
              const exportFileDefaultName = `${t('config.import.filename')}${new Date().toLocaleDateString()}.json`;
              const linkElement = document.createElement('a');
              linkElement.setAttribute('href', dataUri);
              linkElement.setAttribute('download', exportFileDefaultName);
              linkElement.click();
            }}
            className="flex-1 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors text-sm"
          >
            {t('config.export')}
          </button>
          <label className="flex-1 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors text-sm text-center cursor-pointer">
            {t('config.import')}
            <input
              type="file"
              accept=".json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (event) => {
                  try {
                    const config = JSON.parse(event.target?.result as string);
                    
                    // 验证配置格式
                    if (!config.asr || !config.aiOptimizer) {
                      alert(t('config.import.invalid'));
                      return;
                    }

                    if (confirm(t('config.import.confirm'))) {
                      // 导入ASR配置
                      if (config.asr.backend) {
                        setSelectedBackend(config.asr.backend);
                        localStorage.setItem('asr-backend', config.asr.backend);
                      }
                      if (config.asr.apiKeys) {
                        Object.entries(config.asr.apiKeys).forEach(([backend, key]) => {
                          if (key) {
                            localStorage.setItem(`${backend}-api-key`, key as string);
                          }
                        });
                        // 更新当前选中后端的API Key
                        if (config.asr.backend && config.asr.apiKeys[config.asr.backend]) {
                          setApiKey(config.asr.apiKeys[config.asr.backend] as string);
                        }
                      }

                      // 导入AI优化器配置
                      if (config.aiOptimizer.backend) {
                        setAiBackend(config.aiOptimizer.backend);
                        localStorage.setItem('ai-optimizer-backend', config.aiOptimizer.backend);
                      }
                      if (config.aiOptimizer.apiKey) {
                        setAiApiKey(config.aiOptimizer.apiKey);
                        localStorage.setItem('ai-optimizer-api-key', config.aiOptimizer.apiKey);
                      }
                      if (config.aiOptimizer.prompt) {
                        setAiPrompt(config.aiOptimizer.prompt);
                        localStorage.setItem('ai-optimizer-prompt', config.aiOptimizer.prompt);
                      }
                      if (config.aiOptimizer.autoOptimize !== undefined) {
                        setAutoOptimize(config.aiOptimizer.autoOptimize);
                        localStorage.setItem('ai-auto-optimize', String(config.aiOptimizer.autoOptimize));
                      }
                      if (config.aiOptimizer.autoCopyOptimized !== undefined) {
                        setAutoCopyOptimized(config.aiOptimizer.autoCopyOptimized);
                        localStorage.setItem('ai-auto-copy-optimized', String(config.aiOptimizer.autoCopyOptimized));
                      }
                      if (config.aiOptimizer.model) {
                        setAiModel(config.aiOptimizer.model);
                        localStorage.setItem('ai-optimizer-model', config.aiOptimizer.model);
                      }
                      if (config.aiOptimizer.baseUrl) {
                        setAiBaseUrl(config.aiOptimizer.baseUrl);
                        localStorage.setItem('ai-optimizer-base-url', config.aiOptimizer.baseUrl);
                      }
                      if (config.aiOptimizer.terminology) {
                        // 处理术语，自动补全缺失的id
                        const processedTerms = config.aiOptimizer.terminology.map((term: any) => {
                          if (!term.id) {
                            return {
                              ...term,
                              id: crypto.randomUUID()
                            };
                          }
                          return term;
                        });
                        setTerminology(processedTerms);
                        storage.saveTerminology(processedTerms);
                      }

                      alert(t('config.import.success'));
                      setTimeout(() => window.location.reload(), 1000);
                    }
                  } catch (error) {
                    alert(t('config.import.invalid'));
                  }
                };
                reader.readAsText(file);
                e.target.value = '';
              }}
            />
          </label>
        </div>
      </div>

      {/* AI 文本优化设置 */}
      <div className="p-4 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg">
        <label className="block text-sm font-medium text-purple-700 dark:text-purple-300 mb-2">
          {t('ai.title')}
        </label>
        
        {/* 后端选择 */}
        <select
          value={aiBackend}
          onChange={(e) => {
            const newBackend = e.target.value as AIOptimizerBackend;
            setAiBackend(newBackend);
            localStorage.setItem('ai-optimizer-backend', newBackend);
          }}
          className="w-full px-4 py-2 mb-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
        >
          {AVAILABLE_AI_BACKENDS.map(backend => (
            <option key={backend.name} value={backend.name}>
              {backend.label}
            </option>
          ))}
        </select>
        
        {/* API Key */}
        <input
          type="password"
          name="ai-optimizer-api-key"
          autoComplete="off"
          value={aiApiKey}
          onChange={(e) => {
            const newKey = e.target.value;
            setAiApiKey(newKey);
            localStorage.setItem('ai-optimizer-api-key', newKey);
          }}
          placeholder={aiBackend === 'groq' ? 'gsk_...' : 'sk_...'}
          className="w-full px-4 py-2 mb-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
        />
        
        {/* 模型选择 */}
        <input
          type="text"
          value={aiModel}
          onChange={(e) => {
            const newModel = e.target.value;
            setAiModel(newModel);
            localStorage.setItem('ai-optimizer-model', newModel);
          }}
          placeholder={aiBackend === 'groq' ? 'openai/gpt-oss-120b' : t('ai.model.placeholder')}
          className="w-full px-4 py-2 mb-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
        />
        
        {/* Base URL */}
        <input
          type="text"
          value={aiBaseUrl}
          onChange={(e) => {
            const newBaseUrl = e.target.value;
            setAiBaseUrl(newBaseUrl);
            localStorage.setItem('ai-optimizer-base-url', newBaseUrl);
          }}
          placeholder={aiBackend === 'groq' ? 'https://api.groq.com/openai/v1' : t('ai.baseurl.placeholder')}
          className="w-full px-4 py-2 mb-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
        />
        
        {/* 提示词 */}
        <textarea
          value={aiPrompt}
          onChange={(e) => {
            const newPrompt = e.target.value;
            setAiPrompt(newPrompt);
            localStorage.setItem('ai-optimizer-prompt', newPrompt);
          }}
          placeholder={t('ai.prompt.placeholder')}
          rows={8}
          className="w-full px-4 py-3 mb-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 resize-none"
        />
        
        {/* 优化按钮 */}
        <div className="grid grid-cols-2 gap-2 mb-3">
          <button
            type="button"
            onClick={handleResetPrompt}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors border border-gray-300 dark:bg-gray-800 dark:text-gray-200 dark:border-gray-600 dark:hover:bg-gray-700"
          >
            {t('ai.prompt.reset')}
          </button>
          <button
            type="button"
            onClick={handleOptimize}
            disabled={!isHydrated || isOptimizing || !transcript.trim() || !aiApiKey.trim()}
            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:bg-purple-400 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isOptimizing ? (
              <>
                <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                {t('ai.optimizing')}
              </>
            ) : (
              t('ai.optimize')
            )}
          </button>
        </div>
        
        {/* 选项 */}
        <div className="flex flex-col gap-2 mt-3">
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
            <input
              type="checkbox"
              checked={autoOptimize}
              onChange={(e) => {
                setAutoOptimize(e.target.checked);
                localStorage.setItem('ai-auto-optimize', String(e.target.checked));
              }}
              className="w-4 h-4 text-purple-600 rounded border-gray-300 focus:ring-purple-500"
            />
            {t('ai.auto.optimize')}
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
            <input
              type="checkbox"
              checked={autoCopyOptimized}
              onChange={(e) => {
                setAutoCopyOptimized(e.target.checked);
                localStorage.setItem('ai-auto-copy-optimized', String(e.target.checked));
              }}
              className="w-4 h-4 text-purple-600 rounded border-gray-300 focus:ring-purple-500"
            />
            {t('ai.auto.copy')}
          </label>
        </div>

        {/* 专业术语管理 */}
        <div className="mt-4 border-t border-gray-200 dark:border-gray-700 pt-4">
          <button
            onClick={() => setShowTerminologyPanel(!showTerminologyPanel)}
            className="w-full flex justify-between items-center text-sm font-medium text-purple-700 dark:text-purple-300 mb-3"
          >
            <span>{t('ai.terminology.title')} ({terminology.length})</span>
            <svg
              className={`w-4 h-4 transition-transform ${showTerminologyPanel ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {showTerminologyPanel && (
            <div className="space-y-3">
              {/* 添加新术语 */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newSource}
                  onChange={(e) => setNewSource(e.target.value)}
                  placeholder={t('ai.terminology.source.placeholder')}
                  className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                />
                <span className="flex items-center text-gray-500 dark:text-gray-400">→</span>
                <input
                  type="text"
                  value={newTarget}
                  onChange={(e) => setNewTarget(e.target.value)}
                  placeholder={t('ai.terminology.target.placeholder')}
                  className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                />
                <button
                  onClick={addTerminology}
                  disabled={!newSource.trim() || !newTarget.trim()}
                  className="px-3 py-2 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:bg-purple-400 disabled:cursor-not-allowed"
                >
                  {t('ai.terminology.add')}
                </button>
              </div>

              {/* 术语列表 */}
              {terminology.length > 0 && (
                <div className="max-h-40 overflow-y-auto space-y-2">
                  {terminology.map(term => (
                    <div
                      key={term.id}
                      className="flex justify-between items-center px-3 py-2 bg-gray-50 dark:bg-gray-700/50 rounded-lg text-sm"
                    >
                      <div className="flex-1">
                        <span className="text-gray-600 dark:text-gray-300">{term.source}</span>
                        <span className="mx-2 text-gray-400">→</span>
                        <span className="text-purple-700 dark:text-purple-300 font-medium">{term.target}</span>
                      </div>
                      <button
                        onClick={() => deleteTerminology(term.id)}
                        className="text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300"
                        title={t('history.delete')}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {terminology.length === 0 && (
                <div className="text-center text-sm text-gray-500 dark:text-gray-400 py-2">
                  {t('ai.terminology.empty')}
                </div>
              )}

              {/* 导入导出按钮 */}
              {terminology.length > 0 && (
                <div className="flex gap-2 pt-2 border-t border-gray-200 dark:border-gray-700">
                  <button
                    onClick={() => {
                      // 导出术语
                      const dataStr = JSON.stringify(terminology, null, 2);
                      const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
                      const exportFileDefaultName = `${t('ai.terminology.filename')}${new Date().toLocaleDateString()}.json`;
                      const linkElement = document.createElement('a');
                      linkElement.setAttribute('href', dataUri);
                      linkElement.setAttribute('download', exportFileDefaultName);
                      linkElement.click();
                    }}
                    className="flex-1 px-3 py-1.5 text-sm bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                  >
                    {t('ai.terminology.export')}
                  </button>
                  <label className="flex-1 px-3 py-1.5 text-sm bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors text-center cursor-pointer">
                    {t('ai.terminology.import')}
                    <input
                      type="file"
                      accept=".json"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const reader = new FileReader();
                        reader.onload = (event) => {
                          try {
                            const importedTerms = JSON.parse(event.target?.result as string);
                            // 验证格式是否正确
                            if (Array.isArray(importedTerms) && importedTerms.every(term => term.source && term.target)) {
                              // 处理术语，自动补全缺失的id
                              const processedTerms = importedTerms.map((term: any) => {
                                if (!term.id) {
                                  return {
                                    ...term,
                                    id: crypto.randomUUID()
                                  };
                                }
                                return term;
                              });
                              const updatedTerms = [...terminology, ...processedTerms];
                              setTerminology(updatedTerms);
                              storage.saveTerminology(updatedTerms);
                              alert(t('ai.terminology.import.success'));
                            } else {
                              alert(t('ai.terminology.import.failed'));
                            }
                          } catch (error) {
                            alert(t('ai.terminology.import.invalid'));
                          }
                        };
                        reader.readAsText(file);
                        // 清空input值，允许重复导入同一个文件
                        e.target.value = '';
                      }}
                    />
                  </label>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
