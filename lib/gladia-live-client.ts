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
  error?: string | { message?: string };
}

export interface GladiaLiveVocabularyEntry {
  value: string;
  pronunciations?: string[];
  intensity?: number;
  language?: string;
}

export class GladiaLiveClient {
  private socket: WebSocket | null = null;
  private intentionalClose = false;
  private stopRequested = false;
  private completeNotified = false;

  constructor(
    private readonly onTranscript: (event: GladiaTranscriptEvent) => void,
    private readonly onError: (message: string) => void,
    private readonly onComplete?: () => void,
  ) {}

  async start(
    apiKey: string,
    language: string,
    terminology: Array<{ source: string; target: string }> = [],
  ): Promise<void> {
    this.intentionalClose = false;
    this.stopRequested = false;
    this.completeNotified = false;
    const relayUrl = process.env.NEXT_PUBLIC_GLADIA_RELAY_URL?.trim();
    if (relayUrl) {
      const wsUrl = relayUrl.replace(/^http/i, 'ws');
      const separator = wsUrl.includes('?') ? '&' : '?';
      await this.connect(`${wsUrl}${separator}language=${encodeURIComponent(language)}`);
      this.socket?.send(JSON.stringify({
        type: 'start_session',
        apiKey,
        language,
        customVocabulary: this.buildCustomVocabulary(terminology, language),
      }));
      return;
    }

    const response = await fetch('/api/gladia/live', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        apiKey,
        language,
        customVocabulary: this.buildCustomVocabulary(terminology, language),
      }),
    });
    const session = await response.json();
    if (!response.ok || !session.success || !session.url) {
      throw new Error(session.error || 'Unable to start Gladia live session');
    }

    await this.connect(session.url);
  }

  private async connect(url: string): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(url);
      this.socket = socket;
      socket.binaryType = 'arraybuffer';
      let opened = false;
      socket.onopen = () => {
        opened = true;
        resolve();
      };
      socket.onerror = () => {
        if (!opened) reject(new Error('Gladia WebSocket connection failed'));
        else this.onError('Gladia WebSocket connection failed');
      };
      socket.onmessage = (event) => void this.handleMessage(event.data);
      socket.onclose = (event) => {
        if (this.socket === socket) this.socket = null;
        const detail = event.reason ? `: ${event.reason}` : '';
        if (!opened) {
          reject(new Error(`Gladia WebSocket closed before it was ready (${event.code})${detail}`));
        } else if (!this.intentionalClose && event.code !== 1000) {
          this.onError(`Gladia WebSocket closed unexpectedly (${event.code})${detail}`);
        }
        if (this.stopRequested) {
          this.notifyComplete();
        }
      };
    });
  }

  sendAudio(pcmChunk: Uint8Array): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(pcmChunk);
    }
  }

  stop(): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.intentionalClose = true;
      this.stopRequested = true;
      this.socket.send(JSON.stringify({ type: 'stop_recording' }));
    }
  }

  close(): void {
    this.intentionalClose = true;
    this.socket?.close();
    this.socket = null;
  }

  private async handleMessage(rawMessage: unknown): Promise<void> {
    try {
      let text: string;
      if (typeof rawMessage === 'string') {
        text = rawMessage;
      } else if (rawMessage instanceof Blob) {
        text = await rawMessage.text();
      } else if (rawMessage instanceof ArrayBuffer) {
        text = new TextDecoder().decode(rawMessage);
      } else {
        return;
      }

      const message = JSON.parse(text) as GladiaLiveMessage;
      if (message.type === 'transcript' && message.data?.utterance?.text) {
        this.onTranscript({
          id: message.data.id || crypto.randomUUID(),
          text: message.data.utterance.text,
          isFinal: Boolean(message.data.is_final),
          language: message.data.utterance.language,
        });
      } else if (message.type === 'post_final_transcript' || message.type === 'end_session') {
        // Gladia sends post_final_transcript after the last final utterance.
        // Use it as the earliest reliable signal to run post-recording work;
        // the socket close event is only a fallback for relay implementations.
        this.notifyComplete();
      } else if (message.error) {
        const errorMessage = typeof message.error === 'string'
          ? message.error
          : message.error.message;
        this.onError(errorMessage || `Gladia live transcription failed (${message.type || 'unknown error'})`);
      }
    } catch {
      // Ignore non-JSON lifecycle frames.
    }
  }

  private buildCustomVocabulary(
    terminology: Array<{ source: string; target: string }>,
    language: string,
  ): GladiaLiveVocabularyEntry[] {
    return terminology.reduce<GladiaLiveVocabularyEntry[]>((entries, item) => {
      const value = item.target.trim();
      if (!value) return entries;

      const pronunciations = item.source
        .split(/[，,、/;；\n]+/g)
        .map(part => part.trim())
        .filter(Boolean);
      const entry: GladiaLiveVocabularyEntry = { value };
      if (pronunciations.length > 0) entry.pronunciations = pronunciations;
      if (language && language !== 'auto') entry.language = language;
      entries.push(entry);
      return entries;
    }, []);
  }

  private notifyComplete(): void {
    if (this.completeNotified) return;
    this.completeNotified = true;
    this.stopRequested = false;
    this.onComplete?.();
  }
}
