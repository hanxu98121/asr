export function normalizeASRModels(models: unknown, selectedModel: string): string[] {
  const entries = Array.isArray(models) ? models : ['whisper-1', selectedModel];
  return [...new Set(entries.filter((model): model is string => typeof model === 'string')
    .map(model => model.trim()).filter(Boolean))];
}

export function loadASRModels(selectedModel: string): string[] {
  try {
    return normalizeASRModels(JSON.parse(localStorage.getItem('openai-asr-models') || 'null'), selectedModel);
  } catch {
    return normalizeASRModels(undefined, selectedModel);
  }
}
