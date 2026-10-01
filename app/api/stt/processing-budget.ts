import { STTError } from '../../../lib/stt-errors';

export const STT_PROCESSING_BUDGET_MS = 280_000;

/** Bound the complete pipeline, including SDKs that don't promptly reject on abort. */
export async function withSTTBudget<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  requestSignal?: AbortSignal,
  budgetMs = STT_PROCESSING_BUDGET_MS,
): Promise<T> {
  const controller = new AbortController();
  const abortRequest = () => controller.abort(requestSignal?.reason);
  requestSignal?.addEventListener('abort', abortRequest, { once: true });
  if (requestSignal?.aborted) abortRequest();
  const timer = setTimeout(() => controller.abort(
    new STTError('Transcription processing timed out', 'TRANSCRIPTION_TIMEOUT', 504),
  ), budgetMs);
  let rejectOnAbort: () => void = () => {};
  const cancelled = new Promise<never>((_, reject) => {
    rejectOnAbort = () => reject(controller.signal.reason);
    controller.signal.addEventListener('abort', rejectOnAbort, { once: true });
  });
  try {
    controller.signal.throwIfAborted();
    return await Promise.race([operation(controller.signal), cancelled]);
  } finally {
    clearTimeout(timer);
    controller.signal.removeEventListener('abort', rejectOnAbort);
    requestSignal?.removeEventListener('abort', abortRequest);
  }
}
