import { extname, resolve } from "node:path";
import { existsSync } from "node:fs";
import {
  createCommandRouter,
  defaultVoiceCommands,
  type CommandMatch,
} from "../commands";
import {
  commandGrammar,
  defaultVoskLibraryPath,
  defaultVoskModelPath,
  loadVosk,
  openVoskModel,
  type RecognitionChunk,
  type VoskRecognizer,
} from "../vosk";

type WsData = {
  id: string;
  active: boolean;
  bytes: number;
  chunks: number;
  lastPartial: string;
  recognizer?: VoskRecognizer;
  sampleRate: number;
  startedAt?: number;
};

type StartRecognizerOptions = {
  sampleRate: number;
  useGrammar: boolean;
  grammar?: string[];
  words?: boolean;
};

type VoiceSocket = Bun.ServerWebSocket<WsData>;

const HOST = Bun.env.HOST ?? "127.0.0.1";
const PORT = numberFromEnv("PORT", 4765);
const DEFAULT_SAMPLE_RATE = numberFromEnv("VOICE_SAMPLE_RATE", 16_000);
const LOG_LEVEL = numberFromEnv("VOSK_LOG_LEVEL", -1);
const USE_GRAMMAR = Bun.env.VOICE_GRAMMAR !== "0";
const WEB_ROOT = import.meta.dir;

const router = createCommandRouter(defaultVoiceCommands);
const grammar = USE_GRAMMAR ? commandGrammar(router.recognitionPhrases) : undefined;
const libraryPath = defaultVoskLibraryPath();
const modelPath = defaultVoskModelPath();
const library = loadVosk(libraryPath);
library.symbols.vosk_set_log_level(LOG_LEVEL);
const model = openVoskModel(modelPath, library);
const sockets = new Set<VoiceSocket>();

const server = Bun.serve<WsData>({
  hostname: HOST,
  port: PORT,
  fetch(req, srv) {
    return handleRequest(req, srv);
  },
  websocket: {
    idleTimeout: 0,
    sendPings: true,
    open(ws) {
      sockets.add(ws);
      send(ws, {
        type: "ready",
        id: ws.data.id,
        config: serviceConfig(),
      });
      console.log(`[voice] ws open id=${ws.data.id}`);
    },
    message(ws, raw) {
      void handleWsMessage(ws, raw);
    },
    close(ws, code, reason) {
      void closeRecognizer(ws, false, false);
      sockets.delete(ws);
      console.log(`[voice] ws close id=${ws.data.id} code=${code} reason="${reason}"`);
    },
  },
});

console.log(`[voice] playground -> http://${server.hostname}:${server.port}`);
console.log(`[voice] model=${modelPath}`);
console.log(`[voice] lib=${libraryPath}`);

process.once("SIGINT", () => shutdown(130));
process.once("SIGTERM", () => shutdown(143));

async function handleRequest(
  req: Request,
  srv: Bun.Server<WsData>,
): Promise<Response | undefined> {
  const url = new URL(req.url);

  if (url.pathname === "/ws") {
    const upgraded = srv.upgrade(req, {
      data: {
        id: crypto.randomUUID(),
        active: false,
        bytes: 0,
        chunks: 0,
        lastPartial: "",
        sampleRate: DEFAULT_SAMPLE_RATE,
      },
    });
    return upgraded ? undefined : text("WebSocket upgrade failed", 426);
  }

  if (url.pathname === "/health") {
    return json({ ok: true, service: "@metafor/voice", sockets: sockets.size });
  }

  if (url.pathname === "/api/info") {
    return json({ ok: true, ...serviceConfig() });
  }

  if (url.pathname === "/api/match" && req.method === "POST") {
    return matchCommand(req);
  }

  if (url.pathname === "/" || url.pathname === "/playground") {
    return serveStatic("index.html");
  }

  if (url.pathname === "/styles.css") return serveStatic("styles.css");
  if (url.pathname === "/app.js") return serveStatic("app.js");

  return text("Not found", 404);
}

async function matchCommand(req: Request): Promise<Response> {
  try {
    const body = (await req.json()) as { text?: unknown };
    const text = typeof body.text === "string" ? body.text : "";
    const match = router.match(text);
    return json({ ok: true, match: match ? serializeMatch(match) : null });
  } catch (error) {
    return json(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      400,
    );
  }
}

async function handleWsMessage(ws: VoiceSocket, raw: string | Buffer): Promise<void> {
  if (typeof raw === "string") {
    handleControl(ws, raw);
    return;
  }

  const pcm = toUint8Array(raw);
  if (!pcm?.byteLength) return;

  if (!ws.data.recognizer) {
    await startRecognizer(ws, { sampleRate: DEFAULT_SAMPLE_RATE, useGrammar: USE_GRAMMAR });
  }

  const recognizer = ws.data.recognizer;
  if (!recognizer) return;

  try {
    ws.data.bytes += pcm.byteLength;
    ws.data.chunks += 1;
    const chunk = recognizer.acceptPcm(pcm);
    await emitRecognition(ws, chunk);
  } catch (error) {
    sendError(ws, error);
  }
}

