/**
 * Groq ASR Provider
 * OpenAI-compatible API for Whisper
 */

import { ASRProvider, ASRConfig, ASRResult } from './types';
import { OpenAICompatibleTokenJoinStrategy } from './strategies';

export class GroqProvider implements ASRProvider {
  name = 'groq';
  private baseUrl = 'https://api.groq.com/openai/v1';
  private tokenJoinStrategy: OpenAICompatibleTokenJoinStrategy;

  constructor() {
    this.tokenJoinStrategy = new OpenAICompatibleTokenJoinStrategy();
  }

  async transcribe(
    audioBuffer: Buffer,
    fileName: string,
    config: ASRConfig
  ): Promise<ASRResult> {
    const { apiKey, language = 'zh', model = 'whisper-large-v3-turbo' } = config;

    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(audioBuffer)]), fileName);
    form.append('model', model);

    if (language && language !== 'auto') {
      form.append('language', language);
    }

    form.append('response_format', 'verbose_json');
    form.append('timestamp_granularities[]', 'segment');

    const response = await fetch(`${this.baseUrl}/audio/transcriptions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
      body: form,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      throw new Error(
        errorData?.error?.message || `Groq API error: ${response.status}`
      );
    }

    const result = await response.json();

    // Process segments into tokens if available
    let text = result.text || '';

    // If we have segments, we can process them
    if (result.segments && result.segments.length > 0) {
      // Join segments intelligently
      const segmentTexts = result.segments.map((s: any) => s.text?.trim()).filter(Boolean);
      text = this.tokenJoinStrategy.join(segmentTexts);
    }

    return {
      text,
      language: result.language,
      duration: result.duration,
      rawResponse: result,
    };
  }
}
