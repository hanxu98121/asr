import { NextResponse } from 'next/server';

// 11Labs TTS API预留实现
export async function POST(request: Request) {
  try {
    const { text, voiceId } = await request.json();

    if (!text) {
      return NextResponse.json(
        { success: false, error: 'Missing text parameter' },
        { status: 400 }
      );
    }

    const apiKey = process.env.ELEVEN_LABS_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: 'TTS service not configured' },
        { status: 500 }
      );
    }

    // 11Labs API调用实现
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId || '21m00Tcm4TlvDq8ikWAM'}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': apiKey,
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_monolingual_v1',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.5,
        },
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail?.message || 'TTS request failed');
    }

    const audioBuffer = await response.arrayBuffer();

    return new NextResponse(audioBuffer, {
      headers: {
        'Content-Type': 'audio/mpeg',
      },
    });
  } catch (error) {
    console.error('TTS API error:', error);
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}

export const runtime = 'edge';
