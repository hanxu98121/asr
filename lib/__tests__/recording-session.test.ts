import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AudioProcessor } from '../audio-processor';
import { RecordingSession, appendTranscript, mergeRecordingWavs, wavDuration } from '../recording-session';
import { GladiaLiveClient } from '../gladia-live-client';
import { storage } from '../storage';

test('discard restores the exact snapshot and invalidates queued callbacks', () => {
  const sessions = new RecordingSession<{ text: string; audio: Blob; duration: number }>();
  const snapshot = { text: 'previous text', audio: new Blob(['previous audio']), duration: 5 };
  const id = sessions.begin(snapshot);
  assert.equal(sessions.isCurrent(id), true);
  assert.equal(sessions.cancel(), snapshot);
  assert.equal(sessions.isCurrent(id), false);
  const next = sessions.begin(snapshot);
  sessions.finish(id);
  assert.equal(sessions.isCurrent(next), true);
  sessions.finish(next);
  assert.equal(sessions.isCurrent(next), false);
});

test('multiple continuations merge PCM in order with one valid WAV header', () => {
  const processor = new AudioProcessor(16000);
  const first = processor.createWavFile(Int16Array.from([-32768, -100, 0]));
  const second = processor.createWavFile(Int16Array.from([100, 32767]));
  const third = processor.createWavFile(Int16Array.from([42]));
  const merged = mergeRecordingWavs([mergeRecordingWavs([first, second]), third]);
  const view = new DataView(merged.buffer);
  assert.equal(merged.length, 44 + 12);
  assert.equal(view.getUint32(4, true), merged.length - 8);
  assert.equal(view.getUint32(40, true), 12);
  assert.deepEqual(Array.from(new Int16Array(merged.buffer, 44)), [-32768, -100, 0, 100, 32767, 42]);
  assert.equal(wavDuration(merged), 6 / 16000);
  assert.deepEqual(mergeRecordingWavs([first, processor.createWavFile(new Int16Array())]), first);
  assert.throws(() => mergeRecordingWavs([new Uint8Array(5)]), /Expected/);
  const stereo = first.slice();
  new DataView(stereo.buffer).setUint16(22, 2, true);
  assert.throws(() => mergeRecordingWavs([stereo]), /Expected/);
});

test('continuations preserve edited text and append once; full retry can replace it', () => {
  assert.equal(appendTranscript('edited first', ' second '), 'edited first\nsecond');
  assert.equal(appendTranscript(appendTranscript('first', 'second'), 'third'), 'first\nsecond\nthird');
  assert.equal(appendTranscript('', 'complete retry'), 'complete retry');
  assert.equal(appendTranscript('first', ''), 'first');
  assert.equal(appendTranscript('edited first\n', 'second'), 'edited first\n\nsecond');
});

test('Gladia cancellation suppresses transcript and completion messages already queued', async () => {
  const client = new GladiaLiveClient(() => assert.fail('cancelled transcript'), () => {},
    () => assert.fail('cancelled completion'));
  client.close();
  const receive = (client as unknown as { handleMessage: (message: unknown) => Promise<void> }).handleMessage.bind(client);
  await receive(new Blob([JSON.stringify({ type: 'transcript', data: { is_final: true, utterance: { text: 'late' } } })]));
  await receive(JSON.stringify({ type: 'end_session' }));
  assert.equal(client.stop(), false);
});

test('saving a continued recording updates one history entry without changing other entries', () => {
  const originalWindow = globalThis.window;
  const originalStorage = globalThis.localStorage;
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, 'window', { configurable: true, value: new EventTarget() });
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  } });
  try {
    storage.saveRecord({ id: 'other', text: 'other', duration: 1, timestamp: 1 });
    storage.saveRecord({ id: 'session', text: 'first', duration: 1, timestamp: 2 });
    storage.saveRecord({ id: 'session', text: 'first\nsecond', duration: 2, timestamp: 3 });
    assert.equal(storage.getRecords().length, 2);
    assert.equal(storage.getRecords()[0].text, 'first\nsecond');
    assert.equal(storage.getRecords()[0].duration, 2);
    assert.equal(storage.getRecords()[1].id, 'other');
  } finally {
    Object.defineProperty(globalThis, 'window', { configurable: true, value: originalWindow });
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: originalStorage });
  }
});
