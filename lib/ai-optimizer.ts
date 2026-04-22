export type AIOptimizerBackend = 'groq' | 'openai';

export interface AIOptimizerConfig {
  name: AIOptimizerBackend;
  label: string;
  description: string;
  requiresApiKey: boolean;
  defaultModel?: string;
  defaultBaseUrl?: string;
}

export const AVAILABLE_AI_BACKENDS: AIOptimizerConfig[] = [
  {
    name: 'groq',
    label: 'Groq',
    description: 'Fast LLM via Groq (Default)',
    requiresApiKey: true,
    defaultModel: 'openai/gpt-oss-120b',
    defaultBaseUrl: 'https://api.groq.com/openai/v1',
  },
  {
    name: 'openai',
    label: 'OpenAI',
    description: 'OpenAI GPT API',
    requiresApiKey: true,
    defaultModel: 'gpt-4o-mini',
    defaultBaseUrl: 'https://api.openai.com/v1',
  },
];

export const DEFAULT_PROMPT = `你是专业的口语转写优化助手，请优化以下口语转写文本：

优化规则：
1. 去除所有填充词（嗯、啊、哦、那个、就是说、对吧、你知道、我觉得、呃、之类的等）
2. 修正语法错误，调整语句逻辑，让表达更通顺流畅
3. 保留原文的全部核心意思和观点，不要遗漏任何内容
4. 适当添加标点符号，分段整理，提高可读性
5. 不要改写原意，不要添加额外内容
6. 【重要】严格保留原文的语言：中文就是中文，英文就是英文，中英夹杂就保留中英夹杂，绝对不要进行任何翻译
7. 仅返回优化后的文本，不需要任何解释说明

需要优化的文本：`;

export class AIOptimizer {
  private apiKey: string = '';
  private backend: AIOptimizerBackend = 'groq';
  private prompt: string = DEFAULT_PROMPT;
  private model: string = 'openai/gpt-oss-120b';
  private baseUrl: string = 'https://api.groq.com/openai/v1';

  constructor(apiKey?: string, backend?: AIOptimizerBackend, prompt?: string) {
    if (apiKey) this.apiKey = apiKey;
    if (backend) this.backend = backend;
    if (prompt) this.prompt = prompt;
  }

  setApiKey(apiKey: string): void {
    this.apiKey = apiKey;
  }

  setBackend(backend: AIOptimizerBackend): void {
    this.backend = backend;
    const config = AVAILABLE_AI_BACKENDS.find(b => b.name === backend);
    this.baseUrl = config?.defaultBaseUrl || this.baseUrl;
    this.model = config?.defaultModel || this.model;
  }

  setPrompt(prompt: string): void {
    this.prompt = prompt;
  }

  setModel(model: string): void {
    this.model = model;
  }

  setBaseUrl(baseUrl: string): void {
    this.baseUrl = baseUrl;
  }

  getBackend(): AIOptimizerBackend {
    return this.backend;
  }

  getBackendConfig(): AIOptimizerConfig | undefined {
    return AVAILABLE_AI_BACKENDS.find(b => b.name === this.backend);
  }

  async optimizeText(text: string): Promise<{ success: boolean; text: string; error?: string }> {
    if (!this.apiKey) {
      return { success: false, text: '', error: '请先输入 API Key' };
    }

    try {
      const response = await fetch('/api/ai-optimize', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text,
          prompt: this.prompt,
          apiKey: this.apiKey,
          backend: this.backend,
          model: this.model,
          baseUrl: this.baseUrl,
        }),
      });

      const result = await response.json();

      if (!result.success) {
        return { success: false, text: '', error: result.error || '优化失败' };
      }

      return {
        success: true,
        text: result.text,
      };
    } catch (error) {
      return {
        success: false,
        text: '',
        error: (error as Error).message,
      };
    }
  }
}