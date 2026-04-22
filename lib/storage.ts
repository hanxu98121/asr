import { TranscriptionRecord } from './types';
import type { AIOptimizerBackend } from './ai-optimizer';

const STORAGE_KEY = 'asr_transcription_history';
const MAX_HISTORY_SIZE = 100;

// AI Optimizer storage keys
const AI_OPTIMIZER_BACKEND_KEY = 'ai-optimizer-backend';
const AI_OPTIMIZER_API_KEY_KEY = 'ai-optimizer-api-key';
const AI_OPTIMIZER_PROMPT_KEY = 'ai-optimizer-prompt';
const AI_TERMINOLOGY_KEY = 'ai-terminology-list';
const HISTORY_UPDATED_EVENT = 'asr-history-updated';

export interface TerminologyItem {
  id: string;
  source: string; // 同义词/错误词，多个用顿号分隔
  target: string; // 标准术语
}

// 触发历史记录更新事件
const dispatchHistoryUpdate = () => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(HISTORY_UPDATED_EVENT));
  }
};

export const storage = {
  saveRecord: (record: TranscriptionRecord): void => {
    if (typeof window === 'undefined') return;

    try {
      const records = storage.getRecords();
      records.unshift(record);

      // 限制历史记录数量
      if (records.length > MAX_HISTORY_SIZE) {
        records.splice(MAX_HISTORY_SIZE);
      }

      localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
      dispatchHistoryUpdate();
    } catch (error) {
      console.error('Failed to save transcription record:', error);
    }
  },

  getRecords: (): TranscriptionRecord[] => {
    if (typeof window === 'undefined') return [];

    try {
      const data = localStorage.getItem(STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('Failed to get transcription records:', error);
      return [];
    }
  },

  deleteRecord: (id: string): void => {
    if (typeof window === 'undefined') return;

    try {
      const records = storage.getRecords();
      const filtered = records.filter(record => record.id !== id);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
      dispatchHistoryUpdate();
    } catch (error) {
      console.error('Failed to delete transcription record:', error);
    }
  },

  clearAll: (): void => {
    if (typeof window === 'undefined') return;

    try {
      localStorage.removeItem(STORAGE_KEY);
      dispatchHistoryUpdate();
    } catch (error) {
      console.error('Failed to clear transcription history:', error);
    }
  },

  // 导出事件名供组件监听
  HISTORY_UPDATED_EVENT,

  // AI Optimizer 配置
  setAIOptimizerBackend: (backend: AIOptimizerBackend): void => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(AI_OPTIMIZER_BACKEND_KEY, backend);
  },

  getAIOptimizerBackend: (): AIOptimizerBackend => {
    if (typeof window === 'undefined') return 'groq';
    return (localStorage.getItem(AI_OPTIMIZER_BACKEND_KEY) as AIOptimizerBackend) || 'groq';
  },

  setAIOptimizerApiKey: (apiKey: string): void => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(AI_OPTIMIZER_API_KEY_KEY, apiKey);
  },

  getAIOptimizerApiKey: (): string => {
    if (typeof window === 'undefined') return '';
    return localStorage.getItem(AI_OPTIMIZER_API_KEY_KEY) || '';
  },

  setAIOptimizerPrompt: (prompt: string): void => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(AI_OPTIMIZER_PROMPT_KEY, prompt);
  },

  getAIOptimizerPrompt: (): string => {
    if (typeof window === 'undefined') return '';
    return localStorage.getItem(AI_OPTIMIZER_PROMPT_KEY) || '';
  },

  // 专业术语管理
  saveTerminology: (terms: TerminologyItem[]): void => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(AI_TERMINOLOGY_KEY, JSON.stringify(terms));
  },

  getTerminology: (): TerminologyItem[] => {
    if (typeof window === 'undefined') return [];
    try {
      const data = localStorage.getItem(AI_TERMINOLOGY_KEY);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('Failed to get terminology list:', error);
      return [];
    }
  },

  // 生成术语对照表的提示词文本
  getTerminologyPrompt: (): string => {
    const terms = storage.getTerminology();
    if (terms.length === 0) return '';
    
    let prompt = '\n---\n### 专业术语对照表（必须严格遵守）：\n';
    terms.forEach(term => {
      prompt += `- ${term.source} → ${term.target}\n`;
    });
    prompt += '---\n';
    return prompt;
  },
};
