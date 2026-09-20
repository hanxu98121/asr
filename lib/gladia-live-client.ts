export interface GladiaTranscriptEvent {
  id: string;
  text: string;
  isFinal: boolean;
  language?: string;
}

interface GladiaLiveMessage {
  type?: string;
  data?: {
    id?: string;
    is_final?: boolean;
    utterance?: { text?: string; language?: string };
  };
  error?: string;
}

export class GladiaLiveClient {
  private socket: WebSocket | null = null;

  constructor(
    private readonly onTranscript: (event: GladiaTranscriptEvent) => void,
    private readonly onError: (message: string) => void,
  ) {}

  async start(apiKey: string, language: string): Promise<void> {
    const response = await fetch('/api/gladia/live', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey, language }),
    });
    const session = await response.json();
    if (!response.ok || !session.success || !session.url) {
      throw new Error(session.error || 'Unable to start Gladia live session');
    }

    await new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(session.url);
      this.socket = socket;
      socket.binaryType = 'arraybuffer';
      socket.onopen = () => resolve();
      socket.onerror = () => reject(new Error('Gladia WebSocket connection failed'));
      socket.onmessage = (event) => this.handleMessage(event.data);
      socket.onclose = () => {
        if (this.socket === socket) this.socket = null;
      };
    });
  }

  sendAudio(pcmChunk: ArrayBuffer): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(pcmChunk);
    }
  }

  stop(): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ type: 'stop_recording' }));
    }
  }

  close(): void {
    this.socket?.close();
    this.socket = null;
  }

  private handleMessage(rawMessage: unknown): void {
    if (typeof rawMessage !== 'string') return;
    try {
      const message = JSON.parse(rawMessage) as GladiaLiveMessage;
      if (message.type === 'transcript' && message.data?.utterance?.text) {
        this.onTranscript({
          id: message.data.id || crypto.randomUUID(),
          text: message.data.utterance.text,
          isFinal: Boolean(message.data.is_final),
          language: message.data.utterance.language,
        });
      } else if (message.type === 'error') {
        this.onError(message.error || 'Gladia live transcription failed');
      }
    } catch {
      // Ignore non-JSON lifecycle frames.
    }
  }
}
