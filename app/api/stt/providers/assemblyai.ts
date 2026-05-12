/**
 * AssemblyAI ASR Provider
 * REST API implementation with polling
 */

import { ASRProvider, ASRConfig, ASRResult } from './types';

interface AssemblyAIUploadResponse {
  upload_url: string;
}

interface AssemblyAITranscriptionResponse {
  id: string;
  status: 'queued' | 'processing' | 'completed' | 'error';
  text?: string;
  error?: string;
  language_code?: string;
  audio_duration?: number;
  confidence?: number;
}

export class AssemblyAIProvider implements ASRProvider {
  name = 'assemblyai';
  private baseUrl = 'https://api.assemblyai.com/v2';

  async transcribe(
    audioBuffer: Buffer,
    fileName: string,
    config: ASRConfig
  ): Promise<ASRResult> {
    const { apiKey, language = 'zh', model = 'best' } = config;

    // 1. Upload audio
    const uploadUrl = await this.uploadAudio(apiKey, audioBuffer);

    // 2. Start transcription
    const transcriptId = await this.startTranscription(apiKey, uploadUrl, language, model);

    // 3. Poll for result
    const result = await this.waitForResult(apiKey, transcriptId);

    return {
      text: result.text || '',
      language: result.language_code || language,
      duration: result.audio_duration,
      confidence: result.confidence,
      rawResponse: result,
    };
  }

  private async uploadAudio(apiKey: string, audioBuffer: Buffer): Promise<string> {
    const response = await fetch(`${this.baseUrl}/upload`, {
      method: 'POST',
      headers: {
        'Authorization': apiKey,
        'Content-Type': 'application/octet-stream',
      },
      body: new Uint8Array(audioBuffer),
    });

    if (!response.ok) {
      throw new Error(`AssemblyAI upload failed: ${response.statusText}`);
    }

    const data = (await response.json()) as AssemblyAIUploadResponse;
    return data.upload_url;
  }

  private async startTranscription(
    apiKey: string,
    audioUrl: string,
    language: string,
    model: string
  ): Promise<string> {
    const body: Record<string, any> = {
      audio_url: audioUrl,
    };

    if (language === 'auto') {
      body.language_detection = true;
    } else {
      body.language_code = language;
    }

    // AssemblyAI uses speech_model for some models, but usually 'best' or 'nano'
    if (model) {
      body.speech_model = model;
    }

    const response = await fetch(`${this.baseUrl}/transcript`, {
      method: 'POST',
      headers: {
        'Authorization': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      throw new Error(errorData?.error || `AssemblyAI transcription request failed: ${response.status}`);
    }

    const data = (await response.json()) as AssemblyAITranscriptionResponse;
    return data.id;
  }

  private async waitForResult(apiKey: string, transcriptId: string): Promise<AssemblyAITranscriptionResponse> {
    const timeoutMs = 60000;
    const intervalMs = 2000;
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
      const response = await fetch(`${this.baseUrl}/transcript/${transcriptId}`, {
        headers: {
          'Authorization': apiKey,
        },
      });

      if (!response.ok) {
        throw new Error(`AssemblyAI status check failed: ${response.status}`);
      }

      const data = (await response.json()) as AssemblyAITranscriptionResponse;
      if (data.status === 'completed') {
        return data;
      }

      if (data.status === 'error') {
        throw new Error(`AssemblyAI transcription failed: ${data.error}`);
      }

      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }

    throw new Error('AssemblyAI transcription timed out');
  }
}
