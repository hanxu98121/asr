'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import AudioRecorder, { AudioRecorderHandle } from '@/components/AudioRecorder';
import RealtimeSubtitles from '@/components/RealtimeSubtitles';
import HistoryPanel from '@/components/HistoryPanel';
import ActionButtons from '@/components/ActionButtons';
import { ASRClient, ASRBackend, AVAILABLE_BACKENDS } from '@/lib/asr-client';
import { GladiaLiveClient, GladiaTranscriptEvent } from '@/lib/gladia-live-client';
import { AIOptimizer, AIOptimizerBackend, AVAILABLE_AI_BACKENDS, buildOptimizationPrompt, DEFAULT_PROMPT } from '@/lib/ai-optimizer';
import { RecordingState, TerminologyItem, TranscriptionRecord } from '@/lib/types';
import { storage } from '@/lib/storage';
import { RecordingSession, appendTranscript, mergeRecordingWavs, wavDuration } from '@/lib/recording-session';

interface RecordingSnapshot {
  text: string;
  optimizedText: string;
  audio: Blob | null;
  duration: number;
  recordId: string | null;
  canContinue: boolean;
}
interface ActiveRecording {
  id: number;
  snapshot: RecordingSnapshot;
  append: boolean;
  backend: ASRBackend;
  started: boolean;
  stopped: boolean;
  finalized: boolean;
  audioReady: Promise<void>;
  segmentsReady: Promise<void>;
  segmented: boolean;
  segmentText: string;
  timeout?: ReturnType<typeof setTimeout>;
}
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useTranslation } from '@/lib/i18n';

const getApiKeyStorageKey = (backend: ASRBackend): string =>
  backend === 'gladia' || backend === 'gladia-realtime' ? 'gladia-api-key' : `${backend}-api-key`;

