import { AVAILABLE_AI_BACKENDS, type AIOptimizerBackend } from './ai-optimizer';

export interface AISettings {
  apiKey: string;
  model: string;
  baseUrl: string;
  models: string[];
}

export function isAIBackend(value: unknown): value is AIOptimizerBackend {
  return AVAILABLE_AI_BACKENDS.some(backend => backend.name === value);
}

export function normalizeAISettings(value: Partial<AISettings> = {}, backend: AIOptimizerBackend): AISettings {
  const defaults = AVAILABLE_AI_BACKENDS.find(item => item.name === backend)!;
  const model = typeof value.model === 'string' ? value.model.trim() : '';
  const models = Array.isArray(value.models)
    ? [...new Set(value.models.filter((item): item is string => typeof item === 'string').map(item => item.trim()).filter(Boolean))]
    : [...new Set([defaults.defaultModel!, model].filter(Boolean))];
  return {
    apiKey: typeof value.apiKey === 'string' ? value.apiKey : '',
    model,
    baseUrl: typeof value.baseUrl === 'string' ? value.baseUrl : '',
    models,
  };
}

export function saveAISettings(backend: AIOptimizerBackend, settings: AISettings): void {
  localStorage.setItem(`ai-optimizer-settings-${backend}`, JSON.stringify(settings));
}

export function loadAISettings(backend: AIOptimizerBackend): AISettings {
  const saved = localStorage.getItem(`ai-optimizer-settings-${backend}`);
  if (saved) {
    try { return normalizeAISettings(JSON.parse(saved), backend); } catch { /* Fall back to legacy settings. */ }
  }
  // Old shared fields belong only to the backend selected in the old configuration.
  const legacyBackend = localStorage.getItem('ai-optimizer-backend') || 'groq';
  const settings = normalizeAISettings(backend === legacyBackend ? {
    apiKey: localStorage.getItem('ai-optimizer-api-key') || '',
    model: localStorage.getItem('ai-optimizer-model') || '',
    baseUrl: localStorage.getItem('ai-optimizer-base-url') || '',
  } : {}, backend);
  saveAISettings(backend, settings);
  return settings;
}
