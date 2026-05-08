/**
 * Gladia ASR Provider
 * Pre-recorded transcription with custom vocabulary support
 */

import { ASRConfig, ASRProvider, ASRResult } from './types';

interface GladiaVocabularyEntry {
  value: string;
  pronunciations?: string[];
  intensity?: number;
  language?: string;
}

interface GladiaUploadResponse {
  audio_url: string;
}

interface GladiaInitResponse {
  id: string;
  status?: string;
  error_code?: number;
}

interface GladiaGetResultResponse {
  id: string;
  status: 'queued' | 'processing' | 'done' | 'error';
  error_code?: number | null;
  request_params?: {
    language?: string;
  };
  result?: {
    metadata?: {
      audio_duration?: number;
    };
    transcription?: {
      full_transcript?: string;
      languages?: string[];
      utterances?: Array<{
        text?: string;
      }>;
    };
  };
}

export class GladiaProvider implements ASRProvider {
  name = 'gladia';
  private baseUrl = 'https://api.gladia.io/v2';

  async transcribe(
    audioBuffer: Buffer,
    fileName: string,
    config: ASRConfig
  ): Promise<ASRResult> {
    const { apiKey, language = 'auto', terminology = [] } = config;

    const uploaded = await this.uploadAudio(apiKey, audioBuffer, fileName);
    const job = await this.createTranscriptionJob(apiKey, uploaded.audio_url, language, terminology);
    const result = await this.waitForResult(apiKey, job.id);

    const text = this.extractText(result);
    if (!text) {
      throw new Error('Gladia transcription returned empty text');
    }

    return {
      text,
      language: this.extractLanguage(result, language),
      duration: result.result?.metadata?.audio_duration,
      rawResponse: result,
    };
  }

  private async uploadAudio(apiKey: string, audioBuffer: Buffer, fileName: string): Promise<GladiaUploadResponse> {
    const form = new FormData();
    form.append('audio', new Blob([new Uint8Array(audioBuffer)]), fileName);

    const response = await fetch(`${this.baseUrl}/upload`, {
      method: 'POST',
      headers: {
        'x-gladia-key': apiKey,
      },
      body: form,
    });

    if (!response.ok) {
      throw new Error(await this.readErrorMessage(response, 'Gladia upload failed'));
    }

    const data = (await response.json()) as GladiaUploadResponse;
    if (!data.audio_url) {
      throw new Error('Gladia upload did not return an audio_url');
    }

    return data;
  }

  private async createTranscriptionJob(
    apiKey: string,
    audioUrl: string,
    language: string,
    terminology: Array<{ source: string; target: string }>
  ): Promise<GladiaInitResponse> {
    const customVocabulary = this.buildCustomVocabulary(terminology, language);
    const body: Record<string, any> = {
      audio_url: audioUrl,
      detect_language: language === 'auto',
    };

    if (language !== 'auto') {
      body.language = language;
    }

    if (customVocabulary.length > 0) {
      body.custom_vocabulary = true;
      body.custom_vocabulary_config = {
        vocabulary: customVocabulary,
        default_intensity: 0.4,
      };
    }

    const response = await fetch(`${this.baseUrl}/pre-recorded`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-gladia-key': apiKey,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(await this.readErrorMessage(response, 'Gladia transcription request failed'));
    }

    const data = (await response.json()) as GladiaInitResponse;
    if (!data.id) {
      throw new Error('Gladia transcription request did not return a job id');
    }

    return data;
  }

  private async waitForResult(apiKey: string, jobId: string): Promise<GladiaGetResultResponse> {
    const timeoutMs = 55000;
    const intervalMs = 1500;
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
      const response = await fetch(`${this.baseUrl}/pre-recorded/${jobId}`, {
        headers: {
          'x-gladia-key': apiKey,
        },
      });

      if (!response.ok) {
        throw new Error(await this.readErrorMessage(response, 'Gladia status check failed'));
      }

      const data = (await response.json()) as GladiaGetResultResponse;
      if (data.status === 'done') {
        return data;
      }

      if (data.status === 'error') {
        throw new Error(`Gladia transcription failed${data.error_code ? ` (${data.error_code})` : ''}`);
      }

      await this.sleep(intervalMs);
    }

    throw new Error('Gladia transcription timed out');
  }

  private buildCustomVocabulary(
    terminology: Array<{ source: string; target: string }>,
    language: string
  ): GladiaVocabularyEntry[] {
    const entries: GladiaVocabularyEntry[] = [];

    for (const item of terminology) {
      const value = item.target.trim();
      if (!value) continue;

      const pronunciations = this.splitAliases(item.source);
      const entry: GladiaVocabularyEntry = { value };

      if (pronunciations.length > 0) {
        entry.pronunciations = pronunciations;
      }

      if (language && language !== 'auto') {
        entry.language = language;
      }

      entries.push(entry);
    }

    return entries;
  }

  private splitAliases(source: string): string[] {
    return source
      .split(/[，,、/;；\n]+/g)
      .map(part => part.trim())
      .filter(Boolean);
  }

  private extractText(result: GladiaGetResultResponse): string {
    return (
      result.result?.transcription?.full_transcript?.trim() ||
      result.result?.transcription?.utterances?.map(utterance => utterance.text?.trim()).filter(Boolean).join(' ') ||
      ''
    );
  }

  private extractLanguage(result: GladiaGetResultResponse, fallbackLanguage: string): string | undefined {
    return (
      result.result?.transcription?.languages?.[0] ||
      result.request_params?.language ||
      (fallbackLanguage === 'auto' ? undefined : fallbackLanguage)
    );
  }

  private async readErrorMessage(response: Response, fallback: string): Promise<string> {
    const errorData = await response.json().catch(() => null);
    return (
      errorData?.message ||
      errorData?.error ||
      errorData?.detail ||
      errorData?.error?.message ||
      `${fallback}: ${response.status}`
    );
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
