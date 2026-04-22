/**
 * Soniox ASR Provider
 */

import { SonioxNodeClient } from '@soniox/node';
import { ASRProvider, ASRConfig, ASRResult } from './types';
import { SonioxTokenJoinStrategy } from './strategies';

export class SonioxProvider implements ASRProvider {
  name = 'soniox';
  private tokenJoinStrategy: SonioxTokenJoinStrategy;

  constructor() {
    this.tokenJoinStrategy = new SonioxTokenJoinStrategy();
  }

  async transcribe(
    audioBuffer: Buffer,
    fileName: string,
    config: ASRConfig
  ): Promise<ASRResult> {
    const { apiKey, language = 'auto', model = 'stt-async-v4', enablePunctuation = true } = config;

    // Create Soniox client with provided API key
    const client = new SonioxNodeClient({
      api_key: apiKey,
    });

    try {
      // Call transcribe API with wait option to get result directly
      const transcription = await client.stt.transcribe({
        model,
        file: audioBuffer,
        filename: fileName,
        wait: true,
      });

      if (!transcription.transcript) {
        throw new Error('Transcription failed: no result returned');
      }

      // Join tokens with smart strategy (backward compatibility)
      const fullText = transcription.transcript.text || this.tokenJoinStrategy.join(transcription.transcript.tokens || []);

      return {
        text: fullText,
        language: language,
        duration: transcription.audio_duration_ms ? transcription.audio_duration_ms / 1000 : undefined,
        rawResponse: transcription,
      };

    } catch (error) {
      // Rethrow error with meaningful message
      const err = error as Error;
      throw new Error(`Soniox API error: ${err.message}`);
    }
  }
}
