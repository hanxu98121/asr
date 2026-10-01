# ASR Real-Time Speech-to-Text Tool

中文版本: [README.md](README.md)

A browser-based speech-to-text tool built with Next.js. It supports live transcription while recording, asynchronous transcription after recording, multiple ASR backends, and optional AI-based transcript optimization.

## Features

- Browser-based recording and transcription
- Discard a recording or continue the previous one, preserving and appending audio and text
- Switch between multiple ASR backends with automatic language detection
- Gladia Real Time WebSocket transcription with partial and final results
- Playback and re-transcription of the recorded audio
- Auto-copy transcription results to the clipboard
- Local history storage for original and optional optimized text
- AI text optimization for filler-word removal, grammar, punctuation, and readability while preserving meaning and language
- Terminology management with add/delete and JSON import/export, used by ASR custom vocabulary and AI optimization
- Custom AI model name and OpenAI-compatible Base URL
- Application configuration import/export
- PWA install support for desktop-style usage
- Multilingual UI

## Supported ASR Backends

While recording, you can pause, stop, or **Discard Recording**. Discard restores the state before recording; discarding a continuation only removes the new segment. After processing finishes, **Continue Previous** appends new speech, merges the complete audio, and optimizes the entire transcript. Continuations update the same history entry. Paused time is excluded from recording duration. Continuation is available only for the current page's recording, and resets on reload, clear, or loading history.

Each ASR backend requires a user-provided API key configured in the browser.

| Backend | Notes | Default model |
| --- | --- | --- |
| ElevenLabs | High-quality speech recognition | `scribe_v1` |
| Soniox | Async transcription with fast turnaround | `stt-async-v4` |
| Groq | Whisper transcription through Groq's OpenAI-compatible API | `whisper-large-v3-turbo` |
| OpenAI Compatible | OpenAI and compatible audio transcription APIs with custom Base URL and model | `whisper-1` |
| Gladia (Async) | Asynchronous pre-recorded transcription with custom vocabulary | Gladia pre-recorded API default model configuration |
| Gladia Real Time | WebSocket transcription with 16 kHz / 16-bit / mono PCM and partial/final results | `solaria-1` |

Every ASR backend requires an API key entered in the browser settings. The language can be auto-detected or specified explicitly. Both Gladia modes can receive the terminology list as custom vocabulary. Real-time mode displays interim results while recording and runs the existing optimization, copy, and history flow after recording stops.

Select **OpenAI Compatible** to configure the ASR Base URL, model, and service API key. Blank URL and model fields default to `https://api.openai.com/v1` and `whisper-1`. Include the service path prefix; the app appends `/audio/transcriptions`. The service must support multipart audio uploads and JSON transcription responses at this endpoint; Chat Completions compatibility alone is insufficient. Settings persist in the browser and are included in configuration import/export. Existing OpenAI API key settings remain valid.

OpenRouter example: Base URL `https://openrouter.ai/api/v1`, model `openai/whisper-large-v3`, and an OpenRouter API key. See [OpenRouter audio API documentation](https://openrouter.ai/blog/announcing-audio-apis/).

## Supported AI Backends

The AI optimization feature currently supports the following backends. API keys are also entered in the browser.

| Backend | Notes | Default model |
| --- | --- | --- |
| Groq | Default AI optimization backend | `openai/gpt-oss-120b` |
| OpenAI | OpenAI GPT API | `gpt-4o-mini` |

AI optimization uses the OpenAI Chat Completions message format. The UI allows overriding the default model name and Base URL, so compatible providers can be used when their endpoint, model, and API key are compatible.

## Terminology

Terminology entries use the `source → target` format. They are passed to ASR backends that support custom vocabulary and to the AI optimization prompt. Optimization treats the mapping as one-way normalization: when the original transcript contains `source`, it may be normalized to `target`; if the transcript already contains `target`, that standard term must be preserved and is never replaced in the reverse direction or invented from context.

Terms can be added or deleted in the UI and imported/exported as JSON. Imported entries must contain at least `source` and `target` fields.

## Installation

### Requirements

- Node.js 18+

### Local Development

```bash
git clone https://github.com/hanxu98121/asr.git
cd asr
npm install
npm run dev
```

Open `http://localhost:3000`.

### Production Build

```bash
npm run build
npm start
```

## Deployment

### Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/hanxu98121/asr)

### Netlify

You can import the repository directly. The core transcription and AI optimization flows do not depend on mandatory server-side environment variables.

### Optional Gladia Real Time relay

By default, the browser calls `/api/gladia/live` to create a short-lived Gladia Live session on the server and then connects to the returned WebSocket URL. To use the Cloudflare relay instead, set `NEXT_PUBLIC_GLADIA_RELAY_URL`; deployment details are in [`cloudflare-relay/README.md`](cloudflare-relay/README.md).

## Environment Variables

Core ASR and AI features use browser-side configuration, so API keys are not stored in the repository or build output. Keys entered in the UI are saved in the browser's `localStorage`.

If you use the server-side TTS route at `/api/tts`, `ELEVEN_LABS_API_KEY` is required. The table also lists optional application and Gladia Real Time relay settings:

| Variable | Required | Description |
| --- | --- | --- |
| `ELEVEN_LABS_API_KEY` | Yes | Server-side ElevenLabs TTS key |
| `NEXT_PUBLIC_APP_URL` | No | Public application URL used by deployment configuration |
| `NEXT_PUBLIC_GLADIA_RELAY_URL` | No | Optional WebSocket relay URL for Gladia Real Time |

The `.env.local.example` file contains sample values only. Do not commit real secrets.

## Security Notes

- ASR/AI API keys entered in the browser are stored in `localStorage`, which is suitable for personal devices but not for shared or untrusted browsers.
- Those keys are sent from the browser to the project's `/api/stt` and `/api/ai-optimize` routes, which proxy requests to the upstream providers.
- Gladia Real Time normally creates a short-lived session through `/api/gladia/live`; when a relay is configured, the browser sends the API key in the relay's session-initialization message, so the relay must be deployed in a trusted environment.
- If you enable `/api/tts`, `ELEVEN_LABS_API_KEY` should exist only in the deployment environment variables and never be hardcoded in frontend code or committed to the repo.
- Do not place real secrets in the README, commits, or example config files.

## Tech Stack

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS
- Web Audio API
- WebSocket (Gladia Real Time)
- PWA support

## License

MIT License
