import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

interface SubscriptionRequest {
  apiKey?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: SubscriptionRequest = await request.json();
    const apiKey = body.apiKey?.trim();

    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: 'Missing API key' },
        { status: 400 }
      );
    }

    const response = await fetch('https://api.elevenlabs.io/v1/user/subscription', {
      method: 'GET',
      headers: {
        'xi-api-key': apiKey,
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      return NextResponse.json(
        {
          success: false,
          error:
            errorData?.detail?.message ||
            errorData?.message ||
            'Failed to fetch ElevenLabs subscription',
        },
        { status: response.status }
      );
    }

    const data = await response.json();
    const characterCount = Number(data.character_count ?? 0);
    const characterLimit = Number(data.character_limit ?? 0);
    const remainingCharacters = Math.max(characterLimit - characterCount, 0);

    return NextResponse.json({
      success: true,
      remainingCharacters,
      totalCharacters: characterLimit,
      usedCharacters: characterCount,
      resetAt: data.next_character_count_reset_unix ?? null,
      tier: data.tier ?? null,
      currency: data.currency ?? null,
      billingPeriod: data.billing_period ?? null,
    });
  } catch (error: any) {
    console.error('ElevenLabs subscription error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Unknown error' },
      { status: 500 }
    );
  }
}
