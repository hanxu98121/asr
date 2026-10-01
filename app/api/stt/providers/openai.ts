/**
 * OpenAI-compatible audio transcription provider
 */

import { ASRProvider, ASRConfig, ASRResult } from './types';
import { OpenAICompatibleTokenJoinStrategy } from './strategies';

export class OpenAIProvider implements ASRProvider {
  name = 'openai';
  private baseUrl = 'https://api.openai.com/v1';
  private tokenJoinStrategy: OpenAICompatibleTokenJoinStrategy;

  constructor() {
    this.tokenJoinStrategy = new OpenAICompatibleTokenJoinStrategy();
  }

  async transcribe(
    audioBuffer: Buffer,
    fileName: string,
    config: ASRConfig
  ): Promise<ASRResult> {
    const { apiKey, language = 'auto' } = config;
    const model = config.model?.trim() || 'whisper-1';
    const baseUrl = (config.baseUrl?.trim() || this.baseUrl).replace(/\/+$/, '');
    const url = new URL(baseUrl);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
      throw new Error('Base URL must be an HTTP(S) URL without credentials, query, or fragment');
    }

    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(audioBuffer)]), fileName);
    form.append('model', model);

    if (language && language !== 'auto') {
      form.append('language', language);
    }

    form.append('response_format', 'json');

    const response = await fetch(`${baseUrl}/audio/transcriptions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
      body: form,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      throw new Error(
        errorData?.error?.message || `OpenAI Compatible ASR error: ${response.status}`
      );
    }

    const result = await response.json();
    if (typeof result.text !== 'string' && !Array.isArray(result.segments)) {
      throw new Error('Invalid transcription response: expected text or segments');
    }

    // Process result
    let text = result.text || '';

    // If we have segments, process them
    if (result.segments && result.segments.length > 0) {
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
