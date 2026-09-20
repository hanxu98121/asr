interface Env {
  ALLOWED_ORIGIN?: string;
  GLADIA_SESSIONS: DurableObjectNamespace;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get('Origin');
    if (env.ALLOWED_ORIGIN && origin !== env.ALLOWED_ORIGIN) {
      return new Response('Forbidden origin', { status: 403 });
    }

    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('Expected Upgrade: websocket', { status: 426 });
    }

    const sessionId = env.GLADIA_SESSIONS.newUniqueId();
    return env.GLADIA_SESSIONS.get(sessionId).fetch(request);
  },
} satisfies ExportedHandler<Env>;

export class GladiaRelaySession implements DurableObject {
  private readonly ctx: DurableObjectState;
  private readonly env: Env;
  private upstream: WebSocket | null = null;
  private pendingMessages: Array<string | ArrayBuffer> = [];
  private clientSocket: WebSocket | null = null;
  private sessionStarted = false;

  constructor(ctx: DurableObjectState, env: Env) {
    this.ctx = ctx;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    const [client, server] = Object.values(new WebSocketPair());
    this.clientSocket = server;
    server.accept({ allowHalfOpen: true });

    server.addEventListener('message', (event) => {
      if (!this.sessionStarted && typeof event.data === 'string') {
        try {
          const message = JSON.parse(event.data) as { type?: string; apiKey?: string; language?: string };
          if (message.type === 'start_session') {
            if (!message.apiKey?.trim()) {
              this.sendClient({ type: 'error', error: 'Missing Gladia API key' });
              server.close(1008, 'Missing Gladia API key');
              return;
            }
            this.sessionStarted = true;
            this.ctx.waitUntil(this.connectToGladia(message.apiKey, message.language || 'auto'));
            return;
          }
        } catch {
          // Treat non-JSON frames as audio after the session is initialized.
        }
      }

      if (this.upstream?.readyState === WebSocket.OPEN) {
        this.sendUpstream(event.data);
      } else {
        this.pendingMessages.push(event.data);
      }
    });

    server.addEventListener('close', () => {
      this.upstream?.close(1000, 'Client disconnected');
      this.upstream = null;
      this.clientSocket = null;
    });

    server.addEventListener('error', () => {
      this.upstream?.close(1011, 'Client socket error');
      this.upstream = null;
    });

    return new Response(null, { status: 101, webSocket: client });
  }

  private async connectToGladia(apiKey: string, language: string): Promise<void> {
    try {
      const languages = language === 'auto' ? [] : [language];
      const response = await fetch('https://api.gladia.io/v2/live', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-gladia-key': apiKey,
        },
        body: JSON.stringify({
          model: 'solaria-1',
          encoding: 'wav/pcm',
          sample_rate: 16000,
          bit_depth: 16,
          channels: 1,
          messages_config: { receive_partial_transcripts: true },
          language_config: { languages, code_switching: language === 'auto' },
        }),
      });

      const session = await response.json<{ url?: string; message?: string; error?: string }>();
      if (!response.ok || !session.url) {
        this.sendClient({ type: 'error', error: session.message || session.error || `Gladia init failed: ${response.status}` });
        this.clientSocket?.close(1011, 'Gladia session initialization failed');
        return;
      }

      const upstream = new WebSocket(session.url);
      this.upstream = upstream;
      upstream.binaryType = 'arraybuffer';
      upstream.addEventListener('open', () => {
        for (const message of this.pendingMessages.splice(0)) this.sendUpstream(message);
      });
      upstream.addEventListener('message', (event) => this.clientSocket?.send(event.data));
      upstream.addEventListener('error', () => this.sendClient({ type: 'error', error: 'Gladia upstream WebSocket failed' }));
      upstream.addEventListener('close', (event) => {
        this.upstream = null;
        this.clientSocket?.close(event.code || 1000, event.reason || 'Gladia session ended');
      });
    } catch (error) {
      this.sendClient({ type: 'error', error: error instanceof Error ? error.message : 'Relay initialization failed' });
      this.clientSocket?.close(1011, 'Relay initialization failed');
    }
  }

  private sendUpstream(data: string | ArrayBuffer): void {
    if (this.upstream?.readyState === WebSocket.OPEN) this.upstream.send(data);
  }

  private sendClient(data: unknown): void {
    if (this.clientSocket?.readyState === WebSocket.OPEN) this.clientSocket.send(JSON.stringify(data));
  }
}
