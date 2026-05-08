export interface ASRResult {
  success: boolean;
  text: string;
  isFinal: boolean;
  timestamp: number;
  error?: string;
  duration?: number;
  language?: string;
}

export interface TerminologyItem {
  id: string;
  source: string;
  target: string;
}

export interface TranscriptionRecord {
  id: string;
  text: string;
  optimizedText?: string;
  timestamp: number;
  duration: number;
  audioBlob?: Blob; // 保存音频用于播放
  language?: string;
}

export interface ASRConfig {
  apiKey: string;
  endpoint: string;
  format?: 'pcm' | 'mp3' | 'wav';
  sampleRate?: number;
  channel?: number;
}

export interface RecordingState {
  isRecording: boolean;
  isPaused: boolean;
  duration: number;
  volume: number;
}
