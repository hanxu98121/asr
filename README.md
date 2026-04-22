# ASR 实时语音转写工具

English version: [README.en.md](README.en.md)

基于 Next.js 的浏览器端实时语音转写工具。项目面向公开仓库使用场景，支持在浏览器中录音、将音频发送到多个 ASR 后端识别，并可选使用 AI 后端优化转写文本。

## 功能

- 浏览器端录音和转写
- 支持多家 ASR 后端切换
- 支持录音回放和重新识别
- 自动复制转写结果到剪贴板
- 本地历史记录保存
- AI 文本优化
- PWA 安装，支持桌面方式打开
- 多语言界面

## 支持的 ASR 后端

所有 ASR 后端都需要用户自行提供 API Key，并在浏览器端配置。

| 后端 | 说明 | 默认模型 |
| --- | --- | --- |
| ElevenLabs | 高质量语音识别 | `scribe_v1` |
| Soniox | 异步转写，响应较快 | `stt-async-v4` |
| Groq | 通过 Groq 调用 Whisper 类模型 | `whisper-large-v3-turbo` |
| OpenAI | 官方 Whisper API | `whisper-1` |

## 支持的 AI 后端

AI 优化功能当前支持以下后端，同样由用户在浏览器端输入 API Key。

| 后端 | 说明 | 默认模型 |
| --- | --- | --- |
| Groq | 默认 AI 优化后端 | `openai/gpt-oss-120b` |
| OpenAI | OpenAI GPT API | `gpt-4o-mini` |

## 安装

### 环境要求

- Node.js 18+

### 本地开发

```bash
git clone https://github.com/hanxu98121/asr.git
cd asr
npm install
npm run dev
```

打开 `http://localhost:3000`。

### 生产构建

```bash
npm run build
npm start
```

## 部署

### Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/hanxu98121/asr)

### Netlify

可直接导入仓库部署。此项目的核心转写与 AI 优化功能不依赖固定服务端环境变量。

## 环境变量

核心 ASR 和 AI 功能使用的是浏览器端配置，不需要把 API Key 写进仓库或构建产物。用户在界面中输入的密钥会保存在浏览器的 `localStorage` 中。

如果启用服务端 TTS 路由 `/api/tts`，需要在运行环境中配置：

| 变量 | 必需 | 说明 |
| --- | --- | --- |
| `ELEVEN_LABS_API_KEY` | 是 | ElevenLabs TTS 服务端密钥 |

本仓库中的 `.env.local.example` 只提供示例值，不要填入真实密钥后提交。

## 安全注意事项

- 浏览器端输入的 ASR/AI API Key 会保存在 `localStorage`，适合个人设备，不适合共享机器或不受信任的浏览器环境。
- 这些密钥会从浏览器发送到本项目的 `/api/stt` 和 `/api/ai-optimize` 路由，再由服务端转发到对应厂商。
- 如果启用 `/api/tts`，`ELEVEN_LABS_API_KEY` 仅应保存在部署环境变量中，不要硬编码到前端或提交到仓库。
- 不要在 README、提交记录或配置文件里放入真实密钥。

## 技术栈

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS
- Web Audio API
- PWA 支持

## 许可证

MIT License