export default function Home() {
  const { t, language } = useTranslation();
  const [transcript, setTranscript] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [selectedBackend, setSelectedBackend] = useState<ASRBackend>('elevenlabs');
  const [apiKey, setApiKey] = useState<string>('');
  const [asrModel, setAsrModel] = useState('');
  const [asrBaseUrl, setAsrBaseUrl] = useState('');
  const [compressAudio, setCompressAudio] = useState(true);
  
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
    const savedKey = localStorage.getItem(getApiKeyStorageKey(savedBackend)) || '';
    setSelectedBackend(savedBackend);
    setApiKey(savedKey);
    setAsrModel(localStorage.getItem('openai-asr-model') || '');
    setAsrBaseUrl(localStorage.getItem('openai-asr-base-url') || '');
    setCompressAudio(localStorage.getItem('asr-compress-audio') !== 'false');
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
  const [isStarting, setIsStarting] = useState(false);
  const [canContinue, setCanContinue] = useState(false);
  const busyRef = useRef(false);
  const recordIdRef = useRef<string | null>(null);
  const sessionRef = useRef(new RecordingSession<RecordingSnapshot>());
  const activeRecordingRef = useRef<ActiveRecording | null>(null);
  const recognitionAbortRef = useRef<AbortController | null>(null);
  const blocked = isStarting || isRecording || isProcessing || isOptimizing;

  useEffect(() => {
    if (!currentAudioBlob) { setCurrentAudioUrl(null); return; }
    const url = URL.createObjectURL(currentAudioBlob);
    setCurrentAudioUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [currentAudioBlob]);

  useEffect(() => () => {
    sessionRef.current.cancel();
    recognitionAbortRef.current?.abort();
    if (activeRecordingRef.current?.timeout) clearTimeout(activeRecordingRef.current.timeout);
    gladiaLiveRef.current?.close();
  }, []);

  const asrClientRef = useRef<ASRClient | null>(null);
  const audioRecorderRef = useRef<AudioRecorderHandle>(null);
  const gladiaLiveRef = useRef<GladiaLiveClient | null>(null);
  const gladiaFinalTextRef = useRef('');
  const gladiaPartialTextRef = useRef('');
  const currentAudioBlobRef = useRef<Blob | null>(null);
  const recordingDurationRef = useRef(0);
  const restoreSnapshot = useCallback((snapshot: RecordingSnapshot) => {
    setTranscript(snapshot.text);
    setOptimizedText(snapshot.optimizedText);
    currentAudioBlobRef.current = snapshot.audio;
    setCurrentAudioBlob(snapshot.audio);
    recordingDurationRef.current = snapshot.duration;
    setRecordingDuration(snapshot.duration);
    recordIdRef.current = snapshot.recordId;
    setCanContinue(snapshot.canContinue);
  }, []);

  const abandonRecording = useCallback(() => {
    const snapshot = sessionRef.current.cancel();
    recognitionAbortRef.current?.abort();
    if (activeRecordingRef.current?.timeout) clearTimeout(activeRecordingRef.current.timeout);
    activeRecordingRef.current = null;
    gladiaLiveRef.current?.close();
    gladiaLiveRef.current = null;
    audioRecorderRef.current?.cancelRecording();
    if (snapshot) restoreSnapshot(snapshot);
    busyRef.current = false;
    setIsStarting(false);
    setIsRecording(false);
    setIsProcessing(false);
  }, [restoreSnapshot]);

  // 初始化ASR客户端
  const getASRClient = useCallback(() => {
    if (!asrClientRef.current) {
      asrClientRef.current = new ASRClient(apiKey, undefined, selectedBackend);
    } else {
      asrClientRef.current.setApiKey(apiKey);
      asrClientRef.current.setBackend(selectedBackend);
    }
    asrClientRef.current.setTerminology(terminology);
    asrClientRef.current.setOpenAIConfig(asrModel, asrBaseUrl);
    return asrClientRef.current;
  }, [apiKey, selectedBackend, terminology, asrModel, asrBaseUrl]);

  // 优化文本
  const handleOptimize = useCallback(async () => {
    if (blocked || busyRef.current) return;
    if (!transcript.trim()) {
      setError(t('error.no.transcript'));
      return;
    }
    if (!aiApiKey.trim()) {
      setError(t('error.no.ai.api.key'));
      return;
    }

    busyRef.current = true;
    setIsOptimizing(true);
    setOptimizedText('');
    setError(null);

    try {
      const finalPrompt = buildOptimizationPrompt(aiPrompt, terminology);
      
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
      busyRef.current = false;
      setIsOptimizing(false);
    }
  }, [blocked, transcript, aiApiKey, aiBackend, aiPrompt, aiModel, aiBaseUrl, terminology, t]);

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
      const savedKey = localStorage.getItem(getApiKeyStorageKey(selectedBackend)) || '';
      setApiKey(savedKey);
    }
  }, [selectedBackend, isHydrated]);


  // Shared finalization for uploaded and live audio. Each callback owns a generation.
  const finalizeTranscript = useCallback(async (text: string, id: number, language?: string) => {
    if (!sessionRef.current.isCurrent(id)) return;
    setTranscript(text);
    setOptimizedText('');
    let optimized = '';
    if (autoOptimize && aiApiKey.trim()) {
      try {
        const optimizer = new AIOptimizer(aiApiKey, aiBackend, buildOptimizationPrompt(aiPrompt, terminology));
        if (aiModel) optimizer.setModel(aiModel);
        if (aiBaseUrl) optimizer.setBaseUrl(aiBaseUrl);
        const result = await optimizer.optimizeText(text);
        if (!sessionRef.current.isCurrent(id)) return;
        if (!result.success || !result.text) throw new Error(result.error || 'Empty optimization result');
        optimized = result.text;
        setOptimizedText(optimized);
      } catch (error) {
        if (!sessionRef.current.isCurrent(id)) return;
        setError(t('error.optimize.failed') + (error as Error).message);
      }
    }
    if (!sessionRef.current.isCurrent(id)) return;
    storage.saveRecord({
      id: recordIdRef.current || (recordIdRef.current = crypto.randomUUID()),
      text, optimizedText: optimized || undefined,
      timestamp: Date.now(), duration: recordingDurationRef.current, language,
    });
    try {
      await navigator.clipboard.writeText(autoCopyOptimized && optimized ? optimized : text);
      if (sessionRef.current.isCurrent(id)) {
        setCopySuccess(true);
        setTimeout(() => setCopySuccess(false), 2000);
      }
    } catch { /* Clipboard access may require a user gesture. */ }
  }, [autoOptimize, aiApiKey, aiBackend, aiPrompt, terminology, aiModel, aiBaseUrl, autoCopyOptimized, t]);

  const finishProcessing = useCallback((id: number) => {
    if (!sessionRef.current.isCurrent(id)) return;
    sessionRef.current.finish(id);
    if (activeRecordingRef.current?.timeout) clearTimeout(activeRecordingRef.current.timeout);
    activeRecordingRef.current = null;
    busyRef.current = false;
    setIsProcessing(false);
    setCanContinue(!!currentAudioBlobRef.current);
  }, []);

  const recognizeAudio = useCallback(async (audio: Blob, id: number, prefix = '', backendOverride?: ASRBackend) => {
    if (!sessionRef.current.isCurrent(id)) return;
    setIsProcessing(true);
    setError(null);
    try {
      const client = getASRClient();
      client.setBackend(backendOverride || selectedBackend);
      const controller = new AbortController();
      recognitionAbortRef.current?.abort();
      recognitionAbortRef.current = controller;
      const result = await client.recognizeAudio(audio, 'recording.wav', { compressAudio, signal: controller.signal });
      if (!sessionRef.current.isCurrent(id)) return;
      if (!result.success && result.errorCode && result.errorCode !== 'SERVICE_ERROR') {
        throw new Error(t(`error.stt.${result.errorCode}`));
      }
      if (!result.success || !result.text?.trim()) throw new Error(result.error || t('error.empty.transcript'));
      await finalizeTranscript(appendTranscript(prefix, result.text), id, result.language);
    } catch (error) {
      if (sessionRef.current.isCurrent(id)) setError(t('error.recognize.failed') + (error as Error).message);
    } finally {
      finishProcessing(id);
    }
  }, [getASRClient, selectedBackend, compressAudio, finalizeTranscript, finishProcessing, t]);

  const handleAudioSegment = useCallback((wavData: Uint8Array) => {
    const active = activeRecordingRef.current;
    if (!active || active.backend === 'gladia-realtime' || !sessionRef.current.isCurrent(active.id)) return;
    active.segmented = true;
    const audio = new Blob([new Uint8Array(wavData)], { type: 'audio/wav' });
    setIsProcessing(true);
    if (!recognitionAbortRef.current || recognitionAbortRef.current.signal.aborted) {
      recognitionAbortRef.current = new AbortController();
    }
    const controller = recognitionAbortRef.current;
    // Queue user-chosen segments in recording order; failures leave later segments usable.
    active.segmentsReady = active.segmentsReady.then(async () => {
      if (!sessionRef.current.isCurrent(active.id)) return;
      try {
        const client = getASRClient();
        client.setBackend(active.backend);
        const result = await client.recognizeAudio(audio, 'recording.wav', { compressAudio, signal: controller.signal });
        if (!sessionRef.current.isCurrent(active.id)) return;
        if (!result.success && result.errorCode && result.errorCode !== 'SERVICE_ERROR') {
          throw new Error(t(`error.stt.${result.errorCode}`));
        }
        if (!result.success || !result.text?.trim()) throw new Error(result.error || t('error.empty.transcript'));
        active.segmentText = appendTranscript(active.segmentText, result.text);
        setTranscript(active.segmentText);
        setOptimizedText('');
      } catch (error) {
        if (sessionRef.current.isCurrent(active.id)) setError(t('error.recognize.failed') + (error as Error).message);
      }
    });
  }, [getASRClient, compressAudio, t]);

  const handleAudioComplete = useCallback((wavData: Uint8Array) => {
    const active = activeRecordingRef.current;
    if (!active || !sessionRef.current.isCurrent(active.id)) return;
    if (wavData.length <= 44) { abandonRecording(); return; }
    const segment = new Blob([new Uint8Array(wavData)], { type: 'audio/wav' });
    active.audioReady = (async () => {
      try {
        const parts = active.append && active.snapshot.audio
          ? [new Uint8Array(await active.snapshot.audio.arrayBuffer()), wavData] : [wavData];
        const merged = mergeRecordingWavs(parts);
        if (!sessionRef.current.isCurrent(active.id)) return;
        const audio = new Blob([new Uint8Array(merged)], { type: 'audio/wav' });
        currentAudioBlobRef.current = audio;
        setCurrentAudioBlob(audio);
        recordingDurationRef.current = wavDuration(merged);
        setRecordingDuration(recordingDurationRef.current);
        if (active.backend !== 'gladia-realtime') {
          if (active.segmented) {
            await active.segmentsReady;
            if (!sessionRef.current.isCurrent(active.id)) return;
            try {
              if (active.segmentText.trim()) await finalizeTranscript(active.segmentText, active.id);
            } finally { finishProcessing(active.id); }
          } else {
            await recognizeAudio(segment, active.id, active.append ? active.snapshot.text : '', active.backend);
          }
        }
      } catch (error) {
        if (sessionRef.current.isCurrent(active.id)) {
          abandonRecording();
          setError(t('error.audio') + (error as Error).message);
        }
      }
    })();
  }, [abandonRecording, recognizeAudio, finalizeTranscript, finishProcessing, t]);

  const handleGladiaTranscript = useCallback((event: GladiaTranscriptEvent, id: number) => {
    const active = activeRecordingRef.current;
    if (!sessionRef.current.isCurrent(id) || !active?.started || active.finalized) return;
    if (event.isFinal) {
      gladiaFinalTextRef.current = [gladiaFinalTextRef.current, event.text].filter(Boolean).join(' ');
      gladiaPartialTextRef.current = '';
    } else gladiaPartialTextRef.current = event.text;
    const next = [gladiaFinalTextRef.current, gladiaPartialTextRef.current].filter(Boolean).join(' ');
    setTranscript(appendTranscript(active.append ? active.snapshot.text : '', next));
  }, []);

  const handleGladiaAudioChunk = useCallback((pcm: Uint8Array) => { gladiaLiveRef.current?.sendAudio(pcm); }, []);

  const handleGladiaSessionComplete = useCallback(async (id: number) => {
    const active = activeRecordingRef.current;
    if (!sessionRef.current.isCurrent(id) || !active?.started || active.finalized) return;
    if (!active.stopped) {
      active.stopped = true;
      setIsProcessing(true);
      audioRecorderRef.current?.stopRecording();
    }
    active.finalized = true;
    if (active.timeout) clearTimeout(active.timeout);
    await active.audioReady;
    if (!sessionRef.current.isCurrent(id)) return;
    gladiaLiveRef.current?.close();
    gladiaLiveRef.current = null;
    const next = [gladiaFinalTextRef.current, gladiaPartialTextRef.current].filter(Boolean).join(' ').trim();
    try {
      if (!next) {
        setTranscript(active.append ? active.snapshot.text : '');
        setError(t('error.empty.transcript'));
      } else await finalizeTranscript(appendTranscript(active.append ? active.snapshot.text : '', next), id);
    } finally { finishProcessing(id); }
  }, [finalizeTranscript, finishProcessing, t]);

  const handleStateChange = useCallback((state: RecordingState) => { setIsRecording(state.isRecording); }, []);

  const handleReRecognize = useCallback(() => {
    if (blocked || busyRef.current || !currentAudioBlob || !apiKey.trim()) return;
    busyRef.current = true;
    const id = sessionRef.current.begin({ text: transcript, optimizedText, audio: currentAudioBlob,
      duration: recordingDurationRef.current, recordId: recordIdRef.current, canContinue });
    void recognizeAudio(currentAudioBlob, id, '', selectedBackend === 'gladia-realtime' ? 'gladia' : selectedBackend);
  }, [blocked, currentAudioBlob, apiKey, transcript, optimizedText, canContinue, recognizeAudio, selectedBackend]);

  // 播放录音
  const handlePlayAudio = useCallback(() => {
    if (currentAudioUrl) {
      const audio = new Audio(currentAudioUrl);
      audio.play().catch(err => {
        setError(`${t('error.play.failed')}${err.message}`);
      });
    }
  }, [currentAudioUrl, t]);

  const handleError = useCallback((message: string) => {
    abandonRecording();
    setError(t('error.audio') + message);
  }, [abandonRecording, t]);

  const handleClear = useCallback(() => {
    if (blocked || busyRef.current) return;
    sessionRef.current.cancel();
    setTranscript('');
    setOptimizedText('');
    setError(null);
    currentAudioBlobRef.current = null;
    setCurrentAudioBlob(null);
    recordingDurationRef.current = 0;
    setRecordingDuration(0);
    recordIdRef.current = null;
    setCanContinue(false);
  }, [blocked]);

  const handleSelectRecord = useCallback((record: TranscriptionRecord) => {
    if (blocked || busyRef.current) return;
    sessionRef.current.cancel();
    setTranscript(record.text);
    setOptimizedText(record.optimizedText || '');
    currentAudioBlobRef.current = null;
    setCurrentAudioBlob(null);
    recordingDurationRef.current = record.duration;
    setRecordingDuration(record.duration);
    recordIdRef.current = null;
    setCanContinue(false);
  }, [blocked]);

  const handleTextChange = useCallback((text: string) => {
    if (blocked || busyRef.current) return;
    setTranscript(text);
    setOptimizedText('');
  }, [blocked]);

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

  const startRecording = useCallback(async (append: boolean) => {
    if (blocked || busyRef.current || (append && !canContinue)) return;
    if (!apiKey.trim()) { setError(t('settings.enter.api.key')); return; }
    busyRef.current = true;
    setIsStarting(true);
    setError(null);
    const snapshot: RecordingSnapshot = { text: transcript, optimizedText, audio: currentAudioBlobRef.current,
      duration: recordingDurationRef.current, recordId: recordIdRef.current, canContinue };
    const id = sessionRef.current.begin(snapshot);
    const active: ActiveRecording = { id, snapshot, append, backend: selectedBackend,
      started: false, stopped: false, finalized: false, audioReady: Promise.resolve(),
      segmentsReady: Promise.resolve(), segmented: false, segmentText: append ? snapshot.text : '' };
    recognitionAbortRef.current = new AbortController();
    activeRecordingRef.current = active;
    gladiaFinalTextRef.current = '';
    gladiaPartialTextRef.current = '';
    try {
      if (selectedBackend === 'gladia-realtime') {
        const client = new GladiaLiveClient(
          event => handleGladiaTranscript(event, id),
          message => {
            if (sessionRef.current.isCurrent(id)) {
              setError(message);
              if (active.stopped) void handleGladiaSessionComplete(id);
            }
          },
          () => void handleGladiaSessionComplete(id),
        );
        gladiaLiveRef.current = client;
        await client.start(apiKey, 'auto', terminology);
      }
      if (!sessionRef.current.isCurrent(id)) return;
      if (!audioRecorderRef.current) throw new Error('Recorder unavailable');
      await audioRecorderRef.current.startRecording();
      if (!sessionRef.current.isCurrent(id)) return;
      active.started = true;
      if (!append) {
        setTranscript('');
        setOptimizedText('');
        currentAudioBlobRef.current = null;
        setCurrentAudioBlob(null);
        recordingDurationRef.current = 0;
        setRecordingDuration(0);
        recordIdRef.current = crypto.randomUUID();
      }
      setCanContinue(false);
    } catch (error) {
      if (sessionRef.current.isCurrent(id)) {
        abandonRecording();
        setError(t('error.audio') + (error as Error).message);
      }
    } finally {
      if (sessionRef.current.isCurrent(id)) setIsStarting(false);
    }
  }, [blocked, canContinue, apiKey, transcript, optimizedText, selectedBackend, terminology,
    handleGladiaTranscript, handleGladiaSessionComplete, abandonRecording, t]);

  const handleStartRecording = useCallback(() => { void startRecording(false); }, [startRecording]);
  const handleContinueRecording = useCallback(() => { void startRecording(true); }, [startRecording]);
  const handleCancelRecording = useCallback(() => { abandonRecording(); setError(null); }, [abandonRecording]);
  const handleInsertRecording = useCallback(() => {
    const active = activeRecordingRef.current;
    if (!active?.started || active.stopped || active.backend === 'gladia-realtime' ||
        !sessionRef.current.isCurrent(active.id)) return;
    audioRecorderRef.current?.insertRecording();
  }, []);
  const handleStopRecording = useCallback(() => {
    const active = activeRecordingRef.current;
    if (!active?.started || active.stopped || !sessionRef.current.isCurrent(active.id)) return;
    active.stopped = true;
    setIsProcessing(true);
    audioRecorderRef.current?.stopRecording();
    if (!sessionRef.current.isCurrent(active.id)) return;
    if (active.backend === 'gladia-realtime') {
      if (!gladiaLiveRef.current?.stop()) void handleGladiaSessionComplete(active.id);
      else active.timeout = setTimeout(() => {
        if (sessionRef.current.isCurrent(active.id)) {
          setError(t('error.live.timeout'));
          void handleGladiaSessionComplete(active.id);
        }
      }, 10000);
    }
  }, [handleGladiaSessionComplete, t]);

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
          onAudioSegment={handleAudioSegment}
          onInsertRequest={selectedBackend !== 'gladia-realtime' ? handleInsertRecording : undefined}
          onAudioChunk={selectedBackend === 'gladia-realtime' ? handleGladiaAudioChunk : undefined}
          onStartRequest={handleStartRecording}
          onStopRequest={handleStopRecording}
          onCancelRequest={handleCancelRecording}
          onContinueRequest={handleContinueRecording}
          canContinue={canContinue}
          disabled={blocked}
          onStateChange={handleStateChange}
          onError={handleError}
        />

        {/* 操作按钮 */}
        <div className="w-full flex flex-col items-center gap-3 mt-2">
          <div className="grid w-full max-w-5xl grid-cols-2 gap-3 lg:grid-cols-4">
          {isHydrated && currentAudioUrl && !isRecording && (
            <>
              <button
                onClick={handlePlayAudio}
                className="min-w-0 flex items-center justify-center gap-2 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                disabled={blocked}
              >
                <span>▶️</span> {t('op.play')}
              </button>
              <button
                onClick={handleReRecognize}
                className="min-w-0 flex items-center justify-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                disabled={blocked || !apiKey.trim()}
              >
                <span>🔄</span> {isProcessing ? t('op.processing') : t('op.retry')}
              </button>
              <button
                onClick={handleOptimize}
                className="min-w-0 flex items-center justify-center gap-2 px-3 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                disabled={blocked || !transcript.trim() || !aiApiKey.trim()}
              >
                <span>✨</span> {isOptimizing ? t('ai.optimizing') : t('op.reoptimize')}
              </button>
              <button
                onClick={handleCopy}
                className="min-w-0 flex items-center justify-center gap-2 px-3 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                disabled={!transcript || isProcessing}
              >
                <span>📋</span> {t('op.copy')}
              </button>
            </>
          )}
          </div>

          {/* 录音后的自动处理选项：空间足够时横向排列，否则自动换成上下排列 */}
          <div className="grid w-full max-w-4xl grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
            <label className="flex min-w-0 items-center justify-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer sm:justify-start">
              <input
                type="checkbox"
                checked={autoOptimize}
                onChange={(e) => {
                  setAutoOptimize(e.target.checked);
                  localStorage.setItem('ai-auto-optimize', String(e.target.checked));
                }}
                className="h-4 w-4 shrink-0 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
              />
              <span>{t('ai.auto.optimize')}</span>
            </label>
            <label className="flex min-w-0 items-center justify-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer sm:justify-start">
              <input
                type="checkbox"
                checked={autoCopyOptimized}
                onChange={(e) => {
                  setAutoCopyOptimized(e.target.checked);
                  localStorage.setItem('ai-auto-copy-optimized', String(e.target.checked));
                }}
                className="h-4 w-4 shrink-0 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
              />
              <span>{t('ai.auto.copy')}</span>
            </label>
          </div>

          <div className="flex min-h-5 flex-wrap items-center justify-center gap-3 text-center">
            {copySuccess && (
              <span className="text-sm font-medium text-green-600 dark:text-green-400">
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
            readOnly={blocked}
            onChange={(e) => setOptimizedText(e.target.value)}
            className="w-full h-full min-h-[100px] p-3 bg-white dark:bg-gray-800 border border-purple-200 dark:border-purple-700 rounded-lg text-gray-800 dark:text-gray-100 text-lg leading-relaxed focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
          />
        </div>
      )}

      {/* 实时字幕区域（转写结果） */}
      <RealtimeSubtitles
        disabled={blocked}
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
          disabled={blocked}
        />
      )}

      {/* 历史记录区域 */}
      <div id="history-panel">
        <HistoryPanel onSelectRecord={handleSelectRecord} disabled={blocked} />
      </div>

      {/* ASR 后端设置 */}
      <div className="p-4 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg">
        <label htmlFor="asr-backend" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          {t('settings.asr.backend')}
        </label>
        <select
          id="asr-backend"
          value={selectedBackend}
          disabled={blocked}
          onChange={(e) => setSelectedBackend(e.target.value as ASRBackend)}
          className="backend-select w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
        >
          {AVAILABLE_BACKENDS.map(backend => (
            <option key={backend.name} value={backend.name}>
              {backend.label}
            </option>
          ))}
        </select>
        <div className="mt-3">
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input id="asr-compress-audio" type="checkbox" checked={compressAudio} disabled={blocked}
              onChange={(event) => {
                setCompressAudio(event.target.checked);
                localStorage.setItem('asr-compress-audio', String(event.target.checked));
              }} aria-describedby="asr-compress-help" />
            {t('settings.asr.compress')}
          </label>
          <p id="asr-compress-help" className="mt-1 text-xs text-gray-500 dark:text-gray-400">{t('settings.asr.compress.help')}</p>
          {selectedBackend === 'gladia-realtime' && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{t('settings.asr.compress.live')}</p>}
        </div>
        {selectedBackend === 'openai' && (
          <div className="mt-4 space-y-3">
            <div>
              <label htmlFor="asr-base-url" className="block text-sm font-medium mb-2">
                {t('settings.asr.baseurl')}
              </label>
              <input
                id="asr-base-url"
                disabled={blocked}
                type="url"
                value={asrBaseUrl}
                onChange={(e) => {
                  setAsrBaseUrl(e.target.value);
                  localStorage.setItem('openai-asr-base-url', e.target.value);
                }}
                placeholder="https://api.openai.com/v1"
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              />
            </div>
            <div>
              <label htmlFor="asr-model" className="block text-sm font-medium mb-2">
                {t('settings.asr.model')}
              </label>
              <input
                id="asr-model"
                disabled={blocked}
                type="text"
                value={asrModel}
                onChange={(e) => {
                  setAsrModel(e.target.value);
                  localStorage.setItem('openai-asr-model', e.target.value);
                }}
                placeholder="whisper-1"
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              />
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">{t('settings.asr.compatible.help')}</p>
          </div>
        )}
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
                    if (/^https:\/\/openrouter\.ai(?:\/|$)/i.test(asrBaseUrl.trim())) return 'https://openrouter.ai/keys';
                    return 'https://platform.openai.com/api-keys';
                  case 'gladia':
                  case 'gladia-realtime':
                    return 'https://app.gladia.io/account';
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
          disabled={blocked}
          autoComplete="off"
          value={apiKey}
          onChange={(e) => {
            const newKey = e.target.value;
            setApiKey(newKey);
            if (isHydrated) {
              localStorage.setItem(getApiKeyStorageKey(selectedBackend), newKey);
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
              case 'gladia-realtime':
                return 'gladia_...';
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
                  compressAudio,
                  openaiCompatible: { model: asrModel, baseUrl: asrBaseUrl },
                  apiKeys: {
                    elevenlabs: localStorage.getItem('elevenlabs-api-key') || '',
                    soniox: localStorage.getItem('soniox-api-key') || '',
                    groq: localStorage.getItem('groq-api-key') || '',
                    openai: localStorage.getItem('openai-api-key') || '',
                    gladia: localStorage.getItem('gladia-api-key') || '',
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
              disabled={blocked}
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (event) => {
                  if (busyRef.current) return;
                  try {
                    const config = JSON.parse(event.target?.result as string);
                    
                    // 验证配置格式
                    if (!config.asr || !config.aiOptimizer) {
                      alert(t('config.import.invalid'));
                      return;
                    }

                    if (confirm(t('config.import.confirm'))) {
                      // 导入ASR配置
                      if (typeof config.asr.compressAudio === 'boolean') {
                        setCompressAudio(config.asr.compressAudio);
                        localStorage.setItem('asr-compress-audio', String(config.asr.compressAudio));
                      }
                      if (config.asr.openaiCompatible) {
                        const { model, baseUrl } = config.asr.openaiCompatible;
                        if (typeof model === 'string') {
                          setAsrModel(model);
                          localStorage.setItem('openai-asr-model', model);
                        }
                        if (typeof baseUrl === 'string') {
                          setAsrBaseUrl(baseUrl);
                          localStorage.setItem('openai-asr-base-url', baseUrl);
                        }
                      }
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
                        if (config.asr.backend) {
                          const importedKey = config.asr.apiKeys[config.asr.backend] ||
                            config.asr.apiKeys[getApiKeyStorageKey(config.asr.backend as ASRBackend)];
                          if (importedKey) setApiKey(importedKey as string);
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
          aria-label={t('ai.title')}
          value={aiBackend}
          onChange={(e) => {
            const newBackend = e.target.value as AIOptimizerBackend;
            setAiBackend(newBackend);
            localStorage.setItem('ai-optimizer-backend', newBackend);
          }}
          className="backend-select w-full px-4 py-2 mb-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
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
            disabled={!isHydrated || blocked || !transcript.trim() || !aiApiKey.trim()}
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
