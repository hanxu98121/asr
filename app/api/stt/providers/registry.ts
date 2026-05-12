/**
 * ASR Provider Registry
 * Manages all available ASR providers
 */

import { ASRProvider, ProviderRegistryEntry, ASRBackendConfig } from './types';
import { ElevenLabsProvider } from './elevenlabs';
import { SonioxProvider } from './soniox';
import { GroqProvider } from './groq';
import { OpenAIProvider } from './openai';
import { GladiaProvider } from './gladia';
import { DeepgramProvider } from './deepgram';
import { AssemblyAIProvider } from './assemblyai';

/**
 * Available ASR backend configurations
 */
export const AVAILABLE_BACKENDS: ASRBackendConfig[] = [
  {
    name: 'elevenlabs',
    label: 'ElevenLabs',
    description: 'High quality ASR with Scribe model',
    requiresApiKey: true,
    defaultModel: 'scribe_v1',
    supportsLanguageAuto: true,
  },
  {
    name: 'soniox',
    label: 'Soniox',
    description: 'Fast and accurate async transcription',
    requiresApiKey: true,
    defaultModel: 'stt-async-v4',
    supportsLanguageAuto: true,
  },
  {
    name: 'groq',
    label: 'Groq',
    description: 'Fast Whisper via Groq (OpenAI compatible)',
    requiresApiKey: true,
    defaultModel: 'whisper-large-v3-turbo',
    supportsLanguageAuto: true,
  },
  {
    name: 'openai',
    label: 'OpenAI',
    description: 'Official OpenAI Whisper API',
    requiresApiKey: true,
    defaultModel: 'whisper-1',
    supportsLanguageAuto: true,
  },
  {
    name: 'gladia',
    label: 'Gladia',
    description: 'Gladia STT with custom vocabulary',
    requiresApiKey: true,
    supportsLanguageAuto: true,
  },
  {
    name: 'deepgram',
    label: 'Deepgram',
    description: 'Deepgram Nova-3 STT',
    requiresApiKey: true,
    defaultModel: 'nova-3',
    supportsLanguageAuto: true,
  },
  {
    name: 'assemblyai',
    label: 'AssemblyAI',
    description: 'AssemblyAI Speech-to-Text',
    requiresApiKey: true,
    defaultModel: 'best',
    supportsLanguageAuto: true,
  },
];

class ProviderRegistry {
  private providers: Map<string, ProviderRegistryEntry> = new Map();

  constructor() {
    // Register default providers
    this.register('elevenlabs', {
      provider: new ElevenLabsProvider(),
    });

    this.register('soniox', {
      provider: new SonioxProvider(),
    });

    this.register('groq', {
      provider: new GroqProvider(),
    });

    this.register('openai', {
      provider: new OpenAIProvider(),
    });

    this.register('gladia', {
      provider: new GladiaProvider(),
    });

    this.register('deepgram', {
      provider: new DeepgramProvider(),
    });

    this.register('assemblyai', {
      provider: new AssemblyAIProvider(),
    });
  }

  /**
   * Register a new provider
   */
  register(name: string, entry: ProviderRegistryEntry): void {
    this.providers.set(name.toLowerCase(), entry);
  }

  /**
   * Get a provider by name
   */
  get(name: string): ProviderRegistryEntry | undefined {
    return this.providers.get(name.toLowerCase());
  }

  /**
   * Get provider instance only
   */
  getProvider(name: string): ASRProvider | undefined {
    return this.providers.get(name.toLowerCase())?.provider;
  }

  /**
   * Check if a provider exists
   */
  has(name: string): boolean {
    return this.providers.has(name.toLowerCase());
  }

  /**
   * Get all registered provider names
   */
  getAllNames(): string[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Unregister a provider
   */
  unregister(name: string): boolean {
    return this.providers.delete(name.toLowerCase());
  }
}

// Export singleton instance
export const providerRegistry = new ProviderRegistry();

// Re-export types
export type { ASRProvider, ASRConfig, ASRResult, ProviderRegistryEntry } from './types';
