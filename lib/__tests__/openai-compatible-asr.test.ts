import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NextRequest } from 'next/server';
import { OpenAIProvider } from '../../app/api/stt/providers/openai';
import { POST } from '../../app/api/stt/route';
import { ASRClient } from '../asr-client';

test('custom ASR settings travel from client through route to transcription service', async () => {
  const originalFetch = globalThis.fetch;
  let called = false;
  globalThis.fetch = async (input, init) => {
    if (input === '/api/stt') {
      return POST(new NextRequest('http://localhost/api/stt', { method: 'POST', body: init!.body }));
    }
    called = true;
    assert.equal(input, 'https://openrouter.ai/api/v1/audio/transcriptions');
    assert.equal(new Headers(init!.headers).get('Authorization'), 'Bearer test-key');
    const body = init!.body as FormData;
    assert.equal(body.get('model'), 'openai/whisper-large-v3');
    assert.equal(body.get('response_format'), 'json');
    assert.equal(body.has('language'), false);
    assert.equal(body.has('timestamp_granularities[]'), false);
    assert.equal((body.get('file') as File).name, 'speech.webm');
    assert.equal(await (body.get('file') as File).text(), 'audio-bytes');
    return Response.json({ text: '转写成功' });
  };
  try {
    const client = new ASRClient('test-key', 'auto', 'openai');
    client.setOpenAIConfig(' openai/whisper-large-v3 ', ' https://openrouter.ai/api/v1/ ');
    const result = await client.recognizeAudio(new Blob(['audio-bytes']), 'speech.webm');
    assert.equal(result.success, true);
    assert.equal(result.text, '转写成功');
    assert.equal(called, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('blank settings retain OpenAI defaults and explicit language', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    assert.equal(input, 'https://api.openai.com/v1/audio/transcriptions');
    const body = init!.body as FormData;
    assert.equal(body.get('model'), 'whisper-1');
    assert.equal(body.get('language'), 'en');
    return Response.json({ text: 'hello', language: 'en', duration: 2 });
  };
  try {
    const result = await new OpenAIProvider().transcribe(Buffer.from('audio'), 'audio.wav', {
      apiKey: 'test-key', model: ' ', baseUrl: '', language: 'en',
    });
    assert.equal(result.text, 'hello');
    assert.equal(result.duration, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('custom configuration does not leak into other backends', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_input, init) => {
    const body = init!.body as FormData;
    assert.equal(body.get('backend'), 'groq');
    assert.equal(body.has('model'), false);
    assert.equal(body.has('baseUrl'), false);
    return Response.json({ success: true, text: 'hello' });
  };
  try {
    const client = new ASRClient('test-key', 'auto', 'openai');
    client.setOpenAIConfig('custom-model', 'https://example.com/v1');
    client.setBackend('groq');
    assert.equal((await client.recognizeAudio(new Blob(['audio']))).success, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('provider surfaces service errors and rejects invalid responses and URLs', async () => {
  const originalFetch = globalThis.fetch;
  const provider = new OpenAIProvider();
  const transcribe = (baseUrl?: string) => provider.transcribe(Buffer.from('audio'), 'audio.wav', {
    apiKey: 'test-key', baseUrl,
  });
  try {
    globalThis.fetch = async () => Response.json({ error: { message: 'Unknown model' } }, { status: 400 });
    await assert.rejects(transcribe(), /Unknown model/);
    globalThis.fetch = async () => Response.json({ choices: [] });
    await assert.rejects(transcribe(), /Invalid transcription response/);
    globalThis.fetch = async () => { throw new Error('fetch must not run'); };
    await assert.rejects(transcribe('ftp://example.com/v1'), /HTTP\(S\)/);
    await assert.rejects(transcribe('https://example.com/v1?key=secret'), /HTTP\(S\)/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
