export type STTErrorCode = 'UPLOAD_TOO_LARGE' | 'TRANSCRIPTION_TIMEOUT' | 'UNSUPPORTED_AUDIO_FORMAT' | 'COMPRESSION_FAILED' | 'SERVICE_ERROR';

export class STTError extends Error {
  constructor(message: string, public readonly code: STTErrorCode, public readonly status = 502) {
    super(message);
  }
}

export async function readSTTHttpError(response: Response, fallback: string): Promise<STTError> {
  const raw = await response.text();
  let data: any;
  try { data = JSON.parse(raw); } catch { /* Platforms can return plain text or HTML. */ }
  const detail = data?.error?.message || data?.detail?.message || data?.message ||
    (typeof data?.error === 'string' ? data.error : undefined) ||
    (typeof data?.detail === 'string' ? data.detail : undefined);
  const message = detail || `${fallback} (HTTP ${response.status})`;
  const code: STTErrorCode = response.status === 413 ? 'UPLOAD_TOO_LARGE' :
    response.status === 408 || response.status === 504 ? 'TRANSCRIPTION_TIMEOUT' :
    response.status === 415 || /unsupported.*(audio|file|format|codec)|(audio|file|format|codec).*not supported|invalid (audio |file )?format/i.test(detail || raw) ? 'UNSUPPORTED_AUDIO_FORMAT' :
    'SERVICE_ERROR';
  return new STTError(message, code, code === 'UPLOAD_TOO_LARGE' ? 413 :
    code === 'TRANSCRIPTION_TIMEOUT' ? 504 : code === 'UNSUPPORTED_AUDIO_FORMAT' ? 415 : 502);
}
