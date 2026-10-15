# ASR Real-Time Speech-to-Text Tool

中文版本: [README.md](README.md)

A browser-based speech-to-text tool built with Next.js. It supports live transcription while recording, asynchronous transcription after recording, multiple ASR backends, and optional AI-based transcript optimization.

## Features

- Browser-based recording and transcription
- Manual Insert segments for asynchronous backends, with text shown while recording and whole-transcript optimization after Stop
- Optional local MP3 upload compression, enabled by default; uncheck to upload the original WAV
- Discard a recording or continue the previous one, preserving and appending audio and text
- Switch between multiple ASR backends with automatic language detection
- Full-row highlights in ASR/AI backend menus on browsers supporting `base-select`, with native menus as a fallback
- Gladia Real Time WebSocket transcription with partial and final results
- Playback and re-transcription of the recorded audio; the button changes to Stop Playback while playing, stops and rewinds on click, and resets when playback ends
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

For asynchronous backends, click **Insert** as often as needed during recording. Each click submits only audio captured since the previous segment while the microphone keeps recording. Segments are queued in recording order and their text is appended as results arrive; Insert does not run AI optimization. **Stop** submits the remaining audio, waits for all segments, then follows the automatic optimization setting to optimize the whole transcript, copy it, and save one history entry. Complete original audio remains available for playback and re-transcription. A failed segment shows an error without preventing later segments; retry the complete recording after Stop to recover missing text. Discard cancels the session and restores the previous state. Gladia Real Time retains its existing live flow.

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

### Audio Upload Compression

Audio upload compression is enabled by default in the ASR settings. A local Web Worker encodes the recorder's 16 kHz mono WAV to 48 kbps MP3 before file transcription. Uncheck the option to upload the original WAV. Playback and continuation merging always retain the original WAV; retry uses the current setting. The preference persists locally and is included in configuration import/export; older configurations preserve the current preference. The control is disabled while recording or processing. Normal transcription, continuation segments, and complete-recording retries all follow this setting.

ElevenLabs, Soniox, Groq, official OpenAI and Gladia Async accept MP3. Custom OpenAI-compatible services must support the format themselves. If compression fails or the service rejects MP3, audio is retained so you can uncheck compression and retry; the app does not automatically submit the WAV again. Gladia Real Time keeps its existing PCM stream, while file retries follow the setting.

MP3 at 48 kbps is approximately 0.36 MB per minute (3.6 MB for ten minutes), with lossy compression. Verify recognition quality against your own audio. Compression does not guarantee arbitrary recording lengths will fit: Vercel's 4.5 MB request limit still applies.

MP3 encoding uses the unmodified LGPL-3.0 [`@breezystack/lamejs`](https://github.com/shijinyu/lamejs), based on [LAME](https://lame.sourceforge.net/).

## Supported AI Backends

The AI optimization feature currently supports the following backends. API keys are also entered in the browser.

| Backend | Notes | Default model |
| --- | --- | --- |
| Groq | Default AI optimization backend | `openai/gpt-oss-120b` |
| OpenAI | OpenAI GPT API | `gpt-4o-mini` |

AI optimization uses the OpenAI Chat Completions message format. The UI allows overriding the default model name and Base URL, so compatible providers can be used when their endpoint, model, and API key are compatible.

Switching AI backends immediately restores each backend’s saved API key, model and Base URL. On upgrade, legacy shared settings are migrated to the previously selected backend. The model field supports dropdown selection and direct typing. Its arrow always opens the full saved list, allowing switching between multiple added models; Add saves a name to that backend’s list, and Delete removes the selected entry and clears the field (blank uses the backend default model). Backend settings and model lists are included in configuration import/export.

Configuration files support multiple saved models per backend and legacy files with only a single `model` field. Exports retain the selected `model`, the full `models` list, and all backend `profiles`; importing a legacy file adds its model to that backend’s selectable list.

## Terminology

Terminology entries use the `source → target` format. They are passed to ASR backends that support custom vocabulary and to the AI optimization prompt. Optimization treats the mapping as one-way normalization: when the original transcript contains `source`, it may be normalized to `target`; if the transcript already contains `target`, that standard term must be preserved and is never replaced in the reverse direction or invented from context.

Terms can be added or deleted in the UI and imported/exported as JSON. Imported entries must contain at least `source` and `target` fields.

## Installation

### Requirements

- Node.js 20.9+ (Node.js 22+ recommended for regression tests)

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

## Local Verification

```bash
npx tsc --noEmit
node --import tsx --test lib/__tests__/*.test.ts
npm run build
```

Browser regression tests require Playwright (available through `NODE_PATH` if needed) and Chrome. Start the development server (for example, `npm run dev -- --port 3011`), set `ASR_TEST_URL` to its address (default `http://localhost:3011`), then run `node lib/__tests__/recording-browser.cjs` and `node lib/__tests__/compression-browser.cjs`. The compression suite verifies the real Worker encoder, ten-minute MP3 decoding and preserved tail audio, compressed continuations and full retries, preference persistence, and configuration import/export. Unit tests cover encoder cancellation, exact original WAV bytes, success after sixty seconds, the 280-second deadline, and payload, format, and non-JSON timeout errors. To validate provider recognition quality, use valid credentials and compare WAV and MP3 versions of the same bilingual/terminology recording; browser tests mock provider responses.

## Deployment

### Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/hanxu98121/asr)

`vercel.json` enables Fluid Compute and the STT route sets `maxDuration = 300`. A shared 280-second processing budget covers the complete pipeline, including uploads, upstream requests and polling; Gladia Async no longer uses a separate 55-second cutoff. Vercel Hobby supports up to 300 seconds with Fluid Compute. Redeploy after changing the configuration and verify the effective duration of `/api/stt` in the deployment details. Timeouts return a clear error, and the original recording remains available on the page for retry.

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
