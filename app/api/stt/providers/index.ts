/**
 * ASR Providers Index
 * Central export for all ASR provider functionality
 */

// Core types and registry
export { providerRegistry } from './registry';
export type {
  ASRProvider,
  ASRConfig,
  ASRResult,
  ProviderRegistryEntry,
} from './registry';

// Export backend configurations
export { AVAILABLE_BACKENDS } from './registry';

// Provider implementations
export { ElevenLabsProvider } from './elevenlabs';
export { SonioxProvider } from './soniox';
export { GroqProvider } from './groq';
export { GladiaProvider } from './gladia';
export { DeepgramProvider } from './deepgram';
export { AssemblyAIProvider } from './assemblyai';

// Token joining strategies
export {
  SonioxTokenJoinStrategy,
  ElevenLabsTokenJoinStrategy,
  OpenAICompatibleTokenJoinStrategy,
} from './strategies';

// Base types
export type { TokenJoinStrategy } from './types';
