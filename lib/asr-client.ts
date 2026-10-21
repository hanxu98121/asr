import { ASRResult } from './types';
import type { TerminologyItem } from './types';
import { compressRecording } from './audio-compression';
import { readSTTHttpError, STTError } from './stt-errors';

export interface RecognitionOptions {
  compressAudio?: boolean;
  signal?: AbortSignal;
}

export type ASRBackend = 'elevenlabs' | 'soniox' | 'groq' | 'openai' | 'gladia' | 'gladia-realtime';

export interface ASRBackendConfig {
  name: ASRBackend;
  label: string;
  description: string;
  requiresApiKey: boolean;
  defaultModel?: string;
  supportsLanguageAuto?: boolean;
}

export const AVAILABLE_BACKENDS: ASRBackendConfig[] = [
  {
    name: 'elevenlabs',
    label: 'ElevenLabs',
    description: 'High quality ASR with Scribe model',
    requiresApiKey: true,
    defaultModel: 'scribe_v2',
    supportsLanguageAuto: true,
  },
  {
    name: 'soniox',
    label: 'Soniox',
    description: 'Fast and accurate async transcription',
    requiresApiKey: true,
    defaultModel: 'stt-async-v5',
    supportsLanguageAuto: true,
  },
  {
    name: 'groq',
    label: 'Groq',
    description: 'Fast Whisper via Groq (OpenAI compatible)',
    requiresApiKey: true,
    defaultModel: 'whisper-large-v3-turbo',
    supportsLanguageAuto: true,
  },
  {
    name: 'openai',
    label: 'OpenAI Compatible',
    description: 'OpenAI-compatible audio transcription API with custom endpoint and model',
    requiresApiKey: true,
    defaultModel: 'whisper-1',
    supportsLanguageAuto: true,
  },
  {
    name: 'gladia',
    label: 'Gladia (Async)',
    description: 'Gladia asynchronous pre-recorded transcription with custom vocabulary support',
    requiresApiKey: true,
    supportsLanguageAuto: true,
  },
  {
    name: 'gladia-realtime',
    label: 'Gladia Real Time',
    description: 'Gladia real-time transcription over WebSocket',
    requiresApiKey: true,
    supportsLanguageAuto: true,
  },
];

export class ASRClient {
  private apiKey: string = '';
  private language: string = 'auto';
  private backend: ASRBackend = 'elevenlabs';
  private terminology: TerminologyItem[] = [];
  private model: string = '';
  private baseUrl: string = '';

  constructor(apiKey?: string, language?: string, backend?: ASRBackend) {
    if (apiKey) this.apiKey = apiKey;
    if (language) this.language = language;
    if (backend) this.backend = backend;
  }

  setApiKey(apiKey: string): void {
    this.apiKey = apiKey;
  }

  setLanguage(language: string): void {
    this.language = language;
  }

  setBackend(backend: ASRBackend): void {
    this.backend = backend;
  }

  setOpenAIConfig(model: string, baseUrl: string): void {
    this.model = model.trim();
    this.baseUrl = baseUrl.trim();
  }

  setTerminology(terminology: TerminologyItem[]): void {
    this.terminology = terminology;
  }

  getBackend(): ASRBackend {
    return this.backend;
  }

  getBackendConfig(): ASRBackendConfig | undefined {
    return AVAILABLE_BACKENDS.find(b => b.name === this.backend);
  }

  /**
   * 识别音频文件
   */
  async recognizeAudio(audioBlob: Blob, fileName: string = 'audio.wav', options: RecognitionOptions = {}): Promise<ASRResult> {
    if (!this.apiKey) {
      throw new Error('Please enter your API Key first');
    }

    try {
      options.signal?.throwIfAborted();
      if (options.compressAudio) {
        try {
          audioBlob = await compressRecording(audioBlob, options.signal);
          fileName = fileName.replace(/\.[^.]+$/, '') + '.mp3';
        } catch (error) {
          if (options.signal?.aborted) throw error;
          throw new STTError('Audio compression failed. Disable compression and retry.', 'COMPRESSION_FAILED');
        }
      }
      options.signal?.throwIfAborted();
      const formData = new FormData();
      formData.append('audio', audioBlob, fileName);
      formData.append('apiKey', this.apiKey);
      formData.append('language', this.language);
      formData.append('backend', this.backend);
      if (this.backend === 'openai') {
        if (this.model) formData.append('model', this.model);
        if (this.baseUrl) formData.append('baseUrl', this.baseUrl);
      }
      if (this.terminology.length > 0) {
        formData.append('terminology', JSON.stringify(this.terminology));
      }

      const response = await fetch('/api/stt', {
        method: 'POST',
        body: formData,
        signal: options.signal,
      });

      if (!response.ok) throw await readSTTHttpError(response, 'Recognition service failed');
      const result = await response.json();

      if (!result.success) {
        throw new STTError(result.error || 'Recognition failed', result.errorCode || 'SERVICE_ERROR');
      }

      return {
        success: true,
        text: result.text,
        isFinal: true,
        timestamp: Date.now(),
        duration: result.duration,
        language: result.language,
      };

    } catch (error) {
      return {
        success: false,
        text: '',
        isFinal: true,
        timestamp: Date.now(),
        error: (error as Error).message,
        errorCode: error instanceof STTError ? error.code : 'SERVICE_ERROR',
      };
    }
  }
}
