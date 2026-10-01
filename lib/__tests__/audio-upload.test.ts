import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ASRClient } from '../asr-client';
import { AudioProcessor } from '../audio-processor';
import { encodeRecordingMp3 } from '../audio-mp3';
import { compressRecording } from '../audio-compression';
import { readSTTHttpError, STTError } from '../stt-errors';
import { withSTTBudget } from '../../app/api/stt/processing-budget';
import { OpenAIProvider } from '../../app/api/stt/providers/openai';
import { GroqProvider } from '../../app/api/stt/providers/groq';
import { ElevenLabsProvider } from '../../app/api/stt/providers/elevenlabs';
import { GladiaProvider } from '../../app/api/stt/providers/gladia';
import { SonioxProvider } from '../../app/api/stt/providers/soniox';

function recording(seconds = 1.013) {
  const pcm = new Int16Array(Math.floor(16000 * seconds));
  for (let i = 0; i < pcm.length; i++) pcm[i] = Math.sin(i * 2 * Math.PI * 440 / 16000) * 10000;
  return new AudioProcessor(16000).createWavFile(pcm);
}

test('real MP3 encoding retains final partial frame and compresses a ten-minute recording', async () => {
  for (const seconds of [1.013, 600.013]) {
    const wav = recording(seconds);
    const mp3 = await encodeRecordingMp3(wav.buffer as ArrayBuffer);
    // MPEG-2 Layer III, 48 kbps / 16 kHz: each frame is 216 bytes, 576 samples.
    let frames = 0;
    for (let offset = 0; offset < mp3.length;) {
      assert.equal(mp3[offset], 0xff);
      assert.equal(mp3[offset + 1] & 0xfe, 0xf2);
      assert.equal(mp3[offset + 2] & 0xfc, 0x68);
      offset += 216 + ((mp3[offset + 2] >> 1) & 1);
      frames++;
      assert.ok(offset <= mp3.length);
    }
    const duration = frames * 576 / 16000;
    assert.ok(duration >= seconds && duration < seconds + 0.15);
    assert.ok(mp3.length < wav.length / 4);
    if (seconds > 600) assert.ok(mp3.length < 3_700_000);
  }
  await assert.rejects(encodeRecordingMp3(new ArrayBuffer(44)), /Expected/);
});

test('raw uploads preserve exact WAV bytes and compressed uploads carry MPEG MIME and extension', async () => {
  const originalFetch = globalThis.fetch;
  const originalWorker = globalThis.Worker;
  class EncoderWorker {
    onmessage?: (event: any) => void;
    terminate() {}
    async postMessage(wav: ArrayBuffer) {
      this.onmessage?.({ data: { bytes: (await encodeRecordingMp3(wav)).buffer } });
    }
  }
  globalThis.Worker = EncoderWorker as unknown as typeof Worker;
  try {
    const wav = recording();
    const client = new ASRClient('test-key', 'auto', 'openai');
    let compressed = false;
    globalThis.fetch = async (_url, init) => {
      const file = (init!.body as FormData).get('audio') as File;
      assert.equal(file.name, compressed ? 'recording.mp3' : 'recording.wav');
      assert.equal(file.type, compressed ? 'audio/mpeg' : 'audio/wav');
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (!compressed) assert.deepEqual(bytes, wav);
      else assert.ok(bytes.length < wav.length);
      return Response.json({ success: true, text: 'hello' });
    };
    const blob = new Blob([new Uint8Array(wav)], { type: 'audio/wav' });
    assert.equal((await client.recognizeAudio(blob, 'recording.wav', { compressAudio: false })).success, true);
    compressed = true;
    assert.equal((await client.recognizeAudio(blob, 'recording.wav', { compressAudio: true })).success, true);
  } finally { globalThis.fetch = originalFetch; globalThis.Worker = originalWorker; }
});

test('cancellation terminates the encoder and compression failure never falls back to an upload', async () => {
  const originalWorker = globalThis.Worker;
  const originalFetch = globalThis.fetch;
  let terminated = false;
  let fail = false;
  class WorkerStub {
    onmessage?: (event: any) => void;
    terminate() { terminated = true; }
    postMessage() { if (fail) this.onmessage?.({ data: { error: 'encoder unavailable' } }); }
  }
  globalThis.Worker = WorkerStub as unknown as typeof Worker;
  globalThis.fetch = async () => { throw new Error('must not upload'); };
  try {
    const controller = new AbortController();
    const pending = compressRecording(new Blob([new Uint8Array(recording())]), controller.signal);
    await new Promise(resolve => setTimeout(resolve, 0));
    controller.abort();
    await assert.rejects(pending, { name: 'AbortError' });
    assert.equal(terminated, true);
    fail = true;
    const result = await new ASRClient('key').recognizeAudio(new Blob(['wav']), 'recording.wav', { compressAudio: true });
    assert.equal(result.errorCode, 'COMPRESSION_FAILED');
  } finally { globalThis.Worker = originalWorker; globalThis.fetch = originalFetch; }
});

