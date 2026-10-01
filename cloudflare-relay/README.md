# Gladia WebSocket relay

Each browser WebSocket gets its own Durable Object, which creates one Gladia
Live session and forwards binary PCM frames and JSON events in both directions.
The user's Gladia API key is sent as the first encrypted WebSocket message; it
is not put in a URL or stored as a Cloudflare secret.

## Audio upload compression

The frontend's **Compress audio uploads** checkbox applies to recording files
sent to `/api/stt`, including re-transcription of a live recording through Gladia
Async. It does not change this relay's 16 kHz / 16-bit / mono PCM stream or require
any relay configuration changes. The 300-second STT function duration and
280-second processing budget apply to the frontend server's file-transcription
route, not this WebSocket relay.

前端的“压缩音频上传”开关用于 `/api/stt` 文件识别，包括实时录音结束后的
Gladia Async 重新识别。此 relay 的 16 kHz / 16-bit / 单声道 PCM 音频流保持不变，
无需调整 relay 配置。STT 的 300 秒函数时限和 280 秒处理预算仅用于前端服务器的
文件识别路由，不是此 WebSocket relay 的会话时限。

See the [Chinese README](../README.md) or [English README](../README.en.md)
for compression behavior and file-transcription deployment settings.

## Deploy

From this directory:

```bash
npm install
npx wrangler login
npx wrangler deploy
```

Set `ALLOWED_ORIGIN` in `wrangler.toml` to the exact HTTPS origin of the ASR
frontend, then deploy again. In the Vercel project, set:

```text
NEXT_PUBLIC_GLADIA_RELAY_URL=https://<worker-subdomain>.workers.dev
```

The frontend converts that URL to `wss://` for the live session. If the
variable is empty, it falls back to the Vercel `/api/gladia/live` initializer
and direct Gladia WebSocket connection.
