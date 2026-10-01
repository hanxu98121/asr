import { encodeRecordingMp3 } from './audio-mp3';

self.onmessage = async (event: MessageEvent<ArrayBuffer>) => {
  try {
    const bytes = await encodeRecordingMp3(event.data);
    self.postMessage({ bytes: bytes.buffer }, { transfer: [bytes.buffer] });
  } catch (error) {
    self.postMessage({ error: (error as Error).message });
  }
};