test('plain-text platform errors distinguish payload size, timeout and format', async () => {
  const originalFetch = globalThis.fetch;
  try {
    for (const [status, code] of [[413, 'UPLOAD_TOO_LARGE'], [504, 'TRANSCRIPTION_TIMEOUT'], [415, 'UNSUPPORTED_AUDIO_FORMAT']] as const) {
      globalThis.fetch = async () => new Response('platform error', { status });
      assert.equal((await new ASRClient('key').recognizeAudio(new Blob(['wav']))).errorCode, code);
    }
    assert.equal((await readSTTHttpError(Response.json({ error: { message: 'Invalid file format' } }, { status: 400 }), 'failed')).code, 'UNSUPPORTED_AUDIO_FORMAT');
  } finally { globalThis.fetch = originalFetch; }
});

test('one pipeline budget aborts upstream work and rejects even an unresponsive provider', async () => {
  let signal: AbortSignal | undefined;
  await assert.rejects(withSTTBudget(async upstreamSignal => {
    signal = upstreamSignal;
    return new Promise(() => {});
  }, undefined, 10), (error: unknown) => error instanceof STTError && error.code === 'TRANSCRIPTION_TIMEOUT');
  assert.equal(signal?.aborted, true);
});

test('processing can succeed after sixty seconds but stops at the shared 280-second deadline', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const longRequest = withSTTBudget(() => new Promise<string>(resolve => setTimeout(() => resolve('done'), 61_000)));
    context.mock.timers.tick(61_000);
    assert.equal(await longRequest, 'done');
    let signal: AbortSignal | undefined;
    const timeout = withSTTBudget(async currentSignal => { signal = currentSignal; return new Promise(() => {}); });
    context.mock.timers.tick(279_999);
    assert.equal(signal?.aborted, false);
    context.mock.timers.tick(1);
    await assert.rejects(timeout, (error: unknown) => error instanceof STTError && error.code === 'TRANSCRIPTION_TIMEOUT');
    assert.equal(signal?.aborted, true);
  } finally { context.mock.timers.reset(); }
});

test('Soniox SDK forwards MP3 MIME and surfaces payload/format errors', async () => {
  const originalFetch = globalThis.fetch;
  try {
    const config = { apiKey: 'test-key', mimeType: 'audio/mpeg', signal: new AbortController().signal };
    for (const [status, code] of [[413, 'UPLOAD_TOO_LARGE'], [415, 'UNSUPPORTED_AUDIO_FORMAT']] as const) {
      globalThis.fetch = async (_url, init) => {
        const file = (init!.body as FormData).get('file') as File;
        assert.equal(file.type, 'audio/mpeg');
        assert.equal(file.name, 'recording.mp3');
        assert.ok(init!.signal);
        return Response.json({ message: 'Rejected audio upload' }, { status });
      };
      await assert.rejects(new SonioxProvider().transcribe(Buffer.from('MP3'), 'recording.mp3', config),
        (error: unknown) => error instanceof STTError && error.code === code);
    }
  } finally { globalThis.fetch = originalFetch; }
});

test('providers retain MP3 filename, MIME and shared abort signal; Gladia completes after sixty seconds', async () => {
  const originalFetch = globalThis.fetch;
  const originalNow = Date.now;
  try {
    const controller = new AbortController();
    const config = { apiKey: 'key', mimeType: 'audio/mpeg', signal: controller.signal };
    for (const provider of [new OpenAIProvider(), new GroqProvider(), new ElevenLabsProvider()]) {
      globalThis.fetch = async (_url, init) => {
        const file = (init!.body as FormData).get('file') as File;
        assert.equal(file.name, 'recording.mp3');
        assert.equal(file.type, 'audio/mpeg');
        assert.equal(init!.signal, controller.signal);
        return Response.json({ text: 'hello' });
      };
      assert.equal((await provider.transcribe(Buffer.from('MP3'), 'recording.mp3', config)).text, 'hello');
    }
    let statusChecks = 0;
    let now = originalNow();
    Date.now = () => now;
    globalThis.fetch = async (url, init) => {
      assert.equal(init!.signal, controller.signal);
      if (String(url).endsWith('/upload')) {
        assert.equal(((init!.body as FormData).get('audio') as File).type, 'audio/mpeg');
        return Response.json({ audio_url: 'https://audio.test/recording.mp3' });
      }
      if (String(url).endsWith('/pre-recorded')) return Response.json({ id: 'job' });
      statusChecks++;
      now += 61_000;
      return Response.json(statusChecks === 1 ? { status: 'processing' } : {
        status: 'done', result: { transcription: { full_transcript: 'completed after sixty seconds' } },
      });
    };
    assert.equal((await new GladiaProvider().transcribe(Buffer.from('MP3'), 'recording.mp3', config)).text, 'completed after sixty seconds');
  } finally { globalThis.fetch = originalFetch; Date.now = originalNow; }
});
