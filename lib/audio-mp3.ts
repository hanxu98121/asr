/** Encode the recorder's canonical WAV, including the final partial MP3 frame. */
export async function encodeRecordingMp3(wav: ArrayBuffer): Promise<Uint8Array> {
  const view = new DataView(wav);
  if (wav.byteLength < 44 || view.getUint32(0) !== 0x52494646 ||
      view.getUint32(8) !== 0x57415645 || view.getUint32(36) !== 0x64617461 ||
      view.getUint16(20, true) !== 1 || view.getUint16(22, true) !== 1 ||
      view.getUint32(24, true) !== 16000 || view.getUint16(34, true) !== 16 ||
      view.getUint32(40, true) !== wav.byteLength - 44 || (wav.byteLength - 44) % 2) {
    throw new Error('Expected a 16 kHz mono 16-bit PCM WAV recording');
  }
  const samples = new Int16Array((wav.byteLength - 44) / 2);
  if (!samples.length) throw new Error('Recording is empty');
  for (let i = 0; i < samples.length; i++) samples[i] = view.getInt16(44 + i * 2, true);
  const { Mp3Encoder } = await import('@breezystack/lamejs');
  const encoder = new Mp3Encoder(1, 16000, 48);
  const parts: Uint8Array[] = [];
  for (let offset = 0; offset < samples.length; offset += 1152) {
    parts.push(new Uint8Array(encoder.encodeBuffer(samples.subarray(offset, offset + 1152))));
  }
  parts.push(new Uint8Array(encoder.flush()));
  const result = new Uint8Array(parts.reduce((size, part) => size + part.length, 0));
  let offset = 0;
  for (const part of parts) { result.set(part, offset); offset += part.length; }
  return result;
}
