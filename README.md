# ASR 实时语音转写工具

English version: [README.en.md](README.en.md)

基于 Next.js 的浏览器端语音转写工具。项目支持录音期间实时转写、录音完成后的异步转写、多家 ASR 后端切换，并可选使用 AI 后端优化转写文本。

## 功能

- 浏览器端录音和转写
- 非实时后端支持 Insert 手动分段提交：继续录音时依次显示分段文字，Stop 后统一优化整篇
- 可选本机 MP3 压缩上传（默认开启），取消勾选可上传原始 WAV
- 录音撤销与继续上次：恢复录音前状态，或接着追加音频和文字
- 支持多家 ASR 后端切换和自动语言检测
- ASR／AI 后端下拉菜单在支持 `base-select` 的浏览器中使用整行高亮，其他浏览器保留原生菜单
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

录音中可暂停、停止或**撤销**。撤销会丢弃本次录音并恢复录音前的内容；续录时撤销只丢弃新增部分。停止并处理完成后，点击**继续上次**可以接着录，保留原文、合并完整音频，并对整篇内容执行自动优化。同一份录音的续录更新同一条历史记录。暂停不计入录音时长。继续上次仅对当前页面的录音有效，刷新、清空或加载历史后不可续录。

所有 ASR 后端都需要用户自行提供 API Key，并在浏览器端配置。

非实时后端录音期间可反复点击 **Insert（提交本段）**，每次只提交上次分段之后的新音频，麦克风持续录音。分段按点击顺序排队转写，返回的文字依次追加到下方；Insert 不触发 AI 优化。**停止**会提交最后一段，等待所有分段处理完成，再按自动优化设置对整篇文字统一优化、复制并保存同一条历史记录。完整原始录音仍可回放和重新识别；分段失败时显示错误并继续后续分段，可在停止后重新识别完整录音。撤销会取消本次分段并恢复录音前状态。Gladia Real Time 保持原有实时流程。

| 后端 | 说明 | 默认模型 |
| --- | --- | --- |
| ElevenLabs | 高质量语音识别 | `scribe_v1` |
| Soniox | 异步转写，响应较快 | `stt-async-v4` |
| Groq | 通过 Groq 的 OpenAI-compatible API 调用 Whisper | `whisper-large-v3-turbo` |
| OpenAI Compatible | OpenAI 及兼容的音频转写 API，可配置 Base URL 和模型 | `whisper-1` |
| Gladia (Async) | 预录音频异步转写，支持 custom vocabulary | 使用 Gladia 预录音 API 的默认模型配置 |
| Gladia Real Time | 通过 WebSocket 发送 16 kHz / 16-bit / mono PCM，返回 partial/final 转写结果 | `solaria-1` |

所有 ASR 后端都需要用户在浏览器设置中输入对应的 API Key。语言可以选择自动检测或指定语言。Gladia 两种模式都支持将术语库作为 custom vocabulary 传给识别服务；实时模式在录音过程中直接展示中间结果，停止录音后继续执行自动优化、复制和历史保存流程。

选择 **OpenAI Compatible** 后，可填写 ASR Base URL、模型名称及对应服务的 API Key。留空地址和模型时，使用 `https://api.openai.com/v1` 和 `whisper-1`。地址应包含服务的路径前缀，程序会追加 `/audio/transcriptions`；服务必须支持该接口的 multipart 音频上传和 JSON 转写响应，仅兼容 Chat Completions 的服务不适用。设置会保存在浏览器，并随应用配置导入/导出；原有 OpenAI API Key 配置继续有效。

OpenRouter 示例：Base URL 为 `https://openrouter.ai/api/v1`，模型为 `openai/whisper-large-v3`，填入 OpenRouter API Key。参见 [OpenRouter 音频 API 说明](https://openrouter.ai/blog/announcing-audio-apis/)。

### 音频压缩上传

ASR 后端选择框下的“压缩音频上传”默认开启。文件识别前，浏览器在本机 Web Worker 中将录音编码为 16 kHz 单声道、48 kbps MP3；取消勾选则上传原始未压缩 WAV。原始 WAV 始终用于回放和续录合并，重新识别时按当前开关生成上传副本。设置保存在浏览器，并随配置导入／导出；旧配置没有这个字段时保留当前选择。录音或处理期间不能切换；正常识别、续录新增音频和整段重新识别都遵循该设置。

ElevenLabs、Soniox、Groq、OpenAI 官方和 Gladia Async 均支持 MP3。自定义 OpenAI-compatible 服务仍需自行确认格式支持；若服务拒绝 MP3，取消勾选后重新识别。压缩失败时保留录音，不会自动再次提交 WAV。Gladia Real Time 的实时 PCM 音频流不受此设置影响，其录音文件重新识别仍遵循开关。

48 kbps MP3 每分钟约 0.36 MB，10 分钟约 3.6 MB，实际大小略有变化；这是有损压缩，识别质量应按实际音频验证。压缩不能保证任意长度录音都可上传，Vercel 的 4.5 MB 请求体限制仍然适用。

MP3 编码使用 LGPL-3.0 的 [`@breezystack/lamejs`](https://github.com/shijinyu/lamejs)，基于 [LAME](https://lame.sourceforge.net/)；本项目未修改编码器。

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

- Node.js 20.9+（运行回归测试建议使用 Node.js 22+）

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

## 本地验证

```bash
npx tsc --noEmit
node --import tsx --test lib/__tests__/*.test.ts
npm run build
```

浏览器回归需提供 Playwright（可通过 `NODE_PATH`）和可用的 Chrome；先启动开发服务器（例如 `npm run dev -- --port 3011`），然后设置 `ASR_TEST_URL` 为应用地址（默认 `http://localhost:3011`），运行 `node lib/__tests__/recording-browser.cjs` 和 `node lib/__tests__/compression-browser.cjs`。后者验证真实 Worker 编码、10 分钟 MP3 的解码和末尾音频、压缩续录与整段重试、设置保存和配置导入／导出。单元测试覆盖取消编码、原始 WAV 字节保留、超过 60 秒后成功、280 秒截止时间，以及文件过大、格式不支持和非 JSON 超时错误。厂商识别质量需要用自己的有效 API Key 和同一份中英文／术语录音对比 WAV 与 MP3；浏览器回归模拟厂商响应，不验证实际识别质量。

## 部署

### Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/hanxu98121/asr)

仓库的 `vercel.json` 启用 Fluid Compute，STT 路由设置 `maxDuration = 300`；服务端为完整识别流程设置 280 秒预算，涵盖上传、上游请求和轮询。Vercel Hobby 在 Fluid Compute 下支持最长 300 秒。修改后需要重新部署，并在部署详情中确认 `/api/stt` 的实际时限。Gladia Async 不再使用独立的 55 秒截止时间。超过预算时返回明确的超时错误，并保留页面上的原始录音供重试。

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
