import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const DEFAULT_GROQ_BASE_URL = 'https://api.groq.com/openai/v1';
const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1';

interface OptimizeRequest {
  text: string;
  prompt: string;
  apiKey: string;
  backend: string;
  model: string;
  baseUrl?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: OptimizeRequest = await request.json();
    const { text, prompt, apiKey, backend, model, baseUrl: customBaseUrl } = body;

    if (!text || !apiKey) {
      return NextResponse.json(
        { success: false, error: 'Missing text or API key' },
        { status: 400 }
      );
    }

    const systemMessage = prompt || '请改善以下文本的语法、标点和表达，使其更清晰易读。保持原意不变。仅返回改善后的文本，不要添加任何解释。';

    let baseUrl: string;
    let modelName: string;

    if (customBaseUrl) {
      baseUrl = customBaseUrl;
    } else if (backend === 'groq') {
      baseUrl = DEFAULT_GROQ_BASE_URL;
    } else {
      baseUrl = DEFAULT_OPENAI_BASE_URL;
    }

    if (backend === 'groq') {
      modelName = model || 'llama-3.3-70b-versatile';
    } else {
      modelName = model || 'gpt-4o-mini';
    }

    const messages = [
      { role: 'system' as const, content: systemMessage },
      { role: 'user' as const, content: `以下是待优化的文本：\n\n${text}` },
    ];

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: modelName,
        messages,
        temperature: 0.3,
        max_tokens: 4096,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      console.error('AI optimization error:', errorData);
      return NextResponse.json(
        { success: false, error: errorData?.error?.message || '优化请求失败' },
        { status: response.status }
      );
    }

    const result = await response.json();
    const optimizedText = result.choices?.[0]?.message?.content || '';

    return NextResponse.json({
      success: true,
      text: optimizedText,
    });
  } catch (error: any) {
    console.error('AI optimization error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Unknown error' },
      { status: 500 }
    );
  }
}