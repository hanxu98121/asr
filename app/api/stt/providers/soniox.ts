/**
 * Soniox ASR Provider
 */

import { FetchHttpClient, isSonioxHttpError, SONIOX_API_BASE_URL, SonioxNodeClient } from '@soniox/node';
import { readSTTHttpError, STTError } from '../../../../lib/stt-errors';
import { STT_PROCESSING_BUDGET_MS } from '../processing-budget';
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
    const { apiKey, language = 'auto', model = 'stt-async-v5', enablePunctuation = true } = config;

    // Create Soniox client with provided API key
    const client = new SonioxNodeClient({
      api_key: apiKey,
      http_client: new FetchHttpClient({
        base_url: process.env.SONIOX_API_BASE_URL ?? SONIOX_API_BASE_URL,
        default_headers: { Authorization: `Bearer ${apiKey}` },
        default_timeout_ms: STT_PROCESSING_BUDGET_MS,
      }),
    });

    try {
      // Call transcribe API with wait option to get result directly
      const transcription = await client.stt.transcribe({
        model,
        file: new Blob([new Uint8Array(audioBuffer)], { type: config.mimeType || 'audio/wav' }),
        filename: fileName,
        wait: true,
        signal: config.signal,
        wait_options: { signal: config.signal },
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
      if (config.signal?.aborted) throw config.signal.reason;
      if (isSonioxHttpError(error)) {
        if (error.code === 'timeout') throw new STTError(error.message, 'TRANSCRIPTION_TIMEOUT', 504);
        if (error.statusCode) {
          throw await readSTTHttpError(new Response(error.bodyText || error.message, { status: error.statusCode }), 'Soniox API error');
        }
      }
      const err = error as Error;
      throw new Error(`Soniox API error: ${err.message}`);
    }
  }
}
