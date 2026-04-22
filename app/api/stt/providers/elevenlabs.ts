/**
 * ElevenLabs ASR Provider
 */

import { ASRProvider, ASRConfig, ASRResult } from './types';

export class ElevenLabsProvider implements ASRProvider {
  name = 'elevenlabs';

  async transcribe(
    audioBuffer: Buffer,
    fileName: string,
    config: ASRConfig
  ): Promise<ASRResult> {
    const { apiKey, language = 'zh', model = 'scribe_v1' } = config;

    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(audioBuffer)]), fileName);
    form.append('model_id', model);
    // ElevenLabs now expects empty string for auto language detection instead of 'auto'
    const langCode = language === 'auto' ? '' : language;
    if (langCode) {
      form.append('language_code', langCode);
    }
    form.append('enable_automatic_punctuation', 'true');
    form.append('tag_audio_events', 'false');
    form.append('diarize', 'false');

    const response = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
      },
      body: form,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      throw new Error(
        errorData?.detail?.message || `ElevenLabs API error: ${response.status}`
      );
    }

    const result = await response.json();

    return {
      text: result.text,
      language: result.language_code,
      duration: result.audio_duration_seconds,
      rawResponse: result,
    };
  }
}
