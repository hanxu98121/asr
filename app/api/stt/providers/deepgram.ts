/**
 * Deepgram ASR Provider
 * REST API implementation
 */

import { ASRProvider, ASRConfig, ASRResult } from './types';

export class DeepgramProvider implements ASRProvider {
  name = 'deepgram';
  private baseUrl = 'https://api.deepgram.com/v1/listen';

  async transcribe(
    audioBuffer: Buffer,
    fileName: string,
    config: ASRConfig
  ): Promise<ASRResult> {
    const { apiKey, language = 'zh', model = 'nova-3' } = config;

    const url = new URL(this.baseUrl);
    url.searchParams.append('model', model);
    url.searchParams.append('smart_format', 'true');
    
    if (language && language !== 'auto') {
      url.searchParams.append('language', language);
    } else if (language === 'auto') {
      url.searchParams.append('detect_language', 'true');
    }

    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'Authorization': `Token ${apiKey}`,
        'Content-Type': 'audio/*', // Deepgram can auto-detect format
      },
      body: audioBuffer,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      throw new Error(
        errorData?.err_msg || errorData?.reason || `Deepgram API error: ${response.status}`
      );
    }

    const result = await response.json();

    const text = result.results?.channels?.[0]?.alternatives?.[0]?.transcript || '';
    const confidence = result.results?.channels?.[0]?.alternatives?.[0]?.confidence;
    const detectedLanguage = result.results?.channels?.[0]?.detected_language;

    return {
      text,
      language: detectedLanguage || language,
      duration: result.metadata?.duration,
      confidence,
      rawResponse: result,
    };
  }
}
