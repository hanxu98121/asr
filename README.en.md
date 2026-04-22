# ASR Real-Time Speech-to-Text Tool

中文版本: [README.md](README.md)

A browser-based real-time speech-to-text tool built with Next.js. It lets users record audio in the browser, send it to multiple ASR backends for transcription, and optionally use AI backends to polish the transcript.

## Features

- Browser-based recording and transcription
- Switch between multiple ASR backends
- Playback and re-transcription of the recorded audio
- Auto-copy transcription results to the clipboard
- Local history storage
- AI text optimization
- PWA install support for desktop-style usage
- Multilingual UI

## Supported ASR Backends

Each ASR backend requires a user-provided API key configured in the browser.

| Backend | Notes | Default model |
| --- | --- | --- |
| ElevenLabs | High-quality speech recognition | `scribe_v1` |
| Soniox | Async transcription with fast turnaround | `stt-async-v4` |
| Groq | Whisper-style transcription via Groq | `whisper-large-v3-turbo` |
| OpenAI | Official Whisper API | `whisper-1` |

## Supported AI Backends

The AI optimization feature currently supports the following backends. API keys are also entered in the browser.

| Backend | Notes | Default model |
| --- | --- | --- |
| Groq | Default AI optimization backend | `openai/gpt-oss-120b` |
| OpenAI | OpenAI GPT API | `gpt-4o-mini` |

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

## Environment Variables

Core ASR and AI features use browser-side configuration, so API keys are not stored in the repository or build output. Keys entered in the UI are saved in the browser's `localStorage`.

If you use the server-side TTS route at `/api/tts`, set the following in the runtime environment:

| Variable | Required | Description |
| --- | --- | --- |
| `ELEVEN_LABS_API_KEY` | Yes | Server-side ElevenLabs TTS key |

The `.env.local.example` file contains sample values only. Do not commit real secrets.

## Security Notes

- ASR/AI API keys entered in the browser are stored in `localStorage`, which is suitable for personal devices but not for shared or untrusted browsers.
- Those keys are sent from the browser to the project's `/api/stt` and `/api/ai-optimize` routes, which proxy requests to the upstream providers.
- If you enable `/api/tts`, `ELEVEN_LABS_API_KEY` should exist only in the deployment environment variables and never be hardcoded in frontend code or committed to the repo.
- Do not place real secrets in the README, commits, or example config files.

## Tech Stack

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS
- Web Audio API
- PWA support

## License

MIT License
