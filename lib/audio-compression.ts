export async function compressRecording(wav: Blob, signal?: AbortSignal): Promise<Blob> {
  signal?.throwIfAborted();
  const bytes = await wav.arrayBuffer();
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./audio-compression.worker.ts', import.meta.url));
    const cleanup = () => {
      worker.terminate();
      signal?.removeEventListener('abort', abort);
    };
    const abort = () => { cleanup(); reject(signal?.reason || new DOMException('Cancelled', 'AbortError')); };
    signal?.addEventListener('abort', abort, { once: true });
    worker.onmessage = (event: MessageEvent<{ bytes?: ArrayBuffer; error?: string }>) => {
      cleanup();
      if (event.data.error || !event.data.bytes?.byteLength) {
        reject(new Error(event.data.error || 'Empty compressed audio'));
      } else resolve(new Blob([event.data.bytes], { type: 'audio/mpeg' }));
    };
    worker.onerror = (event) => { event.preventDefault(); cleanup(); reject(new Error(event.message || 'Audio encoder failed')); };
    worker.onmessageerror = () => { cleanup(); reject(new Error('Unable to read encoded audio')); };
    worker.postMessage(bytes, [bytes]);
  });
}
