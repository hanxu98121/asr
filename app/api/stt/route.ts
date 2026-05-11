import { NextRequest, NextResponse } from 'next/server';
import { providerRegistry, AVAILABLE_BACKENDS } from './providers';
import type { TerminologyItem } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60; // 最长60秒处理时间

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const audioFile = formData.get('audio') as File | null;
    const apiKey = formData.get('apiKey') as string | null;
    const language = (formData.get('language') as string) || 'auto';
    const backend = (formData.get('backend') as string) || 'elevenlabs';
    const terminologyRaw = formData.get('terminology') as string | null;

    let terminology: TerminologyItem[] = [];
    if (terminologyRaw) {
      try {
        terminology = JSON.parse(terminologyRaw) as TerminologyItem[];
      } catch {
        return NextResponse.json(
          { success: false, error: 'Invalid terminology payload' },
          { status: 400 }
        );
      }
    }

    // 调试日志
    console.log('Received request:', {
      backend,
      apiKeyPresent: !!apiKey,
      apiKeyLength: apiKey?.length,
      language,
    });

    if (!audioFile || !apiKey) {
      return NextResponse.json(
        { success: false, error: 'Missing audio file or API key' },
        { status: 400 }
      );
    }

    // 检查后端是否支持
    if (!providerRegistry.has(backend)) {
      const availableBackends = AVAILABLE_BACKENDS.map(b => b.name).join(', ');
      return NextResponse.json(
        {
          success: false,
          error: `Unsupported backend: ${backend}. Available: ${availableBackends}`,
        },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await audioFile.arrayBuffer());

    // 获取provider
    const provider = providerRegistry.getProvider(backend)!;

    // 调用provider进行转录
    const result = await provider.transcribe(buffer, audioFile.name, {
      apiKey,
      language,
      terminology,
    });

    return NextResponse.json({
      success: true,
      text: result.text,
      duration: result.duration,
      language: result.language,
      backend,
    });
  } catch (error: any) {
    console.error('STT processing error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Unknown error' },
      { status: 500 }
    );
  }
}

// GET endpoint to list available backends
export async function GET() {
  return NextResponse.json({
    success: true,
    backends: AVAILABLE_BACKENDS,
  });
}
