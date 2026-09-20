# Gladia WebSocket relay

Each browser WebSocket gets its own Durable Object, which creates one Gladia
Live session and forwards binary PCM frames and JSON events in both directions.
The user's Gladia API key is sent as the first encrypted WebSocket message; it
is not put in a URL or stored as a Cloudflare secret.

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
