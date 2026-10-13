'use client';

import { useState, useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { AudioProcessor } from '@/lib/audio-processor';
import { RecordingState } from '@/lib/types';
import { useTranslation } from '@/lib/i18n';

interface AudioRecorderProps {
  onAudioComplete: (wavData: Uint8Array, duration: number) => void;
  onAudioChunk?: (pcmData: Uint8Array) => void;
  onAudioSegment?: (wavData: Uint8Array) => void;
  onInsertRequest?: () => void;
  onStartRequest?: () => void;
  onStopRequest?: () => void;
  onCancelRequest?: () => void;
  onContinueRequest?: () => void;
  canContinue?: boolean;
  disabled?: boolean;
  onStateChange: (state: RecordingState) => void;
  onError: (error: string) => void;
}

export interface AudioRecorderHandle {
  startRecording: () => Promise<void>;
  stopRecording: () => void;
  cancelRecording: () => void;
  insertRecording: () => void;
}

const BUFFER_SIZE = 4096;

const AudioRecorder = forwardRef<AudioRecorderHandle, AudioRecorderProps>(
  ({ onAudioComplete, onAudioChunk, onAudioSegment, onInsertRequest, onStartRequest, onStopRequest, onCancelRequest, onContinueRequest,
    canContinue = false, disabled = false, onStateChange, onError }, ref) => {
  const { t } = useTranslation();
  const [recordingState, setRecordingState] = useState<RecordingState>({
    isRecording: false,
    isPaused: false,
    duration: 0,
    volume: 0,
  });

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Float32Array[]>([]);
  const audioProcessorRef = useRef<AudioProcessor | null>(null);
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const isRecordingRef = useRef(false);
  const isPausedRef = useRef(false);
  const sampleCountRef = useRef(0);
  const startingRef = useRef(false);
  const mountedRef = useRef(true);
  const segmentStartRef = useRef(0);
  const insertedRef = useRef(false);

  // 暴露给父组件的方法
  useImperativeHandle(ref, () => ({
    startRecording,
    stopRecording,
    cancelRecording,
    insertRecording,
  }));

  // 请求麦克风权限并开始录音
  const startRecording = async () => {
    if (startingRef.current || isRecordingRef.current) return;
    startingRef.current = true;
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error(t('audio.browser.not.support'));
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 44100,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      if (!mountedRef.current) {
        stream.getTracks().forEach(track => track.stop());
        throw new Error('Recorder has been unmounted');
      }

      streamRef.current = stream;

      // 初始化音频上下文
      const audioContext = new AudioContext({ sampleRate: 44100 });
      audioContextRef.current = audioContext;

      // 创建音频源和分析器
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 2048;
      analyserRef.current = analyser;

      // 创建脚本处理器，直接处理原始音频数据
      const scriptProcessor = audioContext.createScriptProcessor(BUFFER_SIZE, 1, 1);
      scriptProcessorRef.current = scriptProcessor;

      // 初始化音频处理器
      // Browsers may ignore the requested sample rate, so use the actual rate.
      audioProcessorRef.current = new AudioProcessor(audioContext.sampleRate, 1);
      audioChunksRef.current = [];
      sampleCountRef.current = 0;
      segmentStartRef.current = 0;
      insertedRef.current = false;

      // 处理实时音频数据
      scriptProcessor.onaudioprocess = (event) => {
        if (!isRecordingRef.current || isPausedRef.current) return;

        const inputData = event.inputBuffer.getChannelData(0);
        // Copy each small frame once. Repeatedly reallocating the complete recording
        // becomes prohibitively expensive during multi-minute sessions.
        audioChunksRef.current.push(new Float32Array(inputData));
        sampleCountRef.current += inputData.length;

        // Gladia Live accepts binary 16 kHz / 16-bit / mono PCM frames.
        if (onAudioChunk && audioProcessorRef.current) {
          const pcmData = audioProcessorRef.current.convertToPCM(inputData);
          onAudioChunk(new Uint8Array(pcmData.buffer, pcmData.byteOffset, pcmData.byteLength));
        }
      };

      // 连接音频节点
      source.connect(analyser);
      analyser.connect(scriptProcessor);
      scriptProcessor.connect(audioContext.destination);
      if (audioContext.state === 'suspended') await audioContext.resume();
      if (!mountedRef.current) throw new Error('Recorder has been unmounted');

      // 开始计时
      durationIntervalRef.current = setInterval(() => {
        if (isPausedRef.current) return;
        setRecordingState(prev => ({ ...prev, duration: sampleCountRef.current / audioContext.sampleRate }));
      }, 100);

      // 开始音量检测
      const updateVolume = () => {
        if (analyserRef.current && isRecordingRef.current && !isPausedRef.current) {
          const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
          analyserRef.current.getByteFrequencyData(dataArray);
          const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
          const volume = Math.round((average / 255) * 100);

          setRecordingState(prev => ({ ...prev, volume }));
          animationFrameRef.current = requestAnimationFrame(updateVolume);
        }
      };
      const newState = { ...recordingState, isRecording: true, isPaused: false, duration: 0 };
      isRecordingRef.current = true;
      isPausedRef.current = false;
      setRecordingState(newState);
      onStateChange(newState);
      updateVolume();
    } catch (error) {
      console.error('Failed to start recording:', error);
      cleanup();
      throw error;
    } finally {
      startingRef.current = false;
    }
  };

  // Capture only new frames, keeping the microphone and complete audio intact.
  const insertRecording = () => {
    if (!isRecordingRef.current || !onAudioSegment || !audioProcessorRef.current) return;
    const end = audioChunksRef.current.length;
    if (end === segmentStartRef.current) return;
    try {
      const chunks = audioChunksRef.current.slice(segmentStartRef.current, end);
      const samples = new Float32Array(chunks.reduce((size, chunk) => size + chunk.length, 0));
      let offset = 0;
      for (const chunk of chunks) { samples.set(chunk, offset); offset += chunk.length; }
      const pcm = audioProcessorRef.current.convertToPCM(samples);
      if (!pcm.length) return;
      const wav = audioProcessorRef.current.createWavFile(pcm);
      segmentStartRef.current = end;
      insertedRef.current = true;
      onAudioSegment(wav);
    } catch (error) { onError((error as Error).message); }
  };

  // 停止录音
  const stopRecording = () => {
    if (!isRecordingRef.current) return;
    if (insertedRef.current) insertRecording();
    isRecordingRef.current = false;
    try {
      // 生成完整的WAV文件
      const totalSamples = audioChunksRef.current.reduce((total, chunk) => total + chunk.length, 0);
      if (audioProcessorRef.current) {
        const completeAudio = new Float32Array(totalSamples);
        let offset = 0;
        for (const chunk of audioChunksRef.current) {
          completeAudio.set(chunk, offset);
          offset += chunk.length;
        }
        const pcmData = audioProcessorRef.current.convertToPCM(completeAudio);
        const wavData = audioProcessorRef.current.createWavFile(pcmData);
        onAudioComplete(wavData, pcmData.length / 16000);
      }
    } catch (error) {
      console.error('Failed to process audio:', error);
      onError((error as Error).message);
    } finally {
      cleanup();
      const newState = { ...recordingState, isRecording: false, isPaused: false, volume: 0 };
      setRecordingState(newState);
      onStateChange(newState);
    }
  };

  // Cancellation must not emit onAudioComplete, including during unmount.
  const cancelRecording = () => {
    cleanup();
    const newState = { isRecording: false, isPaused: false, duration: 0, volume: 0 };
    setRecordingState(newState);
    onStateChange(newState);
  };

  const cleanup = () => {
      audioChunksRef.current = [];
      isRecordingRef.current = false;
      isPausedRef.current = false;

      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }

      if (scriptProcessorRef.current) {
        scriptProcessorRef.current.onaudioprocess = null;
        scriptProcessorRef.current.disconnect();
        scriptProcessorRef.current = null;
      }

      if (analyserRef.current) {
        analyserRef.current.disconnect();
        analyserRef.current = null;
      }

      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }

      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
        durationIntervalRef.current = null;
      }

      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }

  };

  // 暂停/继续录音
  const togglePause = () => {
    if (!recordingState.isRecording) return;

    const newState = { ...recordingState, isPaused: !recordingState.isPaused, volume: 0 };
    isPausedRef.current = newState.isPaused;
    setRecordingState(newState);
    onStateChange(newState);
    if (!newState.isPaused) {
      const updateVolume = () => {
        if (!isRecordingRef.current || isPausedRef.current || !analyserRef.current) return;
        const data = new Uint8Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getByteFrequencyData(data);
        const volume = Math.round(data.reduce((sum, n) => sum + n, 0) / data.length / 255 * 100);
        setRecordingState(prev => ({ ...prev, volume }));
        animationFrameRef.current = requestAnimationFrame(updateVolume);
      };
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      updateVolume();
    }
  };

  // 组件卸载时清理
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      cleanup();
    };
  }, []);

  return (
    <div className="audio-recorder">
      {!recordingState.isRecording ? (
        <div className="flex flex-wrap justify-center gap-3">
        <button
          disabled={disabled}
          onClick={() => onStartRequest ? onStartRequest() : void startRecording().catch(error => onError(error.message))}
          className="bg-red-500 hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3 px-6 rounded-full transition-all duration-200 transform hover:scale-105 flex items-center gap-2"
        >
          <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
            <path d="M7 4a3 3 0 016 0v6a3 3 0 11-6 0V4z" />
            <path d="M5.5 10a.5.5 0 00-1 0v.5a5.5 5.5 0 0011 0v-.5a.5.5 0 00-1 0v.5a4.5 4.5 0 11-9 0v-.5z" />
            <path d="M10 17a.5.5 0 00.5-.5v-3a.5.5 0 00-1 0v3c0 .276.224.5.5.5z" />
          </svg>
          {t('audio.start')}
        </button>
        {canContinue && (
          <button disabled={disabled} onClick={onContinueRequest}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold py-3 px-6 rounded-full">
            {t('audio.continue.previous')}
          </button>
        )}
        </div>
      ) : (
        <div className="flex flex-wrap justify-center gap-3">
          <button
            onClick={togglePause}
            className="bg-yellow-500 hover:bg-yellow-600 text-white font-bold py-3 px-6 rounded-full transition-all duration-200 flex items-center gap-2"
          >
            {recordingState.isPaused ? (
              <>
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                </svg>
                {t('audio.resume')}
              </>
            ) : (
              <>
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M5.75 3a.75.75 0 00-.75.75v12.5c0 .414.336.75.75.75h1.5a.75.75 0 00.75-.75V3.75A.75.75 0 007.25 3h-1.5zM12.75 3a.75.75 0 00-.75.75v12.5c0 .414.336.75.75.75h1.5a.75.75 0 00.75-.75V3.75a.75.75 0 00-.75-.75h-1.5z" />
                </svg>
                {t('audio.pause')}
              </>
            )}
          </button>
          {onInsertRequest && (
            <button onClick={onInsertRequest}
              title={t('audio.insert.help')}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-full">
              {t('audio.insert')}
            </button>
          )}
          <button
            onClick={() => onStopRequest ? onStopRequest() : stopRecording()}
            className="bg-gray-700 hover:bg-gray-800 text-white font-bold py-3 px-6 rounded-full transition-all duration-200 flex items-center gap-2"
          >
            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
              <path d="M5 4a1 1 0 00-1 1v10a1 1 0 001 1h10a1 1 0 001-1V5a1 1 0 00-1-1H5z" />
            </svg>
            {t('audio.stop')}
          </button>
          <button onClick={() => onCancelRequest ? onCancelRequest() : cancelRecording()}
            className="bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-6 rounded-full">
            {t('audio.cancel')}
          </button>
        </div>
      )}

      {recordingState.isRecording && (
        <div className="mt-3 flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full ${recordingState.isPaused ? 'bg-yellow-500' : 'animate-pulse bg-red-500'}`}></div>
            <span className="text-sm font-mono">
              {Math.floor(recordingState.duration / 60).toString().padStart(2, '0')}:
              {Math.floor(recordingState.duration % 60).toString().padStart(2, '0')}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 transition-all duration-100"
                style={{ width: `${recordingState.volume}%` }}
              ></div>
            </div>
            <span className="text-xs text-gray-500">{recordingState.volume}%</span>
          </div>
        </div>
      )}
    </div>
  );
});

AudioRecorder.displayName = 'AudioRecorder';

export default AudioRecorder;
