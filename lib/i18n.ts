export type Language = 'zh' | 'en';

export interface Translations {
  [key: string]: {
    zh: string;
    en: string;
  };
}

export const translations: Translations = {
  // Header
  'header.title': {
    zh: '🎤 实时语音转文字',
    en: '🎤 Real-time Speech to Text'
  },
  'header.subtitle': {
    zh: '说话即转写，提升办公效率',
    en: 'Speak and transcribe, boost work efficiency'
  },

  // AudioRecorder
  'audio.start': {
    zh: '开始录音',
    en: 'Start Recording'
  },
  'audio.pause': {
    zh: '暂停',
    en: 'Pause'
  },
  'audio.resume': {
    zh: '继续',
    en: 'Resume'
  },
  'audio.stop': {
    zh: '停止',
    en: 'Stop'
  },
  'audio.recording': {
    zh: '正在录音，识别中...',
    en: 'Recording, recognizing...'
  },
  'audio.browser.not.support': {
    zh: '您的浏览器不支持麦克风访问，请使用localhost或HTTPS访问',
    en: 'Your browser does not support microphone access, please use localhost or HTTPS'
  },

  // RealtimeSubtitles
  'subtitles.title': {
    zh: '转写结果',
    en: 'Transcription Result'
  },
  'subtitles.characters': {
    zh: '字符',
    en: 'characters'
  },
  'subtitles.listening': {
    zh: '正在聆听，请说话...',
    en: 'Listening, please speak...'
  },
  'subtitles.placeholder': {
    zh: '点击开始录音按钮开始转写',
    en: 'Click the start recording button to begin transcription'
  },

  // ActionButtons
  'action.copy': {
    zh: '复制内容',
    en: 'Copy Content'
  },
  'action.download': {
    zh: '导出文件',
    en: 'Export File'
  },
  'action.clear': {
    zh: '清除内容',
    en: 'Clear Content'
  },
  'action.copy.success': {
    zh: '已复制到剪贴板',
    en: 'Copied to clipboard'
  },
  'action.copy.failed': {
    zh: '复制失败，请手动复制',
    en: 'Copy failed, please copy manually'
  },
  'action.clear.confirm': {
    zh: '确定要清除当前转写内容吗？',
    en: 'Are you sure you want to clear the current transcription?'
  },
  'action.download.filename': {
    zh: '转写记录_',
    en: 'transcription_'
  },

  // HistoryPanel
  'history.title': {
    zh: '历史记录',
    en: 'History'
  },
  'history.empty': {
    zh: '暂无转写历史',
    en: 'No transcription history yet'
  },
  'history.clear.all': {
    zh: '清空全部',
    en: 'Clear All'
  },
  'history.clear.confirm': {
    zh: '确定要清空所有历史记录吗？',
    en: 'Are you sure you want to clear all history records?'
  },
  'history.use': {
    zh: '使用该记录',
    en: 'Use this record'
  },
  'history.copy': {
    zh: '复制',
    en: 'Copy'
  },
  'history.delete': {
    zh: '删除',
    en: 'Delete'
  },
  'history.optimized': {
    zh: '显示优化文本',
    en: 'Show optimized text'
  },

  // ASR Settings
  'settings.asr.backend': {
    zh: '选择ASR后端',
    en: 'Select ASR Backend'
  },
  'settings.api.key': {
    zh: 'API Key',
    en: 'API Key'
  },
  'settings.get.api.key': {
    zh: '如何获取？',
    en: 'How to get?'
  },
  'settings.enter.api.key': {
    zh: '请输入API Key',
    en: 'Please enter API Key'
  },

  // AI Optimizer
  'ai.title': {
    zh: 'AI 文本优化',
    en: 'AI Text Optimization'
  },
  'ai.optimize': {
    zh: '✨ 优化文本',
    en: '✨ Optimize Text'
  },
  'ai.optimizing': {
    zh: '优化中...',
    en: 'Optimizing...'
  },
  'ai.auto.optimize': {
    zh: '录音完成后自动优化',
    en: 'Auto optimize after recording'
  },
  'ai.auto.copy': {
    zh: '复制优化后的文本（关闭则复制原文本）',
    en: 'Copy optimized text (copy original if off)'
  },
  'ai.model.placeholder': {
    zh: 'gpt-4o-mini',
    en: 'gpt-4o-mini'
  },
  'ai.baseurl.placeholder': {
    zh: '自定义端点（可选）',
    en: 'Custom endpoint (optional)'
  },
  'ai.prompt.placeholder': {
    zh: '输入优化提示词...',
    en: 'Enter optimization prompt...'
  },
  'ai.terminology.title': {
    zh: '📚 专业术语管理',
    en: '📚 Terminology Management'
  },
  'ai.terminology.source.placeholder': {
    zh: '同义词（多个用顿号分隔）',
    en: 'Synonyms (separate with comma)'
  },
  'ai.terminology.target.placeholder': {
    zh: '标准术语',
    en: 'Standard term'
  },
  'ai.terminology.add': {
    zh: '添加',
    en: 'Add'
  },
  'ai.terminology.empty': {
    zh: '暂无专业术语，添加后优化时会自动遵守术语规范',
    en: 'No terminology yet, added terms will be respected during optimization'
  },
  'ai.terminology.export': {
    zh: '📤 导出术语',
    en: '📤 Export Terms'
  },
  'ai.terminology.import': {
    zh: '📥 导入术语',
    en: '📥 Import Terms'
  },
  'ai.terminology.import.success': {
    zh: '导入成功！',
    en: 'Import successful!'
  },
  'ai.terminology.import.failed': {
    zh: '导入失败：文件格式不正确，每个术语必须包含source和target字段',
    en: 'Import failed: invalid format, each term must have source and target fields'
  },
  'ai.terminology.import.invalid': {
    zh: '导入失败：不是有效的JSON文件',
    en: 'Import failed: not a valid JSON file'
  },
  'ai.terminology.filename': {
    zh: '专业术语表_',
    en: 'terminology_'
  },

  // Import/Export Config
  'config.title': {
    zh: '⚙️ 配置导入导出',
    en: '⚙️ Import/Export Configuration'
  },
  'config.description': {
    zh: '包含所有API Key、设置和专业术语',
    en: 'Includes all API Keys, settings and terminology'
  },
  'config.export': {
    zh: '📤 导出全部配置',
    en: '📤 Export All Config'
  },
  'config.import': {
    zh: '📥 导入配置',
    en: '📥 Import Config'
  },
  'config.import.filename': {
    zh: 'ASR工具配置_',
    en: 'asr_config_'
  },
  'config.import.invalid': {
    zh: '导入失败：配置文件格式不正确',
    en: 'Import failed: invalid configuration file format'
  },
  'config.import.confirm': {
    zh: '确定要导入配置吗？现有配置会被覆盖。',
    en: 'Are you sure you want to import configuration? Existing config will be overwritten.'
  },
  'config.import.success': {
    zh: '配置导入成功！页面将刷新以应用新配置。',
    en: 'Configuration imported successfully! Page will refresh to apply changes.'
  },

  // Operation Buttons
  'op.play': {
    zh: '播放录音',
    en: 'Play Recording'
  },
  'op.retry': {
    zh: '重新识别',
    en: 'Retry Recognition'
  },
  'op.reoptimize': {
    zh: '重新优化',
    en: 'Re-optimize'
  },
  'op.copy': {
    zh: '复制文本',
    en: 'Copy Text'
  },
  'op.processing': {
    zh: '正在识别中，请稍候...',
    en: 'Recognizing, please wait...'
  },

  // Optimization Result
  'optimization.title': {
    zh: '✨ 优化结果',
    en: '✨ Optimization Result'
  },

  // Keyboard Shortcuts
  'shortcuts.title': {
    zh: '⌨️ 快捷键',
    en: '⌨️ Keyboard Shortcuts'
  },
  'shortcuts.start': {
    zh: '开始/停止录音',
    en: 'Start/Stop Recording'
  },
  'shortcuts.copy': {
    zh: '复制结果',
    en: 'Copy Result'
  },
  'shortcuts.clear': {
    zh: '清除内容',
    en: 'Clear Content'
  },
  'shortcuts.save': {
    zh: '保存到历史',
    en: 'Save to History'
  },

  // Error Messages
  'error.no.transcript': {
    zh: '没有可优化的文本',
    en: 'No text to optimize'
  },
  'error.no.ai.api.key': {
    zh: '请先输入 AI 优化 API Key',
    en: 'Please enter AI optimization API Key'
  },
  'error.optimize.failed': {
    zh: '优化失败：',
    en: 'Optimization failed: '
  },
  'error.no.api.key': {
    zh: '请先输入',
    en: 'Please enter '
  },
  'error.recognize.failed': {
    zh: '识别失败：',
    en: 'Recognition failed: '
  },
  'error.play.failed': {
    zh: '播放失败：',
    en: 'Playback failed: '
  },
  'error.audio': {
    zh: '错误：',
    en: 'Error: '
  },

  // Footer
  'footer.text': {
    zh: '部署在 Vercel | 基于 Next.js + 多 ASR 引擎',
    en: 'Deployed on Vercel | Built with Next.js + Multi-engine ASR'
  },

  // Language Switch
  'language.switch': {
    zh: 'English',
    en: '中文'
  }
};

export function useTranslation() {
  const getCurrentLanguage = (): Language => {
    if (typeof window === 'undefined') return 'zh';
    return (localStorage.getItem('language') as Language) || 'zh';
  };

  const setLanguage = (lang: Language) => {
    if (typeof window === 'undefined') return;
    localStorage.setItem('language', lang);
    window.dispatchEvent(new Event('languageChanged'));
    // 强制页面重新加载确保所有内容更新
    window.location.reload();
  };

  const t = (key: string): string => {
    const lang = getCurrentLanguage();
    return translations[key]?.[lang] || key;
  };

  return {
    t,
    language: getCurrentLanguage(),
    setLanguage,
  };
}
