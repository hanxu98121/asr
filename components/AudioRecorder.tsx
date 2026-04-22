'use client';

import { useState, useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { AudioProcessor } from '@/lib/audio-processor';
import { RecordingState } from '@/lib/types';
import { useTranslation } from '@/lib/i18n';

interface AudioRecorderProps {
  onAudioComplete: (wavData: Uint8Array, duration: number) => void;
  onStateChange: (state: RecordingState) => void;
  onError: (error: string) => void;
}

export interface AudioRecorderHandle {
  startRecording: () => void;
  stopRecording: () => void;
}

const BUFFER_SIZE = 4096;

const AudioRecorder = forwardRef<AudioRecorderHandle, AudioRecorderProps>(
  ({ onAudioComplete, onStateChange, onError }, ref) => {
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
  const audioBufferRef = useRef<Float32Array>(new Float32Array());
  const audioProcessorRef = useRef<AudioProcessor | null>(null);
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // 暴露给父组件的方法
  useImperativeHandle(ref, () => ({
    startRecording,
    stopRecording,
  }));

  // 请求麦克风权限并开始录音
  const startRecording = async () => {
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
      audioProcessorRef.current = new AudioProcessor(44100, 1);

      // 处理实时音频数据
      scriptProcessor.onaudioprocess = (event) => {
        if (recordingState.isPaused) return;

        const inputData = event.inputBuffer.getChannelData(0);
        // 将数据添加到缓冲区
        const newBuffer = new Float32Array(audioBufferRef.current.length + inputData.length);
        newBuffer.set(audioBufferRef.current);
        newBuffer.set(inputData, audioBufferRef.current.length);
        audioBufferRef.current = newBuffer;
      };

      // 连接音频节点
      source.connect(analyser);
      analyser.connect(scriptProcessor);
      scriptProcessor.connect(audioContext.destination);

      // 开始计时
      durationIntervalRef.current = setInterval(() => {
        setRecordingState(prev => ({ ...prev, duration: prev.duration + 0.1 }));
      }, 100);

      // 开始音量检测
      const updateVolume = () => {
        if (analyserRef.current && recordingState.isRecording && !recordingState.isPaused) {
          const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
          analyserRef.current.getByteFrequencyData(dataArray);
          const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
          const volume = Math.round((average / 255) * 100);

          setRecordingState(prev => ({ ...prev, volume }));
          animationFrameRef.current = requestAnimationFrame(updateVolume);
        }
      };
      updateVolume();

      const newState = { ...recordingState, isRecording: true, isPaused: false, duration: 0 };
      setRecordingState(newState);
      onStateChange(newState);
    } catch (error) {
      console.error('Failed to start recording:', error);
      onError((error as Error).message);
    }
  };

  // 停止录音
  const stopRecording = () => {
    try {
      // 生成完整的WAV文件
      if (audioBufferRef.current.length > 0 && audioProcessorRef.current) {
        const pcmData = audioProcessorRef.current.convertToPCM(audioBufferRef.current);
        const wavData = audioProcessorRef.current.createWavFile(pcmData);
        onAudioComplete(wavData, recordingState.duration);
      }
    } catch (error) {
      console.error('Failed to process audio:', error);
      onError((error as Error).message);
    } finally {
      // 清理资源
      audioBufferRef.current = new Float32Array();

      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }

      if (scriptProcessorRef.current) {
        scriptProcessorRef.current.disconnect();
      }

      if (analyserRef.current) {
        analyserRef.current.disconnect();
      }

      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }

      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
      }

      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }

      const newState = { ...recordingState, isRecording: false, isPaused: false, volume: 0 };
      setRecordingState(newState);
      onStateChange(newState);
    }
  };

  // 暂停/继续录音
  const togglePause = () => {
    if (!recordingState.isRecording) return;

    const newState = { ...recordingState, isPaused: !recordingState.isPaused, volume: 0 };
    setRecordingState(newState);
    onStateChange(newState);
  };

  // 组件卸载时清理
  useEffect(() => {
    return () => {
      if (recordingState.isRecording) {
        stopRecording();
      }
    };
  }, [recordingState.isRecording]);

  return (
    <div className="audio-recorder">
      {!recordingState.isRecording ? (
        <button
          onClick={startRecording}
          className="bg-red-500 hover:bg-red-600 text-white font-bold py-3 px-6 rounded-full transition-all duration-200 transform hover:scale-105 flex items-center gap-2"
        >
          <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
            <path d="M7 4a3 3 0 016 0v6a3 3 0 11-6 0V4z" />
            <path d="M5.5 10a.5.5 0 00-1 0v.5a5.5 5.5 0 0011 0v-.5a.5.5 0 00-1 0v.5a4.5 4.5 0 11-9 0v-.5z" />
            <path d="M10 17a.5.5 0 00.5-.5v-3a.5.5 0 00-1 0v3c0 .276.224.5.5.5z" />
          </svg>
          {t('audio.start')}
        </button>
      ) : (
        <div className="flex gap-3">
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
          <button
            onClick={stopRecording}
            className="bg-gray-700 hover:bg-gray-800 text-white font-bold py-3 px-6 rounded-full transition-all duration-200 flex items-center gap-2"
          >
            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
              <path d="M5 4a1 1 0 00-1 1v10a1 1 0 001 1h10a1 1 0 001-1V5a1 1 0 00-1-1H5z" />
            </svg>
            {t('audio.stop')}
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
