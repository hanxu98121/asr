import test from 'node:test';
import assert from 'node:assert/strict';
import { AIOptimizer, AVAILABLE_AI_BACKENDS } from '../ai-optimizer';
import { loadAISettings, saveAISettings, normalizeAISettings } from '../ai-settings';

test('legacy settings migrate only to the selected backend; profiles and deletions survive reload', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const values = new Map<string, string>([
    ['ai-optimizer-backend', 'openai'],
    ['ai-optimizer-api-key', 'test-openai'],
    ['ai-optimizer-model', 'custom-model'],
    ['ai-optimizer-base-url', 'https://example.test/v1'],
  ]);
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  } });
  try {
    const openai = loadAISettings('openai');
    assert.equal(openai.apiKey, 'test-openai');
    assert.equal(openai.model, 'custom-model');
    assert.ok(openai.models.includes('custom-model'));
    const groq = loadAISettings('groq');
    assert.equal(groq.apiKey, '');
    assert.equal(groq.baseUrl, '');
    saveAISettings('groq', { ...groq, apiKey: 'test-groq', model: 'another-model', models: ['another-model'] });
    assert.deepEqual(loadAISettings('openai'), openai);
    assert.equal(loadAISettings('groq').apiKey, 'test-groq');
    saveAISettings('groq', { ...groq, models: [] });
    assert.deepEqual(loadAISettings('groq').models, []);
    assert.deepEqual(normalizeAISettings({ models: [' custom ', 'custom', '', 123 as unknown as string] }, 'openai').models, ['custom']);
    saveAISettings('openai', normalizeAISettings(JSON.parse(JSON.stringify(openai)), 'openai'));
    assert.deepEqual(loadAISettings('openai'), openai);
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});

test('manual and automatic optimizer construction use the chosen backend defaults', async () => {
  const originalFetch = globalThis.fetch;
  const requests: Record<string, string>[] = [];
  globalThis.fetch = async (_input, init) => {
    requests.push(JSON.parse(init!.body as string));
    return Response.json({ success: true, text: 'Optimized' });
  };
  try {
    for (const config of AVAILABLE_AI_BACKENDS) {
      const optimizer = new AIOptimizer('test-key', config.name);
      assert.equal((await optimizer.optimizeText('Original')).success, true);
      assert.equal(requests.at(-1)!.backend, config.name);
      assert.equal(requests.at(-1)!.model, config.defaultModel);
      assert.equal(requests.at(-1)!.baseUrl, config.defaultBaseUrl);
      optimizer.setModel(' custom-model ');
      optimizer.setBaseUrl(' https://example.test/v1 ');
      await optimizer.optimizeText('Original');
      assert.equal(requests.at(-1)!.model, 'custom-model');
      assert.equal(requests.at(-1)!.baseUrl, 'https://example.test/v1');
    }
  } finally { globalThis.fetch = originalFetch; }
});
