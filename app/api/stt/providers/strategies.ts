/**
 * Token Joining Strategies for different ASR providers
 */

import { TokenJoinStrategy } from './types';

/**
 * Post-process text to fix common ASR word splitting issues
 */
function postProcessText(text: string): string {
  if (!text) return text;

  // Fix common word splits
  const fixes: [RegExp, string][] = [
    // ASR often splits words like "transcription" into "trans cription"
    [/\btrans\s+crip(?:tion|tions?)\b/gi, 'transcription'],
    [/\btrans\s+crips\b/gi, 'transcripts'],

    // Common word splits
    [/\ban\s+other\b/gi, 'another'],
    [/\bto\s+day\b/gi, 'today'],
    [/\bto\s+night\b/gi, 'tonight'],
    [/\bevery\s+one\b/gi, 'everyone'],
    [/\bevery\s+thing\b/gi, 'everything'],
    [/\bno\s+one\b/gi, 'no one'],
    [/\bno\s+thing\b/gi, 'nothing'],
    [/\bsome\s+one\b/gi, 'someone'],
    [/\bsome\s+thing\b/gi, 'something'],
    [/\bwith\s+out\b/gi, 'without'],
    [/\bwith\s+in\b/gi, 'within'],
    [/\bhow\s+ever\b/gi, 'however'],
    [/\bmore\s+over\b/gi, 'moreover'],
    [/\bthere\s+fore\b/gi, 'therefore'],
    [/\bother\s+wise\b/gi, 'otherwise'],
    [/\bmean\s+while\b/gi, 'meanwhile'],
    [/\bafter\s+wards\b/gi, 'afterwards'],
  ];

  let processed = text;
  for (const [pattern, replacement] of fixes) {
    processed = processed.replace(pattern, replacement);
  }

  return processed;
}

/**
 * Smart token joining strategy for Soniox
 * Handles Chinese, English, and mixed content correctly
 */
export class SonioxTokenJoinStrategy implements TokenJoinStrategy {
  join(tokens: any[]): string {
    if (!tokens || tokens.length === 0) return '';

    const result: string[] = [];

    // Helper functions
    const hasChinese = (text: string) => /[\u4e00-\u9fa5]/.test(text);
    const isEnglishWord = (text: string) => /^[a-zA-Z0-9]+$/.test(text.trim());
    const isPunctuation = (text: string) => /^[.,!?;:'"()\[\]{}\-]+$/.test(text.trim());

    // Track last raw token (not including added spaces)
    let lastRawToken: string | null = null;

    for (const token of tokens) {
      const text = token.text?.trim();
      if (!text) continue;

      // First token - add directly
      if (result.length === 0) {
        result.push(text);
        lastRawToken = text;
        continue;
      }

      const currentHasChinese = hasChinese(text);
      const currentIsEnglishWord = isEnglishWord(text);
      const currentIsPunctuation = isPunctuation(text);

      const lastHasChinese = lastRawToken ? hasChinese(lastRawToken) : false;
      const lastIsEnglishWord = lastRawToken ? isEnglishWord(lastRawToken) : false;
      const lastIsPunctuation = lastRawToken ? isPunctuation(lastRawToken) : false;

      // Determine if we need a space
      let needSpace = false;

      if (currentIsPunctuation) {
        // Punctuation: no space before
        needSpace = false;
      } else if (currentHasChinese) {
        // Chinese: no space before (except after English word for separation)
        if (lastIsEnglishWord) {
          needSpace = true;
        }
      } else if (currentIsEnglishWord) {
        // English word: space before (after Chinese, English word, or punctuation)
        if (lastHasChinese || lastIsEnglishWord || lastIsPunctuation) {
          needSpace = true;
        }
      }

      if (needSpace) {
        result.push(' ');
      }
      result.push(text);
      lastRawToken = text;
    }

    // Apply post-processing to fix common ASR word splitting issues
    return postProcessText(result.join(''));
  }
}

/**
 * Simple space-join strategy for ElevenLabs
 * ElevenLabs already returns properly formatted text
 */
export class ElevenLabsTokenJoinStrategy implements TokenJoinStrategy {
  join(tokens: any[]): string {
    // ElevenLabs returns text directly, no token joining needed
    if (!tokens || tokens.length === 0) return '';

    // If tokens is actually a string (ElevenLabs format), return as-is
    if (typeof tokens === 'string') return tokens;

    // Otherwise join with spaces
    return tokens.map(t => t.text || t).join(' ');
  }
}

/**
 * Generic space-join strategy for Groq and other OpenAI-compatible providers
 */
export class OpenAICompatibleTokenJoinStrategy implements TokenJoinStrategy {
  join(tokens: any[]): string {
    if (!tokens || tokens.length === 0) return '';

    // OpenAI compatible APIs typically return text directly
    if (typeof tokens === 'string') return tokens;

    // Or join tokens with spaces
    return tokens.map(t => t.text || t).filter(Boolean).join(' ');
  }
}
