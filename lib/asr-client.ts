import { ASRResult } from './types';

export type ASRBackend = 'elevenlabs' | 'soniox' | 'groq' | 'openai';

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
    defaultModel: 'scribe_v1',
    supportsLanguageAuto: true,
  },
  {
    name: 'soniox',
    label: 'Soniox',
    description: 'Fast and accurate async transcription',
    requiresApiKey: true,
    defaultModel: 'stt-async-v4',
    supportsLanguageAuto: true,
  },
  {
    name: 'groq',
    label: 'Groq',
    description: 'Fast Whisper via Groq (OpenAI compatible)',
    requiresApiKey: true,
    defaultModel: 'whisper-large-v3',
    supportsLanguageAuto: true,
  },
  {
    name: 'openai',
    label: 'OpenAI',
    description: 'Official OpenAI Whisper API',
    requiresApiKey: true,
    defaultModel: 'whisper-1',
    supportsLanguageAuto: true,
  },
];

export class ASRClient {
  private apiKey: string = '';
  private language: string = 'auto';
  private backend: ASRBackend = 'elevenlabs';

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

  getBackend(): ASRBackend {
    return this.backend;
  }

  getBackendConfig(): ASRBackendConfig | undefined {
    return AVAILABLE_BACKENDS.find(b => b.name === this.backend);
  }

  /**
   * 识别音频文件
   */
  async recognizeAudio(audioBlob: Blob, fileName: string = 'audio.wav'): Promise<ASRResult> {
    if (!this.apiKey) {
      throw new Error('Please enter your API Key first');
    }

    const formData = new FormData();
    formData.append('audio', audioBlob, fileName);
    formData.append('apiKey', this.apiKey);
    formData.append('language', this.language);
    formData.append('backend', this.backend);

    try {
      const response = await fetch('/api/stt', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Recognition failed');
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
      };
    }
  }
}
