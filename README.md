# ASR 实时语音转写工具

English version: [README.en.md](README.en.md)

基于 Next.js 的浏览器端语音转写工具。项目支持录音期间实时转写、录音完成后的异步转写、多家 ASR 后端切换，并可选使用 AI 后端优化转写文本。

## 功能

- 浏览器端录音和转写
- 支持多家 ASR 后端切换和自动语言检测
- Gladia Real Time WebSocket 实时转写，提供 partial/final 中间结果
- 支持录音回放和重新识别
- 自动复制转写结果到剪贴板
- 本地历史记录保存（原始文本和可选的优化文本）
- AI 文本优化：去填充词、语法和标点润色，同时保留原意与原文语言
- 专业术语库：新增、删除、JSON 导入/导出，并用于 ASR custom vocabulary 和 AI 优化
- AI 后端可自定义模型名称和 OpenAI-compatible Base URL
- 应用配置导入/导出
- PWA 安装，支持桌面方式打开
- 多语言界面

## 支持的 ASR 后端

所有 ASR 后端都需要用户自行提供 API Key，并在浏览器端配置。

| 后端 | 说明 | 默认模型 |
| --- | --- | --- |
| ElevenLabs | 高质量语音识别 | `scribe_v1` |
| Soniox | 异步转写，响应较快 | `stt-async-v4` |
| Groq | 通过 Groq 的 OpenAI-compatible API 调用 Whisper | `whisper-large-v3-turbo` |
| OpenAI | 官方 Whisper API | `whisper-1` |
| Gladia (Async) | 预录音频异步转写，支持 custom vocabulary | 使用 Gladia 预录音 API 的默认模型配置 |
| Gladia Real Time | 通过 WebSocket 发送 16 kHz / 16-bit / mono PCM，返回 partial/final 转写结果 | `solaria-1` |

所有 ASR 后端都需要用户在浏览器设置中输入对应的 API Key。语言可以选择自动检测或指定语言。Gladia 两种模式都支持将术语库作为 custom vocabulary 传给识别服务；实时模式在录音过程中直接展示中间结果，停止录音后继续执行自动优化、复制和历史保存流程。

## 支持的 AI 后端

AI 优化功能当前支持以下后端，同样由用户在浏览器端输入 API Key。

| 后端 | 说明 | 默认模型 |
| --- | --- | --- |
| Groq | 默认 AI 优化后端 | `openai/gpt-oss-120b` |
| OpenAI | OpenAI GPT API | `gpt-4o-mini` |

AI 优化请求使用 OpenAI Chat Completions 格式。界面允许覆盖默认模型名和 Base URL，因此也可以连接兼容该协议的服务；用户需要自行确认模型、接口地址和 API Key 相互兼容。

## 专业术语库

术语项使用 `source → target` 格式。术语会同时用于支持该能力的 ASR 后端和 AI 优化提示词。AI 优化阶段只执行单向规范化：原始转写命中 `source` 时使用 `target`；如果原始转写已经是 `target`，则必须保留该标准术语，不会反向替换或根据上下文臆测添加术语。

术语库可以在界面中逐项添加/删除，也可以导入或导出 JSON。导入项至少需要包含 `source` 和 `target` 字段。

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

### Gladia Real Time relay（可选）

默认情况下，浏览器通过 `/api/gladia/live` 请求服务端创建短期 Gladia Live 会话，再连接返回的 WebSocket URL。若需要使用 Cloudflare relay，可设置 `NEXT_PUBLIC_GLADIA_RELAY_URL`；relay 的部署与配置见 [`cloudflare-relay/README.md`](cloudflare-relay/README.md)。

## 环境变量

核心 ASR 和 AI 功能使用的是浏览器端配置，不需要把 API Key 写进仓库或构建产物。用户在界面中输入的密钥会保存在浏览器的 `localStorage` 中。

如果启用服务端 TTS 路由 `/api/tts`，必须配置 `ELEVEN_LABS_API_KEY`。下表同时列出可选的应用和 Gladia Real Time relay 配置：

| 变量 | 必需 | 说明 |
| --- | --- | --- |
| `ELEVEN_LABS_API_KEY` | 是 | ElevenLabs TTS 服务端密钥 |
| `NEXT_PUBLIC_APP_URL` | 否 | 应用的公开地址，供部署配置使用 |
| `NEXT_PUBLIC_GLADIA_RELAY_URL` | 否 | Gladia Real Time 的可选 WebSocket relay 地址 |

本仓库中的 `.env.local.example` 只提供示例值，不要填入真实密钥后提交。

## 安全注意事项

- 浏览器端输入的 ASR/AI API Key 会保存在 `localStorage`，适合个人设备，不适合共享机器或不受信任的浏览器环境。
- 这些密钥会从浏览器发送到本项目的 `/api/stt` 和 `/api/ai-optimize` 路由，再由服务端转发到对应厂商。
- Gladia Real Time 默认由 `/api/gladia/live` 在服务端创建短期会话；如果配置 relay，浏览器会将 API Key 通过 relay 的会话初始化消息发送给 relay，因此 relay 也必须使用受信任的部署环境。
- 如果启用 `/api/tts`，`ELEVEN_LABS_API_KEY` 仅应保存在部署环境变量中，不要硬编码到前端或提交到仓库。
- 不要在 README、提交记录或配置文件里放入真实密钥。

## 技术栈

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS
- Web Audio API
- WebSocket（Gladia Real Time）
- PWA 支持

## 许可证

MIT License
