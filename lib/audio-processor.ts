/**
 * 音频处理工具类
 * 负责将浏览器采集的音频转换为标准WAV格式
 */
export class AudioProcessor {
  private sampleRate: number;
  private numChannels: number;
  private outputSampleRate: number = 16000;
  private outputNumChannels: number = 1;
  private outputBitsPerSample: number = 16;

  constructor(sampleRate: number = 44100, numChannels: number = 1) {
    this.sampleRate = sampleRate;
    this.numChannels = numChannels;
  }

  /**
   * 将Float32Array音频数据转换为16kHz单声道PCM格式
   */
  convertToPCM(audioData: Float32Array): Int16Array {
    // 重采样到16kHz
    const resampled = this.resample(audioData, this.sampleRate, this.outputSampleRate);

    // 转换为16位PCM
    const pcm16 = new Int16Array(resampled.length);
    for (let i = 0; i < resampled.length; i++) {
      const s = Math.max(-1, Math.min(1, resampled[i]));
      pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }

    return pcm16;
  }

  /**
   * 将PCM数据封装为WAV文件
   */
  createWavFile(pcmData: Int16Array): Uint8Array {
    const buffer = new ArrayBuffer(44 + pcmData.length * 2);
    const view = new DataView(buffer);

    // RIFF标识符
    view.setUint8(0, 0x52); // 'R'
    view.setUint8(1, 0x49); // 'I'
    view.setUint8(2, 0x46); // 'F'
    view.setUint8(3, 0x46); // 'F'

    // 文件长度
    view.setUint32(4, 36 + pcmData.length * 2, true);

    // WAVE标识符
    view.setUint8(8, 0x57); // 'W'
    view.setUint8(9, 0x41); // 'A'
    view.setUint8(10, 0x56); // 'V'
    view.setUint8(11, 0x45); // 'E'

    // fmt子块
    view.setUint8(12, 0x66); // 'f'
    view.setUint8(13, 0x6D); // 'm'
    view.setUint8(14, 0x74); // 't'
    view.setUint8(15, 0x20); // ' '
    view.setUint32(16, 16, true); // 子块长度
    view.setUint16(20, 1, true); // 音频格式（PCM）
    view.setUint16(22, this.outputNumChannels, true); // 声道数
    view.setUint32(24, this.outputSampleRate, true); // 采样率
    view.setUint32(28, this.outputSampleRate * this.outputNumChannels * this.outputBitsPerSample / 8, true); // 字节率
    view.setUint16(32, this.outputNumChannels * this.outputBitsPerSample / 8, true); // 块对齐
    view.setUint16(34, this.outputBitsPerSample, true); // 采样位数

    // data子块
    view.setUint8(36, 0x64); // 'd'
    view.setUint8(37, 0x61); // 'a'
    view.setUint8(38, 0x74); // 't'
    view.setUint8(39, 0x61); // 'a'
    view.setUint32(40, pcmData.length * 2, true); // 数据长度

    // 写入PCM数据
    const uint8 = new Uint8Array(buffer);
    let offset = 44;
    for (let i = 0; i < pcmData.length; i++) {
      uint8[offset++] = pcmData[i] & 0xFF;
      uint8[offset++] = (pcmData[i] >> 8) & 0xFF;
    }

    return uint8;
  }

  /**
   * 音频重采样
   */
  private resample(data: Float32Array, inputSampleRate: number, outputSampleRate: number): Float32Array {
    if (inputSampleRate === outputSampleRate) return data;

    const ratio = outputSampleRate / inputSampleRate;
    const outputLength = Math.round(data.length * ratio);
    const output = new Float32Array(outputLength);

    for (let i = 0; i < outputLength; i++) {
      const position = i / ratio;
      const index = Math.floor(position);
      const fraction = position - index;

      if (index + 1 < data.length) {
        output[i] = data[index] * (1 - fraction) + data[index + 1] * fraction;
      } else {
        output[i] = data[index];
      }
    }

    return output;
  }

  /**
   * 检测音频是否为静音
   */
  isSilent(audioData: Float32Array, threshold: number = 0.01): boolean {
    let sum = 0;
    for (let i = 0; i < audioData.length; i++) {
      sum += Math.abs(audioData[i]);
    }
    const average = sum / audioData.length;
    return average < threshold;
  }

  /**
   * 计算音频音量（分贝）
   */
  calculateVolume(audioData: Float32Array): number {
    let sum = 0;
    for (let i = 0; i < audioData.length; i++) {
      sum += audioData[i] * audioData[i];
    }
    const rms = Math.sqrt(sum / audioData.length);
    const db = 20 * Math.log10(rms);
    return isFinite(db) ? Math.max(0, db) : 0;
  }

  /**
   * 将音频流分块
   */
  chunkAudio(audioData: Uint8Array, chunkSize: number = 4096): Uint8Array[] {
    const chunks: Uint8Array[] = [];
    for (let i = 0; i < audioData.length; i += chunkSize) {
      chunks.push(audioData.slice(i, i + chunkSize));
    }
    return chunks;
  }
}