function handleControl(ws: VoiceSocket, raw: string): void {
  let msg: Record<string, unknown>;
  try {
    msg = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    send(ws, { type: "error", error: "invalid_json" });
    return;
  }

  if (msg.type === "start") {
    const customGrammar = normalizeGrammar(msg.grammar);
    void startRecognizer(ws, {
      sampleRate: normalizeSampleRate(msg.sampleRate),
      useGrammar: msg.useGrammar !== false,
      ...(customGrammar ? { grammar: customGrammar } : {}),
      words: msg.words === true,
    });
    return;
  }

  if (msg.type === "stop") {
    void closeRecognizer(ws, true);
    return;
  }

  if (msg.type === "reset") {
    ws.data.recognizer?.reset();
    ws.data.lastPartial = "";
    send(ws, { type: "reset" });
    return;
  }

  if (msg.type === "ping") {
    send(ws, { type: "pong", t: Date.now() });
    return;
  }

  send(ws, { type: "error", error: "unknown_message" });
}

async function startRecognizer(
  ws: VoiceSocket,
  options: StartRecognizerOptions,
): Promise<void> {
  await closeRecognizer(ws, false);
  ws.data.sampleRate = options.sampleRate;
  ws.data.bytes = 0;
  ws.data.chunks = 0;
  ws.data.lastPartial = "";
  ws.data.startedAt = Date.now();
  ws.data.active = true;
  ws.data.recognizer = model.createRecognizer({
    sampleRate: options.sampleRate,
    grammar: options.grammar ?? (options.useGrammar ? grammar : undefined),
    words: options.words,
  });

  send(ws, {
    type: "started",
    sampleRate: options.sampleRate,
    grammar: !!(options.grammar ?? (options.useGrammar ? grammar : undefined)),
  });
}

async function closeRecognizer(
  ws: VoiceSocket,
  emitFinal: boolean,
  notify = true,
): Promise<void> {
  const recognizer = ws.data.recognizer;
  if (!recognizer) return;

  if (emitFinal) {
    try {
      const final = recognizer.finalResult();
      await emitRecognition(ws, final);
    } catch (error) {
      sendError(ws, error);
    }
  }

  recognizer.close();
  ws.data.recognizer = undefined;
  ws.data.active = false;
  if (notify) {
    send(ws, {
      type: "stopped",
      bytes: ws.data.bytes,
      chunks: ws.data.chunks,
      durationMs: ws.data.startedAt ? Date.now() - ws.data.startedAt : 0,
    });
  }
}

async function emitRecognition(ws: VoiceSocket, chunk: RecognitionChunk): Promise<void> {
  if (chunk.kind === "partial") {
    if (chunk.text === ws.data.lastPartial) return;
    ws.data.lastPartial = chunk.text;
    send(ws, {
      type: "partial",
      text: chunk.text,
      json: chunk.json,
    });
    return;
  }

  ws.data.lastPartial = "";
  send(ws, {
    type: chunk.kind,
    text: chunk.text,
    json: chunk.json,
  });

  if (!chunk.text) return;

  const match = await router.dispatch(chunk.text);
  if (!match) return;

  send(ws, {
    type: "command",
    match: serializeMatch(match),
  });
}

function serializeMatch(match: CommandMatch) {
  return {
    id: match.command.id,
    phrase: match.phrase,
    kind: match.kind,
    distance: match.distance,
    normalizedText: match.normalizedText,
    normalizedPhrase: match.normalizedPhrase,
  };
}

function serviceConfig() {
  return {
    modelPath,
    libraryPath,
    defaultSampleRate: DEFAULT_SAMPLE_RATE,
    grammar: USE_GRAMMAR,
    phrases: router.recognitionPhrases,
  };
}

function serveStatic(fileName: string): Response {
  const path = resolve(WEB_ROOT, fileName);
  if (!path.startsWith(WEB_ROOT) || !existsSync(path)) return text("Not found", 404);
  return new Response(Bun.file(path), {
    headers: {
      "Content-Type": contentTypeFor(path),
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

function contentTypeFor(path: string): string {
  switch (extname(path)) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    default:
      return "application/octet-stream";
  }
}

function toUint8Array(value: unknown): Uint8Array | null {
  if (value instanceof Uint8Array) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }

  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value);
  }

  return null;
}

function normalizeSampleRate(value: unknown): number {
  const sampleRate = Number(value ?? DEFAULT_SAMPLE_RATE);
  if (!Number.isFinite(sampleRate) || sampleRate < 8_000 || sampleRate > 96_000) {
    return DEFAULT_SAMPLE_RATE;
  }
  return Math.round(sampleRate);
}

function normalizeGrammar(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const phrases = value
    .map((item) => typeof item === "string" ? item.trim() : "")
    .filter(Boolean);
  if (phrases.length === 0) return undefined;
  return [...new Set([...phrases, "[unk]"])];
}

function numberFromEnv(name: string, fallback: number): number {
  const value = Number(Bun.env[name] ?? fallback);
  return Number.isFinite(value) ? value : fallback;
}

function json(payload: unknown, status = 200): Response {
  return Response.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

function text(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

function send(ws: VoiceSocket, payload: unknown): void {
  try {
    ws.send(JSON.stringify(payload));
  } catch (error) {
    console.error("[voice] ws send failed", error);
  }
}

function sendError(ws: VoiceSocket, error: unknown): void {
  send(ws, {
    type: "error",
    error: error instanceof Error ? error.message : String(error),
  });
}

function shutdown(exitCode: number): void {
  for (const ws of sockets) {
    void closeRecognizer(ws, false, false);
    ws.close(1001, "server shutdown");
  }

  model.close();
  library.close();
  process.exit(exitCode);
}
