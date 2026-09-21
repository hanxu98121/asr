import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

interface StartLiveSessionRequest {
  apiKey?: string;
  language?: string;
  customVocabulary?: Array<{
    value: string;
    pronunciations?: string[];
    intensity?: number;
    language?: string;
  }>;
}

/**
 * Creates a short-lived Gladia Live session. The API key is deliberately kept
 * on the server; the browser receives only Gladia's session-specific URL.
 */
export async function POST(request: NextRequest) {
  try {
    const { apiKey, language = 'auto', customVocabulary = [] } = (await request.json()) as StartLiveSessionRequest;
    if (!apiKey?.trim()) {
      return NextResponse.json({ success: false, error: 'Missing Gladia API key' }, { status: 400 });
    }

    const languages = language === 'auto' ? [] : [language];
    const body: Record<string, unknown> = {
      model: 'solaria-1',
      encoding: 'wav/pcm',
      sample_rate: 16000,
      bit_depth: 16,
      channels: 1,
      messages_config: {
        receive_partial_transcripts: true,
        receive_final_transcripts: true,
        receive_errors: true,
      },
      language_config: {
        languages,
        // Gladia recommends disabling code switching for unrestricted auto
        // detection; enabling it requires a small, explicit language list.
        code_switching: false,
      },
    };

    if (customVocabulary.length > 0) {
      body.realtime_processing = {
        custom_vocabulary: true,
        custom_vocabulary_config: {
          vocabulary: customVocabulary,
          default_intensity: 0.4,
        },
      };
    }

    const response = await fetch('https://api.gladia.io/v2/live', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-gladia-key': apiKey,
      },
      body: JSON.stringify(body),
    });

    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.url) {
      return NextResponse.json(
        { success: false, error: data?.message || data?.error || `Gladia session creation failed: ${response.status}` },
        { status: response.status || 502 },
      );
    }

    return NextResponse.json({ success: true, id: data.id, url: data.url });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unable to create Gladia live session' },
      { status: 500 },
    );
  }
}
