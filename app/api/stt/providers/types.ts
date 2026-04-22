/**
 * ASR Provider Types and Interfaces
 * Defines the contract for all ASR backend implementations
 */

export interface ASRConfig {
  apiKey: string;
  language?: string;
  model?: string;
  enablePunctuation?: boolean;
  [key: string]: any;
}

export interface ASRResult {
  text: string;
  language?: string;
  duration?: number;
  confidence?: number;
  rawResponse?: any;
}

export interface ASRProvider {
  name: string;

  /**
   * Transcribe audio file
   * @param audioBuffer - Audio file buffer
   * @param fileName - Original file name
   * @param config - ASR configuration
   * @returns Transcription result
   */
  transcribe(
    audioBuffer: Buffer,
    fileName: string,
    config: ASRConfig
  ): Promise<ASRResult>;
}

/**
 * Token joining strategy for different ASR providers
 */
export interface TokenJoinStrategy {
  /**
   * Join tokens into final text
   * @param tokens - Array of token objects from ASR provider
   * @returns Joined text string
   */
  join(tokens: any[]): string;
}

/**
 * Provider registry entry
 */
export interface ProviderRegistryEntry {
  provider: ASRProvider;
  tokenJoinStrategy?: TokenJoinStrategy;
}

/**
 * ASR Backend Configuration
 */
export interface ASRBackendConfig {
  name: string;
  label: string;
  description: string;
  requiresApiKey: boolean;
  defaultModel?: string;
  supportsLanguageAuto?: boolean;
}
